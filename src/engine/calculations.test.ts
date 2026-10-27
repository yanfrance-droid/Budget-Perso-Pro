import { describe, it, expect } from 'vitest';
import type { Account, Transaction, Loan } from '../db/database';
import { 
  calculateRealBalance, 
  calculateAvailableBalance, 
  calculateForecastedBalance, 
  calculateResteAVivre, 
  applyLoanPayment, 
  calculateHealthSummary, 
  calculateMonthlyHealthSummary,
  calculateLoanProgress, 
  getLoanPaymentsSummary,
  calculateAmortizedCapital
} from './calculations';

describe('Financial Calculations', () => {
  const account: Account = {
    id: 'acc1',
    name: 'Checking',
    type: 'checking',
    initialBalance: 1000,
    referenceDate: '2026-10-01'
  };

  const transactions: Transaction[] = [
    { id: 't1', date: '2026-10-02', type: 'income', amount: 2000, status: 'cleared', accountId: 'acc1' },
    { id: 't2', date: '2026-10-05', type: 'fixed_expense', amount: 500, status: 'cleared', accountId: 'acc1' },
    { id: 't3', date: '2026-10-10', type: 'daily', amount: 150, status: 'pending', accountId: 'acc1' },
    { id: 't4', date: '2026-10-25', type: 'variable_expense', amount: 300, status: 'planned', accountId: 'acc1' },
    { id: 't5', date: '2026-10-26', type: 'transfer', amount: -200, status: 'planned', accountId: 'acc1' } // Savings transfer
  ];

  it('calculates real balance (only cleared)', () => {
    // 1000 (initial) + 2000 (cleared) - 500 (cleared) = 2500
    expect(calculateRealBalance(account, transactions)).toBe(2500);
  });

  it('calculates available balance (cleared + pending)', () => {
    // 2500 (real) - 150 (pending) = 2350
    expect(calculateAvailableBalance(account, transactions)).toBe(2350);
  });

  it('calculates forecasted balance (cleared + pending + planned)', () => {
    // 2350 (avail) - 300 (planned) - 200 (transfer out) = 1850
    expect(calculateForecastedBalance(account, transactions)).toBe(1850);
  });

  it('calculates reste a vivre without savings', () => {
    // Incomes: 2000
    // Expenses: 500 + 150 + 300 = 950
    // RaV = 1050
    expect(calculateResteAVivre(transactions, '2026-10', false)).toBe(1050);
  });

  it('calculates reste a vivre with savings as expense', () => {
    // Incomes: 2000
    // Expenses: 950 + 200 (savings) = 1150
    // RaV = 850
    expect(calculateResteAVivre(transactions, '2026-10', true)).toBe(850);
  });

  it('calculates reste a vivre properly with health expense and reimbursement net cost', () => {
    const customTx: Transaction[] = [
      { id: 't1', date: '2026-10-01', type: 'health_expense', amount: 50, status: 'cleared', accountId: 'acc1' },
      { id: 't2', date: '2026-10-02', type: 'health_reimbursement', amount: 35, status: 'cleared', accountId: 'acc1', linkedId: 't1' }
    ];
    // Incomes: 0 + 35 (reimbursement) = 35
    // Expenses: 50
    // Net RaV = 35 - 50 = -15
    // The net cost of medical expense is 15.
    expect(calculateResteAVivre(customTx, '2026-10', false)).toBe(-15);
  });

  it('ne gonfle pas le reste a vivre avec un remboursement de sante pending ou planned', () => {
    const txsWithPendingReimb: Transaction[] = [
      { id: 't1', date: '2026-10-01', type: 'health_expense', amount: 100, status: 'cleared', accountId: 'acc1' },
      { id: 't2', date: '2026-10-15', type: 'health_reimbursement', amount: 70, status: 'pending', accountId: 'acc1', linkedId: 't1' },
      { id: 't3', date: '2026-10-20', type: 'health_reimbursement', amount: 20, status: 'planned', accountId: 'acc1', linkedId: 't1' }
    ];
    // Seuls les remboursements cleared sont de l'argent perçu.
    // Dépenses = 100, Remboursements encaissés = 0 -> RaV = -100
    expect(calculateResteAVivre(txsWithPendingReimb, '2026-10', false)).toBe(-100);

    // Une fois le remboursement de 70 € encaissé (cleared)
    txsWithPendingReimb[1].status = 'cleared';
    // Dépenses = 100, Remboursements encaissés = 70 -> RaV = -30
    expect(calculateResteAVivre(txsWithPendingReimb, '2026-10', false)).toBe(-30);
  });

  it('applies loan payment correctly to remaining capital', () => {
    const loan: Loan = {
      id: 'l1', name: 'Car', lender: 'Bank', initialAmount: 10000, remainingCapital: 8000, 
      monthlyPayment: 250, startDate: '2025-01-01', durationMonths: 48, accountId: 'acc1', isArchived: false
    };
    // Paid 250, 50 is interest -> capital paid = 200
    const updatedLoan = applyLoanPayment(loan, 250, true, 50);
    expect(updatedLoan.remainingCapital).toBe(7800);
  });

  describe('Health Summary Calculations', () => {
    it('calculates properly with expense, partial reimbursement, expected reimbursement and over-reimbursement', () => {
      const expenses: Transaction[] = [
        { id: 'h1', date: '2026-10-01', type: 'health_expense', amount: 100, status: 'cleared', accountId: 'acc1' },
        { id: 'h2', date: '2026-10-02', type: 'health_expense', amount: 50, status: 'cleared', accountId: 'acc1' },
        { id: 'h3', date: '2026-10-03', type: 'health_expense', amount: 200, status: 'cleared', accountId: 'acc1' }
      ];

      const reimbursements: Transaction[] = [
        // h1: Partial reimbursement
        { id: 'r1', linkedId: 'h1', date: '2026-10-05', type: 'health_reimbursement', amount: 70, status: 'cleared', accountId: 'acc1' },
        // h2: Multiple reimbursements (one cleared, one expected)
        { id: 'r2', linkedId: 'h2', date: '2026-10-06', type: 'health_reimbursement', amount: 20, status: 'cleared', accountId: 'acc1' },
        { id: 'r3', linkedId: 'h2', date: '2026-10-07', type: 'health_reimbursement', amount: 30, status: 'pending', accountId: 'acc1' },
        // h3: Over-reimbursement (should cap reste à charge at 0, totalReimbursed at actual sum)
        { id: 'r4', linkedId: 'h3', date: '2026-10-08', type: 'health_reimbursement', amount: 250, status: 'cleared', accountId: 'acc1' }
      ];

      const summary = calculateHealthSummary(expenses, reimbursements);
      
      // Total expenses: 100 + 50 + 200 = 350
      expect(summary.totalExpense).toBe(350);

      // Total reimbursed (cleared): 70 + 20 + 250 = 340
      expect(summary.totalReimbursed).toBe(340);

      // Total expected (pending): 30
      expect(summary.totalExpected).toBe(30);

      // Reste à charge:
      // h1: 100 - 70 = 30
      // h2: 50 - 20 (cleared only) = 30
      // h3: 200 - 250 = -50 -> max(0, -50) = 0
      // Total remaining = 30 + 30 + 0 = 60
      expect(summary.totalRemaining).toBe(60);
    });

    it('calculateMonthlyHealthSummary : inclut les remboursements attendus des mois passés sans doublon ni inclusion de cleared', () => {
      // Octobre : 30 € pending
      const pastPending: Transaction[] = [
        { id: 'r-oct', linkedId: 'h-oct', date: '2026-10-15', type: 'health_reimbursement', amount: 30, status: 'pending', accountId: 'acc1' }
      ];
      // Novembre : 20 € pending
      const novReimb: Transaction[] = [
        { id: 'r-nov', linkedId: 'h-nov', date: '2026-11-10', type: 'health_reimbursement', amount: 20, status: 'pending', accountId: 'acc1' }
      ];
      const novExpenses: Transaction[] = [
        { id: 'h-nov', date: '2026-11-02', type: 'health_expense', amount: 80, status: 'cleared', accountId: 'acc1' }
      ];

      // En novembre, total attendu doit être 30 + 20 = 50 €
      const summary = calculateMonthlyHealthSummary(novExpenses, novReimb, pastPending);
      expect(summary.totalExpected).toBe(50);
      expect(summary.totalReimbursed).toBe(0); // aucun cleared
      expect(summary.totalRemaining).toBe(80); // 80 - 0 = 80

      // Si un remboursement cleared supplémentaire existe, il ne doit PAS être dans totalExpected
      const clearedReimb: Transaction = {
        id: 'r-cleared', linkedId: 'h-nov', date: '2026-11-12', type: 'health_reimbursement', amount: 40, status: 'cleared', accountId: 'acc1'
      };
      const summaryWithCleared = calculateMonthlyHealthSummary(novExpenses, [...novReimb, clearedReimb], pastPending);
      expect(summaryWithCleared.totalExpected).toBe(50); // Toujours 50 €, r-cleared est exclu de l'attendu
      expect(summaryWithCleared.totalReimbursed).toBe(40);

      // Si le même remboursement est présent dans les deux listes, aucun double comptage
      const summaryDuplicate = calculateMonthlyHealthSummary(novExpenses, [...novReimb, pastPending[0]], pastPending);
      expect(summaryDuplicate.totalExpected).toBe(50); // Idempotent, pas de 80 €
    });
  });

  describe('Loan Calculations', () => {
    it('calculates loan progress correctly', () => {
      expect(calculateLoanProgress(10000, 10000)).toBe(0);
      expect(calculateLoanProgress(10000, 5000)).toBe(50);
      expect(calculateLoanProgress(10000, 0)).toBe(100);
      expect(calculateLoanProgress(10000, -500)).toBe(100); // capped at 100%
      expect(calculateLoanProgress(0, 0)).toBe(0);
    });

    it('summarizes loan payments correctly without double counting', () => {
      const loanTransactions: Transaction[] = [
        { id: 'p1', date: '2026-10-01', type: 'loan_payment', amount: 500, status: 'cleared', accountId: 'acc1', linkedId: 'loan1' },
        { id: 'p2', date: '2026-11-01', type: 'loan_payment', amount: 500, status: 'pending', accountId: 'acc1', linkedId: 'loan1' },
        { id: 'p3', date: '2026-12-01', type: 'loan_payment', amount: 500, status: 'planned', accountId: 'acc1', linkedId: 'loan1' },
        { id: 'p4', date: '2026-12-01', type: 'loan_payment', amount: 200, status: 'cleared', accountId: 'acc1', linkedId: 'loan2' } // other loan
      ];

      const summary = getLoanPaymentsSummary('loan1', loanTransactions);
      
      expect(summary.cleared).toBe(500);
      expect(summary.pending).toBe(500);
      expect(summary.planned).toBe(500);
    });

    it('calcule correctement la part amortie d\'une mensualité avec intérêts et assurance', () => {
      // Mensualité 500 €, capital 10 000 €, taux 2.4 % (0.2 % mensuel = 20 €), assurance 15 €
      // Part amortie = 500 - 20 - 15 = 465 €
      expect(calculateAmortizedCapital(500, 10000, 2.4, 15)).toBe(465);

      // Prêt sans taux (taux 0) et sans assurance
      // Part amortie = 500 - 0 - 0 = 500 €
      expect(calculateAmortizedCapital(500, 10000, 0, 0)).toBe(500);

      // Arrondi exact au centime
      // 10 000 * (1.75 / 100 / 12) = 14.5833... -> 300 - 14.5833 - 10 = 275.4166... -> 275.42 €
      expect(calculateAmortizedCapital(300, 10000, 1.75, 10)).toBe(275.42);

      // Si les intérêts et assurance dépassent la mensualité, retourne 0 (aucun amortissement négatif)
      // Mensualité 30 €, intérêts 50 €, assurance 10 € -> 0 €
      expect(calculateAmortizedCapital(30, 100000, 5.0, 10)).toBe(0);

      // Données invalides ou nulles
      expect(calculateAmortizedCapital(0, 10000, 2.0, 10)).toBe(0);
      expect(calculateAmortizedCapital(-500, 10000, 2.0, 10)).toBe(0);
      expect(calculateAmortizedCapital(500, -10000, 2.0, 10)).toBe(0);
      expect(calculateAmortizedCapital(NaN, 10000, 2.0, 10)).toBe(0);
    });
  });
});
