import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  saveLoan, 
  getLoanById, 
  updateLoanPaymentStatus,
  calculateAmortizedCapitalServer,
  withTransaction 
} from './loanService.ts';
import { 
  saveTransaction, 
  getTransactionById, 
  deleteTransaction, 
  updateTransactionStatus 
} from './transactionService.ts';
import { saveAccount } from './accountService.ts';

describe('Cycle de vie complet et Fiabilité du Module Crédits (SQLite)', () => {
  let db: DatabaseSync;
  let accountId: string;

  beforeEach(() => {
    // Base SQLite isolée en mémoire : garantie absolue d'absence d'impact sur la prod
    db = initDatabase(':memory:');

    const acc = saveAccount(db, {
      name: 'Compte Courant Test',
      type: 'checking',
      initialBalance: 5000,
      referenceDate: '2026-10-01'
    });
    accountId = acc.id!;
  });

  afterEach(() => {
    db.close();
  });

  describe('1. Exemple de référence imposé (10 000 € initial, 300 € mensualité, 250 € capital amorti)', () => {
    it('1.1 Création d\'une mensualité avec statut « Prévue » : le capital restant dû reste à 10 000 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8, // 10 000 * (4.8% / 12) = 40 € d'intérêts
        insurancePart: 10,  // 10 € d'assurance
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      // Vérification directe en base SQLite
      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(10000);

      const txInDb = db.prepare('SELECT status, amortizedCapital FROM transactions WHERE id = ?').get(payment.id!) as any;
      expect(txInDb.status).toBe('planned');
      expect(Number(txInDb.amortizedCapital)).toBe(250);
    });

    it('1.2 ANOM-02 : Création directe d\'une mensualité avec statut « Réglée » (cleared) : le capital restant dû passe immédiatement à 9 750 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      // Création directe au statut 'cleared'
      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      // Vérification en base SQLite
      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(9750);

      const txInDb = db.prepare('SELECT status, amortizedCapital FROM transactions WHERE id = ?').get(payment.id!) as any;
      expect(txInDb.status).toBe('cleared');
      expect(Number(txInDb.amortizedCapital)).toBe(250);
    });

    it('1.3 Passage de « Prévue » à « Réglée » : le capital restant dû passe de 10 000 € à 9 750 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'planned',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      const res = updateLoanPaymentStatus(db, payment.id!, 'cleared');
      expect(res.payment.status).toBe('cleared');
      expect(res.loan.remainingCapital).toBe(9750);

      // Vérification directe dans la table loans
      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(9750);
    });

    it('1.4 Passage de « Réglée » à « Prévue » : le capital restant dû est rétabli à 10 000 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      // Le prêt est à 9 750 €
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Rétablissement vers 'planned'
      const res = updateLoanPaymentStatus(db, payment.id!, 'planned');
      expect(res.payment.status).toBe('planned');
      expect(res.loan.remainingCapital).toBe(10000);

      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(10000);
    });

    it('1.5 Suppression d\'une mensualité prévue : le capital restant dû reste intact à 10 000 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'planned',
        accountId,
        linkedId: loan.id
      });

      deleteTransaction(db, payment.id!);

      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(10000);
    });

    it('1.6 ANOM-03 : Suppression d\'une mensualité réglée : le capital restant dû est rétabli à 10 000 €', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Référence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Suppression de la mensualité réglée
      deleteTransaction(db, payment.id!);

      // Vérification en base SQLite : le capital amorti (250 €) a été réintégré !
      const loanInDb = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get(loan.id!) as any;
      expect(Number(loanInDb.remainingCapital)).toBe(10000);

      const txInDb = db.prepare('SELECT * FROM transactions WHERE id = ?').get(payment.id!);
      expect(txInDb).toBeUndefined();
    });
  });

  describe('2. Modification d\'une mensualité réglée (montant et capital amorti)', () => {
    it('2.1 Modification explicite de la part amortie d\'une mensualité déjà réglée', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Conso Modif',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Modification de l'amorti à 300 € (50 € de plus amortis)
      saveTransaction(db, {
        id: payment.id,
        amortizedCapital: 300
      });

      const loanAfterIncrease = getLoanById(db, loan.id!)!;
      expect(loanAfterIncrease.remainingCapital).toBe(9700);

      // Modification de l'amorti à 200 € (50 € de moins amortis)
      saveTransaction(db, {
        id: payment.id,
        amortizedCapital: 200
      });

      const loanAfterDecrease = getLoanById(db, loan.id!)!;
      expect(loanAfterDecrease.remainingCapital).toBe(9800);
    });

    it('2.2 Modification du montant total d\'une mensualité réglée avec recalcul automatique du capital amorti', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Immo Recalcul',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        interestRate: 4.8, // 40 € intérêts
        insurancePart: 10,  // 10 € assurance
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      // Création mensualité 300 € réglée -> 250 € amortis -> capital restant = 9 750 €
      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id
      });

      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);
      expect(getTransactionById(db, payment.id!)?.amortizedCapital).toBe(250);

      // Modification du montant de 300 € à 400 € sans amorti spécifié
      // Base capital avant mensualité = 9 750 + 250 = 10 000 €
      // Intérêts = 10 000 * 4.8% / 12 = 40 € ; Assurance = 10 €
      // Nouvel amorti = 400 - 40 - 10 = 350 €
      // Nouveau capital restant = 10 000 - 350 = 9 650 €
      saveTransaction(db, {
        id: payment.id,
        amount: 400
      });

      const updatedTx = getTransactionById(db, payment.id!)!;
      expect(updatedTx.amortizedCapital).toBe(350);

      const updatedLoan = getLoanById(db, loan.id!)!;
      expect(updatedLoan.remainingCapital).toBe(9650);
    });
  });

  describe('3. Plusieurs mensualités successives', () => {
    it('enchaîne 3 mensualités successives et gère les annulations et suppressions partielles', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Successif',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-08-01',
        durationMonths: 36,
        accountId
      });

      // Mois 1 : 250 € amortis
      const m1 = saveTransaction(db, {
        date: '2026-08-10',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Mois 2 : 250 € amortis
      const m2 = saveTransaction(db, {
        date: '2026-09-10',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9500);

      // Mois 3 : 250 € amortis
      const m3 = saveTransaction(db, {
        date: '2026-10-10',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9250);

      // Suppression du Mois 2 : le capital doit remonter à 9 500 €
      deleteTransaction(db, m2.id!);
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9500);

      // Le Mois 1 repasse en 'planned' : le capital doit remonter à 9 750 €
      updateLoanPaymentStatus(db, m1.id!, 'planned');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Le Mois 3 est supprimé : le capital doit revenir à 10 000 €
      deleteTransaction(db, m3.id!);
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(10000);
    });
  });

  describe('4. Idempotence et répétition d\'appels', () => {
    it('un double appel de passage à « cleared » ne déduit pas le capital deux fois', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Idempotence',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });

      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Deuxième appel avec updateLoanPaymentStatus
      const res2 = updateLoanPaymentStatus(db, payment.id!, 'cleared');
      expect(res2.loan.remainingCapital).toBe(9750);

      // Troisième appel avec saveTransaction identique
      saveTransaction(db, {
        id: payment.id,
        status: 'cleared',
        amortizedCapital: 250
      });
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // Quatrième appel via updateTransactionStatus
      updateTransactionStatus(db, payment.id!, 'cleared');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);
    });
  });

  describe('5. Statuts multiples : pending, disabled, transitions complètes', () => {
    it('gère les transitions planned -> pending -> cleared -> disabled -> cleared', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Transitions',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      // 1. planned -> 10 000 €
      const p = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'planned',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 250
      });
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(10000);

      // 2. pending -> toujours 10 000 €
      updateLoanPaymentStatus(db, p.id!, 'pending');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(10000);

      // 3. cleared -> 9 750 €
      updateLoanPaymentStatus(db, p.id!, 'cleared');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);

      // 4. disabled -> 10 000 € (restitution)
      updateLoanPaymentStatus(db, p.id!, 'disabled');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(10000);

      // 5. cleared à nouveau -> 9 750 €
      updateLoanPaymentStatus(db, p.id!, 'cleared');
      expect(getLoanById(db, loan.id!)?.remainingCapital).toBe(9750);
    });
  });

  describe('6. Changement de crédit lié (linkedId)', () => {
    it('restitue le capital sur l\'ancien prêt et déduit sur le nouveau lors d\'un changement de prêt', () => {
      const loanA = saveLoan(db, {
        name: 'Prêt A',
        lender: 'Banque A',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      const loanB = saveLoan(db, {
        name: 'Prêt B',
        lender: 'Banque B',
        initialAmount: 5000,
        remainingCapital: 5000,
        monthlyPayment: 200,
        startDate: '2026-10-01',
        durationMonths: 24,
        accountId
      });

      // Mensualité réglée sur Prêt A
      const p = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 300,
        status: 'cleared',
        accountId,
        linkedId: loanA.id,
        amortizedCapital: 250
      });

      expect(getLoanById(db, loanA.id!)?.remainingCapital).toBe(9750);
      expect(getLoanById(db, loanB.id!)?.remainingCapital).toBe(5000);

      // Réaffectation vers Prêt B avec amorti 250 €
      saveTransaction(db, {
        id: p.id,
        linkedId: loanB.id,
        amortizedCapital: 250
      });

      // Prêt A doit avoir retrouvé ses 10 000 € et Prêt B doit être à 4 750 €
      expect(getLoanById(db, loanA.id!)?.remainingCapital).toBe(10000);
      expect(getLoanById(db, loanB.id!)?.remainingCapital).toBe(4750);
    });
  });

  describe('7. Robustesse et Rollback SQLite en cas d\'erreur', () => {
    it('annule toutes les écritures (transactions et loans) en cas d\'exception au cours d\'une opération', () => {
      const loan = saveLoan(db, {
        name: 'Prêt Rollback Test',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 300,
        startDate: '2026-10-01',
        durationMonths: 36,
        accountId
      });

      // Tentative d'opération atomique échouant à mi-chemin
      expect(() => {
        withTransaction(db, () => {
          saveTransaction(db, {
            date: '2026-10-05',
            type: 'loan_payment',
            amount: 300,
            status: 'cleared',
            accountId,
            linkedId: loan.id,
            amortizedCapital: 250
          });

          // Simulation d'une erreur inattendue
          throw new Error('Crash inattendu en cours de transaction !');
        });
      }).toThrow('Crash inattendu en cours de transaction !');

      // Le prêt doit toujours être à 10 000 € (aucune écriture résiduelle)
      const loanAfter = getLoanById(db, loan.id!)!;
      expect(loanAfter.remainingCapital).toBe(10000);

      // Aucune transaction résiduelle créée
      const txs = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE linkedId = ?').get(loan.id!) as any;
      expect(txs.count).toBe(0);
    });
  });

  describe('8. Précision du calcul de capital amorti', () => {
    it('calcule correctement : mensualité - intérêts - assurance et arrondit à 2 décimales', () => {
      // 10 000 € à 4.8% annuel = 40 € / mois d'intérêt. Assurance = 10 €. Mensualité = 300 €. Amorti = 250 €.
      const amortized1 = calculateAmortizedCapitalServer(300, 10000, 4.8, 10);
      expect(amortized1).toBe(250);

      // Cas où intérêts + assurance >= mensualité -> retourne 0
      const amortizedZero = calculateAmortizedCapitalServer(50, 10000, 12, 10); // Intérêts 100 € + assurance 10 € > 50 €
      expect(amortizedZero).toBe(0);

      // Cas où montant négatif ou capital négatif -> retourne 0
      expect(calculateAmortizedCapitalServer(-100, 10000)).toBe(0);
      expect(calculateAmortizedCapitalServer(300, -500)).toBe(0);
    });
  });
});
