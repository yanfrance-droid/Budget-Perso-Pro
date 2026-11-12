import { describe, it, expect } from 'vitest';
import { computeContractIntegrity, isTemplateActiveForMonth } from './contractIntegrityEngine';
import type { RecurrenceTemplate, Transaction } from '../db/database';

describe('contractIntegrityEngine - Audit granulaire par rubrique et gestion des écarts', () => {
  const dummyTemplates: RecurrenceTemplate[] = [
    {
      id: 'tmpl-fixed-1',
      label: 'Loyer',
      type: 'fixed_expense',
      amount: 800,
      recurrenceDay: 5,
      startDate: '2026-01',
      isActive: true,
      accountId: 'acc1'
    },
    {
      id: 'tmpl-fixed-2',
      label: 'Internet',
      type: 'fixed_expense',
      amount: 40,
      recurrenceDay: 10,
      startDate: '2026-01',
      isActive: true,
      accountId: 'acc1'
    },
    {
      id: 'tmpl-var-1',
      label: 'Courses hebdo',
      type: 'variable_expense',
      amount: 150,
      recurrenceDay: 7,
      startDate: '2026-01',
      isActive: true,
      accountId: 'acc1'
    },
    {
      id: 'tmpl-inc-1',
      label: 'Salaire Principal',
      type: 'income',
      amount: 2500,
      recurrenceDay: 28,
      startDate: '2026-01',
      isActive: true,
      accountId: 'acc1'
    }
  ];

  it('valide isTemplateActiveForMonth avec les différentes dates d\'effet et de fin', () => {
    const tmpl: RecurrenceTemplate = {
      id: 't1',
      label: 'Test',
      type: 'fixed_expense',
      amount: 10,
      recurrenceDay: 1,
      startDate: '2026-03',
      endDate: '2026-06',
      isActive: true,
      accountId: 'acc1'
    };

    expect(isTemplateActiveForMonth(tmpl, '2026-02')).toBe(false); // Avant startDate
    expect(isTemplateActiveForMonth(tmpl, '2026-03')).toBe(true);  // Mois de début
    expect(isTemplateActiveForMonth(tmpl, '2026-05')).toBe(true);  // En plein dedans
    expect(isTemplateActiveForMonth(tmpl, '2026-06')).toBe(true);  // Mois de fin inclus
    expect(isTemplateActiveForMonth(tmpl, '2026-07')).toBe(false); // Après endDate
  });

  it('calcule la conformité totale 100% quand toutes les rubriques sont peuplées', () => {
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-11-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'planned'
      },
      {
        id: 'tx2',
        templateId: 'tmpl-fixed-2',
        label: 'Internet',
        type: 'fixed_expense',
        amount: 40,
        date: '2026-11-10',
        recurrenceDay: 10,
        accountId: 'acc1',
        status: 'planned'
      },
      {
        id: 'tx3',
        templateId: 'tmpl-var-1',
        label: 'Courses hebdo',
        type: 'variable_expense',
        amount: 150,
        date: '2026-11-07',
        recurrenceDay: 7,
        accountId: 'acc1',
        status: 'planned'
      },
      {
        id: 'tx4',
        templateId: 'tmpl-inc-1',
        label: 'Salaire Principal',
        type: 'income',
        amount: 2500,
        date: '2026-11-28',
        recurrenceDay: 28,
        accountId: 'acc1',
        status: 'planned'
      }
    ];

    const report = computeContractIntegrity(dummyTemplates, transactions, '2026-11');

    expect(report.isFullyCompliant).toBe(true);
    expect(report.totalExpected).toBe(4);
    expect(report.totalFound).toBe(4);
    expect(report.totalMissing).toBe(0);
    expect(report.totalMissingAmount).toBe(0);

    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.fixedExpenses.totalExpected).toBe(2);
    expect(report.sections.fixedExpenses.totalFound).toBe(2);

    expect(report.sections.variableExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.variableExpenses.totalExpected).toBe(1);
    expect(report.sections.variableExpenses.totalFound).toBe(1);

    expect(report.sections.incomes.isFullyCompliant).toBe(true);
    expect(report.sections.incomes.totalExpected).toBe(1);
    expect(report.sections.incomes.totalFound).toBe(1);
  });

  it('détecte un écart spécifique sur une rubrique et liste le contrat manquant', () => {
    // Il manque Internet (tmpl-fixed-2, 40 €)
    const partialTransactions: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-11-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'planned'
      },
      {
        id: 'tx3',
        templateId: 'tmpl-var-1',
        label: 'Courses hebdo',
        type: 'variable_expense',
        amount: 150,
        date: '2026-11-07',
        recurrenceDay: 7,
        accountId: 'acc1',
        status: 'planned'
      },
      {
        id: 'tx4',
        templateId: 'tmpl-inc-1',
        label: 'Salaire Principal',
        type: 'income',
        amount: 2500,
        date: '2026-11-28',
        recurrenceDay: 28,
        accountId: 'acc1',
        status: 'planned'
      }
    ];

    const report = computeContractIntegrity(dummyTemplates, partialTransactions, '2026-11');

    expect(report.isFullyCompliant).toBe(false);
    expect(report.totalMissing).toBe(1);
    expect(report.totalMissingAmount).toBe(40);

    // Rubrique charges fixes en alerte
    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(false);
    expect(report.sections.fixedExpenses.totalExpected).toBe(2);
    expect(report.sections.fixedExpenses.totalFound).toBe(1);
    expect(report.sections.fixedExpenses.missingCount).toBe(1);
    expect(report.sections.fixedExpenses.missingItems[0].label).toBe('Internet');
    expect(report.sections.fixedExpenses.missingItems[0].amount).toBe(40);

    // Les autres rubriques restent conformes
    expect(report.sections.variableExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.incomes.isFullyCompliant).toBe(true);
  });

  it('gère l\'arbitrage : un écart accepté bascule le statut en conforme avec mention d\'exception', () => {
    // Internet manque toujours
    const partialTransactions: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-11-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'planned'
      }
    ];

    // Exception acceptée pour Internet sur 2026-11
    const acceptedExceptions = {
      'tmpl-fixed-2_2026-11': true
    };

    const report = computeContractIntegrity(
      dummyTemplates.filter(t => t.type === 'fixed_expense'),
      partialTransactions,
      '2026-11',
      acceptedExceptions
    );

    // L'écart a été accepté : missingCount = 0, acceptedCount = 1, statut compliant !
    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.fixedExpenses.missingCount).toBe(0);
    expect(report.sections.fixedExpenses.acceptedCount).toBe(1);
    expect(report.sections.fixedExpenses.acceptedItems[0].label).toBe('Internet');
  });

  it('détecte un doublon de transaction rattaché au même templateId et invalide la conformité', () => {
    // 2 transactions sur le template Loyer (tmpl-fixed-1)
    const duplicateTransactions: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-11-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'cleared'
      },
      {
        id: 'tx1_dup',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer (copie)',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-11-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'cleared'
      },
      {
        id: 'tx2',
        templateId: 'tmpl-fixed-2',
        label: 'Internet',
        type: 'fixed_expense',
        amount: 40,
        date: '2026-11-10',
        recurrenceDay: 10,
        accountId: 'acc1',
        status: 'planned'
      }
    ];

    const report = computeContractIntegrity(
      dummyTemplates.filter(t => t.type === 'fixed_expense'),
      duplicateTransactions,
      '2026-11'
    );

    // Bien que 2/2 templates soient trouvés, il y a 3 transactions pour 2 contrats -> NON CONFORME !
    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(false);
    expect(report.sections.fixedExpenses.totalExpected).toBe(2);
    expect(report.sections.fixedExpenses.totalTransactionsCount).toBe(3);
    expect(report.sections.fixedExpenses.duplicateCount).toBe(1);
    expect(report.sections.fixedExpenses.duplicateItems.length).toBe(1);
    expect(report.sections.fixedExpenses.duplicateItems[0].templateId).toBe('tmpl-fixed-1');
    expect(report.sections.fixedExpenses.duplicateItems[0].count).toBe(2);
  });

  it('fidélité historique : une transaction avec templateId = NULL (contrat résilié ultérieurement) incrémente totalExpected et totalFound (ex: 23/23 en Octobre)', () => {
    // 2 contrats actifs attendus (Loyer et Internet) et 1 facture passée détachée (templateId = null, ex: contrat résilié ultérieurement)
    const transactionsWithUnlinked: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-1',
        label: 'Loyer',
        type: 'fixed_expense',
        amount: 800,
        date: '2026-10-05',
        recurrenceDay: 5,
        accountId: 'acc1',
        status: 'cleared'
      },
      {
        id: 'tx2',
        templateId: 'tmpl-fixed-2',
        label: 'Internet',
        type: 'fixed_expense',
        amount: 40,
        date: '2026-10-10',
        recurrenceDay: 10,
        accountId: 'acc1',
        status: 'cleared'
      },
      {
        id: 'tx3_detached_bill',
        templateId: null as any,
        label: 'Ancien abonnement résilié',
        type: 'fixed_expense',
        amount: 50,
        date: '2026-10-15',
        accountId: 'acc1',
        status: 'cleared'
      }
    ];

    const report = computeContractIntegrity(
      dummyTemplates.filter(t => t.type === 'fixed_expense'),
      transactionsWithUnlinked,
      '2026-10'
    );

    // Les 2 contrats attendus + 1 facture historique = 3 attendues et 3 trouvées (3/3 à 100 % conforme !)
    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.fixedExpenses.totalExpected).toBe(3);
    expect(report.sections.fixedExpenses.totalFound).toBe(3);
    expect(report.sections.fixedExpenses.missingCount).toBe(0);
    expect(report.sections.fixedExpenses.duplicateCount).toBe(0);
    expect(report.sections.fixedExpenses.surplusCount).toBe(0);
  });

  it('détecte un doublon hybride par libellé normalisé, montant et date même si l\'une a templateId = NULL', () => {
    const transactionsWithHybridDup: Transaction[] = [
      {
        id: 'tx1',
        templateId: 'tmpl-fixed-2',
        label: 'Internet.',
        type: 'fixed_expense',
        amount: 40,
        date: '2026-10-10',
        recurrenceDay: 10,
        accountId: 'acc1',
        status: 'cleared'
      },
      {
        id: 'tx2_detached_duplicate',
        templateId: null as any,
        label: 'internet',
        type: 'fixed_expense',
        amount: 40,
        date: '2026-10-10',
        accountId: 'acc1',
        status: 'cleared'
      }
    ];

    const report = computeContractIntegrity(
      dummyTemplates.filter(t => t.id === 'tmpl-fixed-2'),
      transactionsWithHybridDup,
      '2026-10'
    );

    // Un doublon hybride doit être détecté et invalider la conformité
    expect(report.sections.fixedExpenses.isFullyCompliant).toBe(false);
    expect(report.sections.fixedExpenses.totalExpected).toBe(1);
    expect(report.sections.fixedExpenses.totalFound).toBe(1);
    expect(report.sections.fixedExpenses.duplicateCount).toBe(1);
    expect(report.sections.fixedExpenses.duplicateItems.length).toBe(1);
    expect(report.sections.fixedExpenses.duplicateItems[0].label).toBe('Internet.');
    expect(report.sections.fixedExpenses.duplicateItems[0].count).toBe(2);
    expect(report.sections.fixedExpenses.duplicateItems[0].dates).toContain('2026-10-10');
  });

  it('ignore strictement les opérations purement ponctuelles (templateId = NULL et recurrenceDay = NULL) pour variable_expense et income', () => {
    const mixedTxs: Transaction[] = [
      // 1 variable récurrente liée
      {
        id: 'tx_var_recurrent',
        templateId: 'tmpl-var-1',
        label: 'Courses hebdo',
        type: 'variable_expense',
        amount: 150,
        date: '2026-11-07',
        recurrenceDay: 7,
        accountId: 'acc1',
        status: 'planned'
      },
      // 1 variable ponctuelle (ex: plein de Gazoil imprévu) -> doit être ignorée par le Watchdog
      {
        id: 'tx_var_onoff',
        templateId: null as any,
        recurrenceDay: null as any,
        label: 'Gazoil ponctuel',
        type: 'variable_expense',
        amount: 32.76,
        date: '2026-11-01',
        accountId: 'acc1',
        status: 'cleared'
      },
      // 1 revenu récurrent lié
      {
        id: 'tx_inc_recurrent',
        templateId: 'tmpl-inc-1',
        label: 'Salaire Principal',
        type: 'income',
        amount: 2500,
        date: '2026-11-28',
        recurrenceDay: 28,
        accountId: 'acc1',
        status: 'planned'
      },
      // 1 revenu ponctuel (ex: virement exceptionnel d'épargne) -> doit être ignoré par le Watchdog
      {
        id: 'tx_inc_onoff',
        templateId: null as any,
        recurrenceDay: null as any,
        label: "Rentrée d'épargne ponctuelle",
        type: 'income',
        amount: 1860.58,
        date: '2026-11-06',
        accountId: 'acc1',
        status: 'cleared'
      }
    ];

    const report = computeContractIntegrity(
      dummyTemplates,
      mixedTxs,
      '2026-11'
    );

    // Variable expenses : 1 attendu (Courses hebdo), Gazoil ponctuel ignoré -> 1/1 à 100 % conforme
    expect(report.sections.variableExpenses.isFullyCompliant).toBe(true);
    expect(report.sections.variableExpenses.totalExpected).toBe(1);
    expect(report.sections.variableExpenses.totalFound).toBe(1);
    expect(report.sections.variableExpenses.duplicateCount).toBe(0);

    // Incomes : 1 attendu (Salaire Principal), Rentrée d'épargne ponctuelle ignorée -> 1/1 à 100 % conforme
    expect(report.sections.incomes.isFullyCompliant).toBe(true);
    expect(report.sections.incomes.totalExpected).toBe(1);
    expect(report.sections.incomes.totalFound).toBe(1);
    expect(report.sections.incomes.duplicateCount).toBe(0);
  });
});
