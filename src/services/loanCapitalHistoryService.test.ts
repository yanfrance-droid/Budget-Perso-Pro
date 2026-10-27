import { describe, it, expect } from 'vitest';
import { 
  getLoanCapitalHistory, 
  getLoanCapitalYearTicks,
  checkLastHistoricalDiscrepancy,
  getEffectiveLoanEndMonth,
  isLoanEligibleForMonth,
  type LoanCapitalRecordInput
} from './loanCapitalHistoryService';
import type { Loan } from '../db/database';

describe('loanCapitalHistoryService — Moteur générique multi-utilisateurs', () => {

  const sampleHistory: LoanCapitalRecordInput[] = [
    { month: '2022-01', realEstateCapital: 150000, realEstateMonthlyPayment: 800, consumerCapital: null, consumerMonthlyPayment: null },
    { month: '2022-02', realEstateCapital: 149500, realEstateMonthlyPayment: 800, consumerCapital: null, consumerMonthlyPayment: null },
    { month: '2022-03', realEstateCapital: 149000, realEstateMonthlyPayment: 800, consumerCapital: 10000, consumerMonthlyPayment: 200 },
    { month: '2022-04', realEstateCapital: 148500, realEstateMonthlyPayment: 800, consumerCapital: 9850, consumerMonthlyPayment: 200 }
  ];

  it('1. Conservation exacte des valeurs historiques réelles sans recalcul ni interpolation', () => {
    const result = getLoanCapitalHistory([], [], '2022-04', { historyRecords: sampleHistory });
    expect(result).toHaveLength(4);

    expect(result[0].month).toBe('2022-01');
    expect(result[0].realEstateCapital).toBe(150000);
    expect(result[0].mortgageMonthlyPayment).toBe(800);
    expect(result[0].isForecast).toBe(false);

    expect(result[3].month).toBe('2022-04');
    expect(result[3].realEstateCapital).toBe(148500);
    expect(result[3].consumerCapital).toBe(9850);
    expect(result[3].totalMonthlyPayment).toBe(1000); // 800 + 200
    expect(result[3].isForecast).toBe(false);
  });

  it('2. Gestion des périodes où l\'historique de consommation n\'existe pas encore (null)', () => {
    const result = getLoanCapitalHistory([], [], '2022-04', { historyRecords: sampleHistory });
    
    // Janvier et Février 2022 n'ont pas de crédit conso
    expect(result[0].consumerCapital).toBeNull();
    expect(result[0].consumerMonthlyPayment).toBeNull();
    expect(result[1].consumerCapital).toBeNull();
    expect(result[1].consumerMonthlyPayment).toBeNull();

    // Mars 2022 : démarrage du crédit conso
    expect(result[2].consumerCapital).toBe(10000);
    expect(result[2].consumerMonthlyPayment).toBe(200);
  });

  it('3. Fonctionne avec n\'importe quelles dates d\'historique (dates libres dépendant de l\'utilisateur)', () => {
    const customUserHistory: LoanCapitalRecordInput[] = [
      { month: '2015-06', realEstateCapital: 250000, realEstateMonthlyPayment: 1200, consumerCapital: null, consumerMonthlyPayment: null },
      { month: '2015-07', realEstateCapital: 249200, realEstateMonthlyPayment: 1200, consumerCapital: null, consumerMonthlyPayment: null }
    ];

    const result = getLoanCapitalHistory([], [], '2015-07', { historyRecords: customUserHistory });
    expect(result).toHaveLength(2);
    expect(result[0].month).toBe('2015-06');
    expect(result[1].month).toBe('2015-07');
  });

  it('4. Complétion au fil de l\'eau des mois réels jusqu\'au mois courant sans projection future', () => {
    const history: LoanCapitalRecordInput[] = [
      { month: '2024-12', realEstateCapital: 100000, realEstateMonthlyPayment: 600, consumerCapital: 15000, consumerMonthlyPayment: 400 }
    ];

    const loans: Loan[] = [
      {
        id: 'l-immo',
        name: 'Prêt Immo',
        lender: 'Banque A',
        initialAmount: 120000,
        remainingCapital: 100000,
        monthlyPayment: 600,
        startDate: '2020-01-01',
        endDate: '2025-02-28',
        durationMonths: 60,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'mortgage'
      },
      {
        id: 'l-conso1',
        name: 'Prêt Auto',
        lender: 'Banque B',
        initialAmount: 10000,
        remainingCapital: 8000,
        monthlyPayment: 250,
        startDate: '2023-01-01',
        endDate: '2025-02-28',
        durationMonths: 24,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'consumer'
      },
      {
        id: 'l-conso2',
        name: 'Prêt Travaux',
        lender: 'Banque C',
        initialAmount: 7000,
        remainingCapital: 7000,
        monthlyPayment: 150,
        startDate: '2024-01-01',
        endDate: '2025-01-31',
        durationMonths: 12,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'consumer'
      }
    ];

    // Quand le temps s'écoule jusqu'à 2025-02 (currentMonth = '2025-02') :
    // Les mois réels 2025-01 et 2025-02 se complètent au fil de l'eau, mais AUCUN mois futur (ex: 2025-03) n'est généré
    const result = getLoanCapitalHistory(loans, [], '2025-02', { historyRecords: history });

    expect(result).toHaveLength(3);
    expect(result[0].month).toBe('2024-12');
    expect(result[1].month).toBe('2025-01');
    expect(result[2].month).toBe('2025-02');
    // Vérification de la règle absolue : aucun mois strictement supérieur à currentMonth
    expect(result.some(r => r.month > '2025-02')).toBe(false);

    // Mois 2025-01 : les deux crédits conso sont actifs (250 + 150 = 400 €)
    const jan25 = result.find(r => r.month === '2025-01')!;
    expect(jan25.mortgageMonthlyPayment).toBe(600);
    expect(jan25.consumerMonthlyPayment).toBe(400);

    // Mois 2025-02 : Prêt travaux terminé, seul prêt auto actif (250 €)
    const feb25 = result.find(r => r.month === '2025-02')!;
    expect(feb25.consumerMonthlyPayment).toBe(250);
  });

  it('5. Exclusion rigoureuse des prêts archivés, désactivés et soldés lors du suivi au fil de l\'eau', () => {
    const history: LoanCapitalRecordInput[] = [
      { month: '2024-12', realEstateCapital: 50000, realEstateMonthlyPayment: 400, consumerCapital: 0, consumerMonthlyPayment: 0 }
    ];

    const loans: Loan[] = [
      {
        id: 'l-archived',
        name: 'Crédit Archivé',
        lender: 'Banque X',
        initialAmount: 5000,
        remainingCapital: 2000,
        monthlyPayment: 100,
        startDate: '2024-01-01',
        endDate: '2025-03-31',
        durationMonths: 15,
        accountId: 'acc-1',
        isArchived: true,
        loanType: 'consumer'
      },
      {
        id: 'l-disabled',
        name: 'Crédit Désactivé',
        lender: 'Banque Y',
        initialAmount: 4000,
        remainingCapital: 1500,
        monthlyPayment: 80,
        startDate: '2024-01-01',
        endDate: '2025-03-31',
        durationMonths: 15,
        accountId: 'acc-1',
        isArchived: true,
        loanType: 'consumer'
      },
      {
        id: 'l-solde',
        name: 'Crédit Soldé par anticipation',
        lender: 'Banque Z',
        initialAmount: 3000,
        remainingCapital: 0,
        monthlyPayment: 90,
        startDate: '2024-01-01',
        endDate: '2025-03-31',
        durationMonths: 15,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'consumer'
      },
      {
        id: 'l-actif',
        name: 'Crédit Actif',
        lender: 'Banque W',
        initialAmount: 6000,
        remainingCapital: 5000,
        monthlyPayment: 150,
        startDate: '2024-01-01',
        endDate: '2025-03-31',
        durationMonths: 15,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'consumer'
      }
    ];

    // Quand le temps s'écoule jusqu'à 2025-01 (currentMonth = '2025-01') :
    const result = getLoanCapitalHistory(loans, [], '2025-01', { historyRecords: history });
    const jan25 = result.find(r => r.month === '2025-01')!;

    // Seul le prêt actif contribue (150 €)
    expect(jan25.consumerMonthlyPayment).toBe(150);
    expect(jan25.consumerCapital).toBe(5000);
    // Aucun mois après 2025-01
    expect(result.some(r => r.month > '2025-01')).toBe(false);
  });

  it('6. Calcul de date de fin effective avec prepaidInstallments et monthsAdjustment', () => {
    const loanWithAdjustment: Loan = {
      id: 'l-adj',
      name: 'Prêt avec mensualités prépayées',
      lender: 'Banque',
      initialAmount: 10000,
      remainingCapital: 5000,
      monthlyPayment: 200,
      startDate: '2024-01-01',
      durationMonths: 24, // Fin théorique 2025-12
      prepaidInstallments: 12, // 12 mensualités déjà payées
      monthsAdjustment: 2, // Ajustement de 2 mois supplémentaires
      accountId: 'acc-1',
      isArchived: false,
      loanType: 'consumer'
    };

    // Durée restante = 24 - 12 - 2 = 10 mois.
    // Démarrage 2024-01 -> fin effective : 2024-10
    const endMonth = getEffectiveLoanEndMonth(loanWithAdjustment);
    expect(endMonth).toBe('2024-10');
  });

  it('7. Détection et rapport d\'écart (checkLastHistoricalDiscrepancy) sans altération de données', () => {
    const history: LoanCapitalRecordInput[] = [
      { month: '2026-09', realEstateCapital: 120000, consumerCapital: 8500 }
    ];

    const loans: Loan[] = [
      {
        id: 'l-immo',
        name: 'Prêt Immo',
        lender: 'Banque',
        initialAmount: 150000,
        remainingCapital: 120000, // Correspond exactement (écart 0)
        monthlyPayment: 800,
        startDate: '2020-01-01',
        endDate: '2028-12-31',
        durationMonths: 96,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'mortgage'
      },
      {
        id: 'l-conso',
        name: 'Prêt Auto',
        lender: 'Banque',
        initialAmount: 10000,
        remainingCapital: 9000, // Écart de 500 € par rapport au réel constaté (8500 €)
        monthlyPayment: 200,
        startDate: '2024-01-01',
        endDate: '2027-12-31',
        durationMonths: 48,
        accountId: 'acc-1',
        isArchived: false,
        loanType: 'consumer'
      }
    ];

    const report = checkLastHistoricalDiscrepancy(history, loans);
    expect(report).not.toBeNull();
    expect(report?.month).toBe('2026-09');
    expect(report?.realEstateDiscrepancy).toBe(0); // Parfaitement aligné
    expect(report?.consumerHistorical).toBe(8500);
    expect(report?.consumerLoansSum).toBe(9000);
    expect(report?.consumerDiscrepancy).toBe(500); // Détecté sans toucher aux données
    expect(report?.hasDiscrepancy).toBe(true);

    // Vérifie que l'historique restitué dans le graphique conserve fidèlement 8500 €
    const historyResult = getLoanCapitalHistory(loans, [], '2026-09', { historyRecords: history });
    const sep26 = historyResult.find(r => r.month === '2026-09')!;
    expect(sep26.consumerCapital).toBe(8500); // Donnée réelle certifiée préservée !
  });

  it('8. Graphique en lecture seule : aucune mutation sur les objets sources', () => {
    const loan: Loan = {
      id: 'l-1',
      name: 'Prêt Test',
      lender: 'Banque',
      initialAmount: 10000,
      remainingCapital: 5000,
      monthlyPayment: 200,
      startDate: '2024-01-01',
      endDate: '2024-06-30',
      durationMonths: 6,
      accountId: 'acc-1',
      isArchived: false,
      loanType: 'mortgage'
    };
    const loanCopy = { ...loan };

    getLoanCapitalHistory([loan], [], '2024-01', { 
      historyRecords: [
        { month: '2024-01', realEstateCapital: 5000, realEstateMonthlyPayment: 200 }
      ] 
    });

    // L'objet loan d'origine n'a subi aucune modification
    expect(loan.remainingCapital).toBe(loanCopy.remainingCapital);
    expect(loan.initialAmount).toBe(loanCopy.initialAmount);
  });

  it('10. Comportement si aucun historique réel n\'est présent mais que des crédits existent : trace la courbe à partir des crédits réels', () => {
    const loan: Loan = {
      id: 'l-immo',
      name: 'Prêt Immo Actif',
      lender: 'Banque',
      initialAmount: 100000,
      remainingCapital: 80000,
      monthlyPayment: 500,
      startDate: '2020-01-01',
      endDate: '2026-12-31',
      durationMonths: 84,
      accountId: 'acc-1',
      isArchived: false,
      loanType: 'mortgage'
    };

    // Cas 1 : ni historique ni crédits -> retourne [] (déclenche l'écran vide)
    const resultStrictEmpty = getLoanCapitalHistory([], [], '2026-10', { historyRecords: [] });
    expect(resultStrictEmpty).toHaveLength(0);

    // Cas 2 : aucun historique importé (vide), mais des crédits réels existent dans l'onglet Crédits
    // Le graphique ne doit PAS être vide : il trace la courbe à partir du mois courant avec les prêts réels
    const resultWithLoans = getLoanCapitalHistory([loan], [], '2026-10', { historyRecords: [] });
    expect(resultWithLoans.length).toBeGreaterThan(0);
    expect(resultWithLoans[0].month).toBe('2026-10');
    expect(resultWithLoans[0].realEstateCapital).toBe(80000);
    expect(resultWithLoans[0].mortgageMonthlyPayment).toBe(500);

    // Cas 3 : options non fournies mais des crédits existent
    const resultNoOptions = getLoanCapitalHistory([loan], [], '2026-10');
    expect(resultNoOptions.length).toBeGreaterThan(0);
    expect(resultNoOptions[0].month).toBe('2026-10');
  });

  it('11. Comportement si un historique réel est présent : s\'arrête strictement au mois courant sans projection future', () => {
    const loan: Loan = {
      id: 'l-immo',
      name: 'Prêt Immo Actif',
      lender: 'Banque',
      initialAmount: 100000,
      remainingCapital: 80000,
      monthlyPayment: 500,
      interestRate: 1.0,
      startDate: '2020-01-01',
      endDate: '2026-12-31', // Prêt courant jusqu'en décembre 2026
      durationMonths: 84,
      accountId: 'acc-1',
      isArchived: false,
      loanType: 'mortgage'
    };

    const history: LoanCapitalRecordInput[] = [
      { month: '2026-09', realEstateCapital: 80400, realEstateMonthlyPayment: 500 },
      { month: '2026-10', realEstateCapital: 80000, realEstateMonthlyPayment: 500 }
    ];

    // Mois courant = 2026-10
    const result = getLoanCapitalHistory([loan], [], '2026-10', { historyRecords: history });
    // Doit contenir STRICTEMENT les mois passés et courants (2026-09, 2026-10) et AUCUN mois futur (2026-11, 2026-12)
    expect(result).toHaveLength(2);
    expect(result[0].month).toBe('2026-09');
    expect(result[0].isForecast).toBe(false);
    expect(result[1].month).toBe('2026-10');
    expect(result[1].isForecast).toBe(false);

    // Vérification explicite : aucun mois strictement supérieur à currentMonth n'est généré
    expect(result.some(r => r.month > '2026-10')).toBe(false);
  });

  it('9. Génération des repères temporels (ticks) pour Recharts', () => {
    const records = [
      { month: '2020-01', mortgageCapital: 100000, mortgageMonthlyPayment: 500, consumerCapital: null, consumerMonthlyPayment: null },
      { month: '2021-01', mortgageCapital: 95000, mortgageMonthlyPayment: 500, consumerCapital: null, consumerMonthlyPayment: null },
      { month: '2022-01', mortgageCapital: 90000, mortgageMonthlyPayment: 500, consumerCapital: null, consumerMonthlyPayment: null },
      { month: '2022-06', mortgageCapital: 88000, mortgageMonthlyPayment: 500, consumerCapital: null, consumerMonthlyPayment: null }
    ];

    const ticks = getLoanCapitalYearTicks(records);
    expect(ticks).toContain('2020-01');
    expect(ticks).toContain('2021-01');
    expect(ticks).toContain('2022-01');
    expect(ticks).toContain('2022-06');
  });
});
