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
});
