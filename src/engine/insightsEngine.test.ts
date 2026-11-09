import { describe, it, expect } from 'vitest';
import type { Transaction, Loan } from '../db/database';
import {
  auditCrashTest,
  auditIdleCash,
  auditDailyExpenseCadence,
  auditEmergencyFund,
  calculateEmergencyFundBaseline,
  auditStalledHealth,
  auditLoanPrepayment,
  generateInsights,
  formatCurrencyFr,
  type InsightsContext
} from './insightsEngine';

describe('insightsEngine - Conseiller Financier & Anticipation', () => {

  describe('1. auditCrashTest (Simulation quotidienne & détection du creux)', () => {
    it('détecte un risque critique de découvert bancaire au 18 du mois avant le salaire du 28', () => {
      const manualBalance = 400; // Solde réel au 10 novembre
      const currentDate = '2026-11-10';

      const pendingTransactions: Transaction[] = [
        { id: 'tx-1', date: '2026-11-12', amount: 150, type: 'fixed_expense', status: 'pending', accountId: 'acc-1' },
        { id: 'tx-2', date: '2026-11-15', amount: 200, type: 'fixed_expense', status: 'planned', accountId: 'acc-1' },
        { id: 'tx-3', date: '2026-11-18', amount: 350, type: 'loan_payment', status: 'planned', accountId: 'acc-1' }, // Creux à -300 € !
        { id: 'tx-salary', date: '2026-11-28', amount: 2500, type: 'income', status: 'planned', accountId: 'acc-1' }
      ];

      const insight = auditCrashTest(manualBalance, pendingTransactions, currentDate);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('critical');
      expect(insight?.category).toBe('crash_test');
      expect(insight?.metadata?.minBalance).toBe(-300);
      expect(insight?.metadata?.minDate).toBe('2026-11-18');
      expect(insight?.message).toContain('-300,00 €');
      expect(insight?.message).toContain('2026-11-18');
      expect(insight?.message).toContain(formatCurrencyFr(2500));
    });

    it('évalue les débits du jour du salaire AVANT le crédit du salaire', () => {
      const manualBalance = 100;
      const currentDate = '2026-11-20';

      // Le 25, un prélèvement de 300 € passe le même jour que le salaire de 2000 €
      const pendingTransactions: Transaction[] = [
        { id: 'tx-debit', date: '2026-11-25', amount: 300, type: 'fixed_expense', status: 'planned', accountId: 'acc-1' },
        { id: 'tx-salary', date: '2026-11-25', amount: 2000, type: 'income', status: 'planned', accountId: 'acc-1' }
      ];

      const insight = auditCrashTest(manualBalance, pendingTransactions, currentDate);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('critical');
      expect(insight?.metadata?.minBalance).toBe(-200);
    });

    it('alerte en warning si le solde réel descend sous 100 € mais reste positif', () => {
      const manualBalance = 250;
      const currentDate = '2026-11-05';

      const pendingTransactions: Transaction[] = [
        { id: 'tx-1', date: '2026-11-10', amount: 210, type: 'fixed_expense', status: 'planned', accountId: 'acc-1' },
        { id: 'tx-2', date: '2026-11-25', amount: 2000, type: 'income', status: 'planned', accountId: 'acc-1' }
      ];

      const insight = auditCrashTest(manualBalance, pendingTransactions, currentDate);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('warning');
      expect(insight?.metadata?.minBalance).toBe(40);
    });

    it('signale un compte déjà à découvert si aucune transaction future n\'est prévue', () => {
      const insight = auditCrashTest(-150, [], '2026-11-15');
      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('critical');
      expect(insight?.id).toBe('crash_test_already_negative');
    });

    it('retourne null si la trésorerie reste toujours largement positive', () => {
      const manualBalance = 2500;
      const pendingTransactions: Transaction[] = [
        { id: 'tx-1', date: '2026-11-12', amount: 300, type: 'fixed_expense', status: 'planned', accountId: 'acc-1' },
        { id: 'tx-salary', date: '2026-11-28', amount: 2000, type: 'income', status: 'planned', accountId: 'acc-1' }
      ];

      const insight = auditCrashTest(manualBalance, pendingTransactions, '2026-11-10');
      expect(insight).toBeNull();
    });
  });

  describe('2. auditIdleCash (Optimisation basée STRICTEMENT sur le Solde Prévisionnel net)', () => {
    it('PIÈGE DU DÉBUT DE MOIS : ne propose PAS d\'épargner si le solde prévisionnel net est faible malgré un gros solde réel', () => {
      // Cas typique du 2 du mois : salaire fraîchement perçu (solde réel = 3 500 €),
      // mais toutes les charges du mois restent dues, donc solde prévisionnel net à fin de mois = 350 € (sous le seuil de 500 €)
      const soldePrevisionnel = 350;
      const seuilFondRoulement = 500;

      const insight = auditIdleCash(soldePrevisionnel, seuilFondRoulement);
      expect(insight).toBeNull();
    });

    it('identifie un excédent d\'épargne si le solde prévisionnel net de fin de mois dépasse le fond de roulement', () => {
      const soldePrevisionnel = 1450;
      const seuilFondRoulement = 500;

      const insight = auditIdleCash(soldePrevisionnel, seuilFondRoulement);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('info');
      expect(insight?.category).toBe('idle_cash');
      expect(insight?.metadata?.availableToSave).toBe(950);
      expect(insight?.message).toContain('950,00 €');
      expect(insight?.actionTarget).toBe('/epargne');
    });

    it('retourne null si l\'excédent est inférieur au seuil significatif de 50 €', () => {
      const insight = auditIdleCash(530, 500); // 30 € d'excédent seulement
      expect(insight).toBeNull();
    });

    it('retourne null si le solde prévisionnel est négatif', () => {
      const insight = auditIdleCash(-200, 500);
      expect(insight).toBeNull();
    });
  });

  describe('3. auditDailyExpenseCadence (Cadence dépenses courantes alimentation/quotidien)', () => {
    it('détecte une sur-cadence à mi-mois et calcule le rythme journalier restant conseillé', () => {
      // 15ème jour sur 30 (50 % du mois écoulé)
      // Dépenses courantes déjà consommées : 750 € sur une moyenne de 1000 € (75 % consommé !)
      const currentDailyTotal = 750;
      const average3Months = 1000;
      const daysElapsed = 15;
      const daysInMonth = 30;

      const insight = auditDailyExpenseCadence(currentDailyTotal, average3Months, daysElapsed, daysInMonth);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('warning');
      expect(insight?.category).toBe('daily_cadence');
      expect(insight?.id).toBe('daily_cadence_drift');
      // Reste 250 € pour 15 jours -> 16.67 €/jour
      expect(insight?.metadata?.recommendedDailyRate).toBe(16.67);
      expect(insight?.message).toContain('16,67 € / jour');
      expect(insight?.message).toContain('75 %');
    });

    it('alerte en warning de dépassement si le budget moyen 3 mois est déjà dépassé', () => {
      const currentDailyTotal = 1100;
      const average3Months = 1000;
      const daysElapsed = 22;
      const daysInMonth = 30;

      const insight = auditDailyExpenseCadence(currentDailyTotal, average3Months, daysElapsed, daysInMonth);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('warning');
      expect(insight?.id).toBe('daily_cadence_overrun');
      expect(insight?.message).toContain('+10 %');
      expect(insight?.message).toContain('8 jour(s)');
    });

    it('félicite une cadence exemplaire après au moins 10 jours', () => {
      // 15ème jour sur 30 (50 % du mois), seulement 300 € sur 1000 € consommés (30 %)
      const currentDailyTotal = 300;
      const average3Months = 1000;
      const daysElapsed = 15;
      const daysInMonth = 30;

      const insight = auditDailyExpenseCadence(currentDailyTotal, average3Months, daysElapsed, daysInMonth);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('success');
      expect(insight?.id).toBe('daily_cadence_mastered');
      // Reste 700 € pour 15 jours -> 46.67 €/jour
      expect(insight?.metadata?.recommendedDailyRate).toBe(46.67);
    });

    it('gère silencieusement les données invalides ou non fournies', () => {
      expect(auditDailyExpenseCadence(undefined, 1000, 10, 30)).toBeNull();
      expect(auditDailyExpenseCadence(500, 0, 10, 30)).toBeNull();
      expect(auditDailyExpenseCadence(500, 1000, 0, 30)).toBeNull();
    });
  });

  describe('4. auditEmergencyFund (Matelas sur le socle des charges incompressibles)', () => {
    it('alerte en critique si le matelas couvre moins d\'un mois de charges incompressibles', () => {
      const liquidSavingsTotal = 800;
      const totalObligatoires = 1600; // 0.5 mois de charges

      const insight = auditEmergencyFund(liquidSavingsTotal, totalObligatoires);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('critical');
      expect(insight?.category).toBe('emergency_fund');
      expect(insight?.id).toBe('emergency_fund_critical');
      expect(insight?.metadata?.monthsCovered).toBe(0.5);
      expect(insight?.message).toContain('0.5 mois');
    });

    it('alerte en warning si le matelas est partiel (entre 1 et 3 mois)', () => {
      const liquidSavingsTotal = 3200;
      const totalObligatoires = 1600; // 2 mois de charges

      const insight = auditEmergencyFund(liquidSavingsTotal, totalObligatoires);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('warning');
      expect(insight?.id).toBe('emergency_fund_warning');
      expect(insight?.metadata?.monthsCovered).toBe(2);
      expect(insight?.message).toContain('3 à 6 mois');
    });

    it('valide en success si le matelas est optimal (entre 3 et 6 mois)', () => {
      const liquidSavingsTotal = 6400;
      const totalObligatoires = 1600; // 4 mois de charges

      const insight = auditEmergencyFund(liquidSavingsTotal, totalObligatoires);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('success');
      expect(insight?.id).toBe('emergency_fund_optimal');
      expect(insight?.metadata?.monthsCovered).toBe(4);
    });

    it('signale en info une sur-épargne liquide au-delà de 6 mois', () => {
      const liquidSavingsTotal = 15000;
      const totalObligatoires = 1600; // 9.4 mois de charges

      const insight = auditEmergencyFund(liquidSavingsTotal, totalObligatoires);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('info');
      expect(insight?.id).toBe('emergency_fund_surplus');
      expect(insight?.metadata?.monthsCovered).toBe(9.4);
      expect(insight?.message).toContain('inflation');
    });

    it('retourne null si les charges obligatoires sont nulles ou négatives', () => {
      expect(auditEmergencyFund(5000, 0)).toBeNull();
    });

    it('calcule la base de charges incompressibles en excluant STRICTEMENT l\'épargne volontaire (transfer)', () => {
      const breakdown = {
        fixed: 1000,
        variable: 400,
        loan: 200,
        transfer: 500, // Doit être STRICTEMENT ignoré !
        daily: 300,
        health: 100
      };

      const baseline = calculateEmergencyFundBaseline(breakdown);
      // Base = 1000 (fixes) + 400 (variables) + 200 (crédit) = 1600 € (et non 2100 € avec épargne)
      expect(baseline).toBe(1600);
    });

    it('supprime l\'effet boucle infinie (« le serpent qui se mord la queue ») quand on passe une décomposition de charges', () => {
      const liquidSavingsTotal = 6400; // 4 mois d\'autonomie sur base de 1600 €

      // Situation 1 : Épargne mensuelle de 200 €
      const insight1 = auditEmergencyFund(liquidSavingsTotal, {
        fixed: 1000,
        variable: 400,
        loan: 200,
        transfer: 200
      });

      // Situation 2 : L\'utilisateur augmente son épargne mensuelle à 1000 € (gros effort d\'épargne)
      const insight2 = auditEmergencyFund(liquidSavingsTotal, {
        fixed: 1000,
        variable: 400,
        loan: 200,
        transfer: 1000
      });

      // Les deux calculs doivent STRICTEMENT donner le même nombre de mois (4 mois, optimal),
      // prouvant que l\'effort d\'épargne n\'est pas pénalisé par le moteur
      expect(insight1?.metadata?.monthsCovered).toBe(4);
      expect(insight2?.metadata?.monthsCovered).toBe(4);
      expect(insight1?.severity).toBe('success');
      expect(insight2?.severity).toBe('success');
      expect(insight1?.metadata?.totalObligatoires).toBe(1600);
      expect(insight2?.metadata?.totalObligatoires).toBe(1600);
    });
  });

  describe('5. auditStalledHealth (Détection des soins non remboursés > 35 jours)', () => {
    it('détecte un soin de santé débité il y a 45 jours non remboursé', () => {
      const currentDate = '2026-11-15';
      const healthExpenses: Transaction[] = [
        {
          id: 'exp-1',
          date: '2026-10-01', // 45 jours avant
          amount: 85,
          type: 'health_expense',
          status: 'cleared',
          accountId: 'acc-1'
        }
      ];

      const insight = auditStalledHealth(healthExpenses, currentDate, 35);

      expect(insight).not.toBeNull();
      expect(insight?.severity).toBe('warning');
      expect(insight?.category).toBe('stalled_health');
      expect(insight?.metadata?.stalledCount).toBe(1);
      expect(insight?.metadata?.stalledTotal).toBe(85);
      expect(insight?.metadata?.oldestDays).toBe(45);
      expect(insight?.message).toContain('85,00 €');
      expect(insight?.message).toContain('45 jours');
    });

    it('tient compte des remboursements partiels déjà encaissés', () => {
      const currentDate = '2026-11-15';
      const healthExpenses: Transaction[] = [
        {
          id: 'exp-dentiste',
          date: '2026-09-20', // 56 jours avant
          amount: 200,
          type: 'health_expense',
          status: 'cleared',
          accountId: 'acc-1'
        }
      ];

      const reimbursements: Transaction[] = [
        {
          id: 'reimb-cpam',
          linkedId: 'exp-dentiste',
          date: '2026-10-05',
          amount: 140, // Reste 60 € en attente mutuelle
          type: 'health_reimbursement',
          status: 'cleared',
          accountId: 'acc-1'
        }
      ];

      const insight = auditStalledHealth(healthExpenses, currentDate, 35, reimbursements);

      expect(insight).not.toBeNull();
      expect(insight?.metadata?.stalledCount).toBe(1);
      expect(insight?.metadata?.stalledTotal).toBe(60);
      expect(insight?.message).toContain('60,00 €');
    });

    it('ignore les soins récents (< 35 jours) ou intégralement remboursés', () => {
      const currentDate = '2026-11-15';
      const healthExpenses: Transaction[] = [
        {
          id: 'exp-recent',
          date: '2026-11-02', // 13 jours avant
          amount: 50,
          type: 'health_expense',
          status: 'cleared',
          accountId: 'acc-1'
        },
        {
          id: 'exp-paid',
          date: '2026-09-01', // Ancien mais totalement remboursé
          amount: 100,
          type: 'health_expense',
          status: 'cleared',
          accountId: 'acc-1'
        }
      ];

      const reimbursements: Transaction[] = [
        {
          id: 'reimb-full',
          linkedId: 'exp-paid',
          date: '2026-09-15',
          amount: 100,
          type: 'health_reimbursement',
          status: 'cleared',
          accountId: 'acc-1'
        }
      ];

      const insight = auditStalledHealth(healthExpenses, currentDate, 35, reimbursements);
      expect(insight).toBeNull();
    });
  });

  describe('6. auditLoanPrepayment (Arbitrage crédit & simulation remboursement anticipé)', () => {
    it('simule les gains d\'intérêts et de mois sur le prêt le plus rémunérateur en cas d\'excédent prévisionnel', () => {
      const loans: Loan[] = [
        {
          id: 'loan-auto',
          name: 'Prêt Auto',
          lender: 'Banque',
          initialAmount: 15000,
          remainingCapital: 8000,
          monthlyPayment: 250,
          interestRate: 4.8, // Prêt le plus cher
          insurancePart: 10,
          startDate: '2024-01-01',
          durationMonths: 60,
          accountId: 'acc-1',
          isArchived: false
        },
        {
          id: 'loan-immo',
          name: 'Prêt Immo',
          lender: 'Banque',
          initialAmount: 200000,
          remainingCapital: 170000,
          monthlyPayment: 850,
          interestRate: 1.5,
          insurancePart: 30,
          startDate: '2020-01-01',
          durationMonths: 240,
          accountId: 'acc-1',
          isArchived: false
        }
      ];

      // Solde prévisionnel net de 1 400 € pour un seuil de 500 € -> 900 € d'excédent disponible
      const soldePrevisionnel = 1400;
      const seuilFondRoulement = 500;

      const insight = auditLoanPrepayment(loans, soldePrevisionnel, seuilFondRoulement);

      expect(insight).not.toBeNull();
      expect(insight?.category).toBe('loan_prepayment');
      expect(insight?.metadata?.loanId).toBe('loan-auto');
      expect(insight?.metadata?.prepayAmount).toBe(900);
      expect(insight?.metadata?.monthsSaved).toBeGreaterThan(0);
      expect(insight?.metadata?.interestSaved).toBeGreaterThan(0);
      expect(insight?.message).toContain('Prêt Auto');
      expect(insight?.message).toContain('900,00 €');
    });

    it('retourne null si l\'excédent prévisionnel net est insuffisant (< 200 €)', () => {
      const loans: Loan[] = [
        {
          id: 'loan-1',
          name: 'Prêt Conso',
          lender: 'Banque',
          initialAmount: 5000,
          remainingCapital: 3000,
          monthlyPayment: 150,
          interestRate: 5.0,
          startDate: '2025-01-01',
          durationMonths: 36,
          accountId: 'acc-1',
          isArchived: false
        }
      ];

      const insight = auditLoanPrepayment(loans, 650, 500); // 150 € d'excédent (< 200 €)
      expect(insight).toBeNull();
    });

    it('retourne null si le prêt a un taux d\'intérêt nul (PTZ)', () => {
      const loans: Loan[] = [
        {
          id: 'loan-ptz',
          name: 'Prêt à Taux Zéro',
          lender: 'Banque',
          initialAmount: 20000,
          remainingCapital: 15000,
          monthlyPayment: 200,
          interestRate: 0,
          startDate: '2023-01-01',
          durationMonths: 100,
          accountId: 'acc-1',
          isArchived: false
        }
      ];

      const insight = auditLoanPrepayment(loans, 1500, 500);
      expect(insight).toBeNull();
    });
  });

  describe('7. generateInsights & Benchmarking de performance', () => {
    it('orchestre l\'ensemble des sentinelles et trie strictement par sévérité décroissante (critical > warning > info > success)', () => {
      const context: InsightsContext = {
        currentDate: '2026-11-10',
        manualBalance: 150, // Creux prévisible
        soldePrevisionnel: 1200, // Excédent de fin de mois garanti
        seuilFondRoulement: 500,
        pendingTransactions: [
          { id: 'tx-1', date: '2026-11-15', amount: 300, type: 'fixed_expense', status: 'planned', accountId: 'acc-1' }, // Creux à -150 € -> CRITICAL
          { id: 'tx-salary', date: '2026-11-28', amount: 2500, type: 'income', status: 'planned', accountId: 'acc-1' }
        ],
        currentDailyTotal: 650, // Sur-cadence à 10/30 jours sur base 800 € -> WARNING
        average3MonthsDaily: 800,
        daysElapsed: 10,
        daysInMonth: 30,
        liquidSavingsTotal: 8000, // 4 mois sur 2000 € d'obligations -> SUCCESS
        totalObligatoires: 2000,
        chargesBreakdown: {
          fixed: 1200,
          variable: 500,
          loan: 300,
          transfer: 600 // Exclu automatiquement de la base emergency_fund
        },
        healthExpenses: [],
        loans: []
      };

      const insights = generateInsights(context);

      expect(insights.length).toBeGreaterThanOrEqual(3);

      // Vérification stricte du tri par priorité décroissante
      const severityOrder = ['critical', 'warning', 'info', 'success'];
      for (let i = 0; i < insights.length - 1; i++) {
        const currentWeight = severityOrder.indexOf(insights[i].severity);
        const nextWeight = severityOrder.indexOf(insights[i + 1].severity);
        expect(currentWeight).toBeLessThanOrEqual(nextWeight);
      }

      // Le premier insight doit être le Crash-Test critique
      expect(insights[0].severity).toBe('critical');
      expect(insights[0].category).toBe('crash_test');
    });

    it('s\'exécute en moins de 2 millisecondes (benchmarking de performance)', () => {
      // Génération d'un contexte volumineux avec 200 transactions
      const dummyTransactions: Transaction[] = Array.from({ length: 200 }, (_, i) => ({
        id: `tx-${i}`,
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        amount: (i * 13) % 200 + 10,
        type: i % 10 === 0 ? 'income' : 'fixed_expense',
        status: i % 2 === 0 ? 'planned' : 'cleared',
        accountId: 'acc-1'
      }));

      const context: InsightsContext = {
        currentDate: '2026-11-12',
        manualBalance: 1200,
        soldePrevisionnel: 950,
        seuilFondRoulement: 400,
        pendingTransactions: dummyTransactions,
        currentDailyTotal: 450,
        average3MonthsDaily: 900,
        daysElapsed: 12,
        daysInMonth: 30,
        liquidSavingsTotal: 6000,
        totalObligatoires: 1800,
        healthExpenses: dummyTransactions.slice(0, 50).map(t => ({ ...t, type: 'health_expense' })),
        loans: [
          {
            id: 'loan-test',
            name: 'Prêt Auto',
            lender: 'Banque',
            initialAmount: 10000,
            remainingCapital: 6000,
            monthlyPayment: 200,
            interestRate: 3.5,
            startDate: '2024-01-01',
            durationMonths: 60,
            accountId: 'acc-1',
            isArchived: false
          }
        ]
      };

      // Warm-up JIT
      generateInsights(context);

      const iterations = 10;
      const start = performance.now();
      let insights = generateInsights(context);
      for (let i = 1; i < iterations; i++) {
        insights = generateInsights(context);
      }
      const avgDuration = (performance.now() - start) / iterations;

      expect(insights).toBeDefined();
      expect(avgDuration).toBeLessThan(5); // Cible stricte < 5 ms même sous forte charge parallèle CPU
    });
  });

  describe('8. formatCurrencyFr', () => {
    it('formate fidèlement les devises en euros avec espace insécable et 2 décimales', () => {
      expect(formatCurrencyFr(1500.5)).toContain('1');
      expect(formatCurrencyFr(1500.5)).toContain('500,50');
      expect(formatCurrencyFr(1500.5)).toContain('€');
      expect(formatCurrencyFr(-0)).toBe('0,00 €');
    });
  });
});
