import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  saveLoan, 
  getLoanById, 
  archiveLoan,
  reactivateLoanFuturePlanned,
  getLoanPaymentHistory,
  getEffectiveMonthlyPayment,
  addLoanPaymentHistory,
  deleteLoanPaymentHistory,
  estimateLoanPayoff
} from './loanService.ts';
import { saveTransaction, getTransactionById } from './transactionService.ts';
import { saveAccount } from './accountService.ts';
import { exportBackupData, importBackupData } from './migrationService.ts';

describe('Fonctionnalités Évolution Crédits : Archivage & Historique des mensualités', () => {
  let db: DatabaseSync;
  let accountId: string;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const acc = saveAccount(db, {
      name: 'Compte Principal',
      type: 'checking',
      initialBalance: 4000,
      referenceDate: '2026-01-01'
    });
    accountId = acc.id!;
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Archivage et désarchivage des crédits', () => {
    it('crée un prêt non archivé par défaut avec un palier d\'historique contractuel initial', () => {
      const loan = saveLoan(db, {
        name: 'Auto Pro',
        lender: 'Cetelem',
        initialAmount: 12000,
        monthlyPayment: 250,
        durationMonths: 48,
        startDate: '2026-01-15',
        accountId
      });

      expect(loan.isArchived).toBe(false);

      const history = getLoanPaymentHistory(db, loan.id);
      expect(history.length).toBe(1);
      expect(history[0].monthlyPayment).toBe(250);
      expect(history[0].previousPayment).toBeNull();
      expect(history[0].effectiveMonth).toBe('2026-01');
    });

    it('archive un prêt sans désactiver les échéances futures si disableFuturePlanned est faux', () => {
      const loan = saveLoan(db, {
        name: 'Travaux',
        lender: 'Banque Postale',
        initialAmount: 5000,
        monthlyPayment: 150,
        durationMonths: 36,
        startDate: '2026-01-01',
        accountId
      });

      const today = new Date().toISOString().slice(0, 10);
      const futureMonth = '2099-01-15';

      const plannedTx = saveTransaction(db, {
        date: futureMonth,
        amount: 150,
        type: 'loan_payment',
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      const res = archiveLoan(db, loan.id, true, false);
      expect(res.loan.isArchived).toBe(true);
      expect(res.disabledCount).toBe(0);

      const checkTx = getTransactionById(db, plannedTx.id);
      expect(checkTx?.status).toBe('planned');
    });

    it('archive un prêt et désactive les échéances futures prévues, tout en préservant scrupuleusement les mensualités débitées', () => {
      const loan = saveLoan(db, {
        name: 'Immo Appart',
        lender: 'Crédit Mutuel',
        initialAmount: 150000,
        monthlyPayment: 850,
        durationMonths: 240,
        startDate: '2025-01-01',
        accountId
      });

      // Échéance passée pointée (cleared)
      const clearedPastTx = saveTransaction(db, {
        date: '2025-06-05',
        amount: 850,
        type: 'loan_payment',
        status: 'cleared',
        accountId,
        linkedId: loan.id
      });

      // Échéance future prévue (planned)
      const plannedFutureTx = saveTransaction(db, {
        date: '2099-05-05',
        amount: 850,
        type: 'loan_payment',
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      // Échéance future déjà débitée par anticipation
      const clearedFutureTx = saveTransaction(db, {
        date: '2099-06-05',
        amount: 850,
        type: 'loan_payment',
        status: 'cleared',
        accountId,
        linkedId: loan.id
      });

      const res = archiveLoan(db, loan.id, true, true);
      expect(res.loan.isArchived).toBe(true);
      expect(res.disabledCount).toBe(1);

      // La future planned a été désactivée
      const checkPlanned = getTransactionById(db, plannedFutureTx.id);
      expect(checkPlanned?.status).toBe('disabled');

      // Les transactions débitées (passées comme futures) restent STRICTEMENT intactes
      const checkPast = getTransactionById(db, clearedPastTx.id);
      expect(checkPast?.status).toBe('cleared');

      const checkClearedFuture = getTransactionById(db, clearedFutureTx.id);
      expect(checkClearedFuture?.status).toBe('cleared');
    });

    it('désarchive un crédit sans réactiver automatiquement les échéances désactivées', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Moto',
        lender: 'Sofinco',
        initialAmount: 3000,
        monthlyPayment: 100,
        durationMonths: 30,
        startDate: '2026-01-01',
        accountId
      });

      const futureTx = saveTransaction(db, {
        date: '2099-03-01',
        amount: 100,
        type: 'loan_payment',
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      // Archivage avec désactivation
      archiveLoan(db, loan.id, true, true);
      expect(getTransactionById(db, futureTx.id)?.status).toBe('disabled');

      // Désarchivage simple
      const unarchived = archiveLoan(db, loan.id, false, false);
      expect(unarchived.loan.isArchived).toBe(false);

      // L'échéance reste désactivée par défaut pour respecter la décision utilisateur
      expect(getTransactionById(db, futureTx.id)?.status).toBe('disabled');
    });

    it('permet la réactivation explicite des échéances futures désactivées lors du désarchivage', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Cuisine',
        lender: 'Cofidis',
        initialAmount: 4000,
        monthlyPayment: 200,
        durationMonths: 20,
        startDate: '2026-01-01',
        accountId
      });

      const futureTx = saveTransaction(db, {
        date: '2099-04-01',
        amount: 200,
        type: 'loan_payment',
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      archiveLoan(db, loan.id, true, true);
      expect(getTransactionById(db, futureTx.id)?.status).toBe('disabled');

      // Réactivation explicite
      const reactivatedCount = reactivateLoanFuturePlanned(db, loan.id);
      expect(reactivatedCount).toBe(1);
      expect(getTransactionById(db, futureTx.id)?.status).toBe('planned');
    });
  });

  describe('2. Historique et modification des mensualités de crédit', () => {
    it('ajoute un nouveau palier futur et n\'altère pas la mensualité contractuelle actuelle tant que le mois n\'est pas atteint', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Modifiable',
        lender: 'Boursorama',
        initialAmount: 20000,
        monthlyPayment: 400,
        durationMonths: 60,
        startDate: '2026-01-01',
        accountId
      });

      const futureMonth = '2099-05';
      const newTier = addLoanPaymentHistory(db, {
        loanId: loan.id,
        effectiveMonth: futureMonth,
        monthlyPayment: 450,
        notes: 'Avenant réévaluation'
      });

      expect(newTier.previousPayment).toBe(400);
      expect(newTier.monthlyPayment).toBe(450);

      // Le prêt actuel en base conserve 400 € car le palier est futur
      const currentLoan = getLoanById(db, loan.id)!;
      expect(currentLoan.monthlyPayment).toBe(400);

      // getEffectiveMonthlyPayment retourne 400 pour le mois en cours, mais 450 pour 2099-05
      const currentMonth = new Date().toISOString().slice(0, 7);
      expect(getEffectiveMonthlyPayment(db, loan.id, currentMonth)).toBe(400);
      expect(getEffectiveMonthlyPayment(db, loan.id, futureMonth)).toBe(450);
    });

    it('ajoute un palier actif/passé et met à jour immédiatement la mensualité contractuelle', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Taux Variable',
        lender: 'LCL',
        initialAmount: 10000,
        monthlyPayment: 250,
        durationMonths: 40,
        startDate: '2026-01-01',
        accountId
      });

      const currentMonth = new Date().toISOString().slice(0, 7);
      addLoanPaymentHistory(db, {
        loanId: loan.id,
        effectiveMonth: currentMonth,
        monthlyPayment: 280,
        notes: 'Hausse d\'indice'
      });

      const updatedLoan = getLoanById(db, loan.id)!;
      expect(updatedLoan.monthlyPayment).toBe(280);
    });

    it('interdit la suppression du palier initial contractuel', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Vélo',
        lender: 'Banque',
        initialAmount: 1000,
        monthlyPayment: 100,
        durationMonths: 10,
        startDate: '2026-01-01',
        accountId
      });

      const history = getLoanPaymentHistory(db, loan.id);
      expect(history.length).toBe(1);

      expect(() => {
        deleteLoanPaymentHistory(db, history[0].id, true);
      }).toThrow(/palier contractuel initial de référence/i);
    });

    it('permet la suppression d\'un palier futur sans confirmation forcée, et exige la confirmation forcée pour un palier actif/passé', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Test Suppression',
        lender: 'Banque',
        initialAmount: 8000,
        monthlyPayment: 200,
        durationMonths: 40,
        startDate: '2026-01-01',
        accountId
      });

      const currentMonth = new Date().toISOString().slice(0, 7);
      const futureMonth = '2099-09';

      // 1. Palier futur : supprimable directement
      const futureTier = addLoanPaymentHistory(db, {
        loanId: loan.id,
        effectiveMonth: futureMonth,
        monthlyPayment: 220
      });

      expect(() => deleteLoanPaymentHistory(db, futureTier.id, false)).not.toThrow();
      expect(getLoanPaymentHistory(db, loan.id).find(h => h.id === futureTier.id)).toBeUndefined();

      // 2. Palier actif/passé : rejeté sans force, accepté avec force
      const activeTier = addLoanPaymentHistory(db, {
        loanId: loan.id,
        effectiveMonth: currentMonth,
        monthlyPayment: 230
      });

      expect(() => {
        deleteLoanPaymentHistory(db, activeTier.id, false);
      }).toThrow(/requiert une procédure explicite de correction/i);

      expect(() => deleteLoanPaymentHistory(db, activeTier.id, true)).not.toThrow();

      // Après suppression forcée du palier actif, la mensualité du prêt revient au palier précédent (200 €)
      const refreshed = getLoanById(db, loan.id)!;
      expect(refreshed.monthlyPayment).toBe(200);
    });
  });

  describe('3. Simulation actuarielle indicative de fin de crédit', () => {
    it('calcule correctement l\'amortissement avec intérêts et dernier paiement réduit', () => {
      // 10 000 € à 6% annuel (0.5% par mois), sans assurance, mensualité de 1 000 €
      const sim = estimateLoanPayoff({
        remainingCapital: 10000,
        monthlyPayment: 1000,
        interestRate: 6,
        insurancePart: 0,
        startMonth: '2026-01'
      });

      expect(sim.possible).toBe(true);
      expect(sim.monthsRemaining).toBe(11);
      expect(sim.estimatedEndMonth).toBe('2026-11');
      expect(sim.totalInterest).toBeGreaterThan(0);
      expect(sim.lastPaymentAmount).toBeLessThanOrEqual(1000);
    });

    it('gère le cas d\'un crédit à taux zéro (0%)', () => {
      // 1 000 € remboursés à 200 € / mois -> exactement 5 mois
      const sim = estimateLoanPayoff({
        remainingCapital: 1000,
        monthlyPayment: 200,
        interestRate: 0,
        insurancePart: 0,
        startMonth: '2026-01'
      });

      expect(sim.possible).toBe(true);
      expect(sim.monthsRemaining).toBe(5);
      expect(sim.estimatedEndMonth).toBe('2026-05');
      expect(sim.totalInterest).toBe(0);
      expect(sim.lastPaymentAmount).toBe(200);
    });

    it('signale l\'impossibilité si la mensualité ne couvre pas les intérêts mensuels', () => {
      // 100 000 € à 12% = 1 000 € d'intérêts mensuels, mensualité de 500 €
      const sim = estimateLoanPayoff({
        remainingCapital: 100000,
        monthlyPayment: 500,
        interestRate: 12,
        insurancePart: 0,
        startMonth: '2026-01'
      });

      expect(sim.possible).toBe(false);
      expect(sim.reason).toMatch(/intérêts/i);
    });
  });

  describe('4. Sauvegarde, Restauration et Export/Import JSON', () => {
    it('exporte et réimporte fidèlement les paliers d\'historique des mensualités', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Export Import',
        lender: 'Boursorama',
        initialAmount: 15000,
        monthlyPayment: 300,
        durationMonths: 50,
        startDate: '2026-01-01',
        accountId
      });

      addLoanPaymentHistory(db, {
        loanId: loan.id,
        effectiveMonth: '2026-06',
        monthlyPayment: 350,
        notes: 'Hausse négociée'
      });

      const backup = exportBackupData(db);
      expect(backup.tables.loanPaymentHistory).toBeDefined();
      expect(backup.tables.loanPaymentHistory!.length).toBe(2);

      // Restauration dans une seconde base vierge
      const targetDb = initDatabase(':memory:');
      saveAccount(targetDb, { id: accountId, name: 'Compte Target', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });

      const importRes = importBackupData(targetDb, backup, { skipSafetyBackup: true });
      expect(importRes.success).toBe(true);

      const targetHistory = getLoanPaymentHistory(targetDb, loan.id);
      expect(targetHistory.length).toBe(2);
      expect(targetHistory.find(h => h.effectiveMonth === '2026-06')?.monthlyPayment).toBe(350);

      targetDb.close();
    });
  });
});
