import type { Transaction, Account, Loan } from '../db/database';

export const EXPENSE_TYPES = [
  'fixed_expense',
  'variable_expense',
  'daily',
  'health_expense',
  'loan_payment',
  'transfer'
] as const;

export type ExpenseType = typeof EXPENSE_TYPES[number];

/**
 * Arrondit strictement au centime d'euro le plus proche (2 décimales)
 * et neutralise tout résidu négatif infinitésimal (-0 ou -2.84e-14 issu de IEEE 754).
 */
export function roundCurrency(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getTransactionImpact(t: Transaction): number {
  if (t.type === 'income') return t.amount;
  if (['fixed_expense', 'variable_expense', 'daily', 'health_expense', 'loan_payment'].includes(t.type)) {
    return -t.amount;
  }
  if (t.type === 'transfer') {
    return -Math.abs(t.amount); // Treat savings as a negative impact on the account
  }
  if (t.type === 'health_reimbursement') {
    return t.amount;
  }
  return 0;
}

export function calculateRealBalance(account: Account, transactions: Transaction[]): number {
  const sum = account.initialBalance + transactions
    .filter(t => (t.accountId === account.id || t.destinationAccountId === account.id) && t.status === 'cleared')
    .reduce((s, t) => {
      if (t.type === 'transfer') {
        if (t.accountId === account.id && t.destinationAccountId === account.id) {
          return s;
        }
        if (t.destinationAccountId === account.id) {
          return s + Math.abs(t.amount);
        }
        if (t.accountId === account.id) {
          return s - Math.abs(t.amount);
        }
      }
      return s + getTransactionImpact(t);
    }, 0);
  return roundCurrency(sum);
}

export function calculateAvailableBalance(account: Account, transactions: Transaction[]): number {
  const sum = account.initialBalance + transactions
    .filter(t => (t.accountId === account.id || t.destinationAccountId === account.id) && ['cleared', 'pending'].includes(t.status))
    .reduce((s, t) => {
      if (t.type === 'transfer') {
        if (t.accountId === account.id && t.destinationAccountId === account.id) {
          return s;
        }
        if (t.destinationAccountId === account.id) {
          return s + Math.abs(t.amount);
        }
        if (t.accountId === account.id) {
          return s - Math.abs(t.amount);
        }
      }
      return s + getTransactionImpact(t);
    }, 0);
  return roundCurrency(sum);
}

export function calculateForecastedBalance(account: Account, transactions: Transaction[]): number {
  const sum = account.initialBalance + transactions
    .filter(t => (t.accountId === account.id || t.destinationAccountId === account.id) && t.status !== 'disabled')
    .reduce((s, t) => {
      if (t.type === 'transfer') {
        if (t.accountId === account.id && t.destinationAccountId === account.id) {
          return s;
        }
        if (t.destinationAccountId === account.id) {
          return s + Math.abs(t.amount);
        }
        if (t.accountId === account.id) {
          return s - Math.abs(t.amount);
        }
      }
      return s + getTransactionImpact(t);
    }, 0);
  return roundCurrency(sum);
}

export function calculateResteAVivre(
  transactions: Transaction[], 
  monthPrefix: string, // format: "YYYY-MM"
  includeSavingsAsExpense: boolean
): number {
  const monthTransactions = transactions.filter(t => {
    if (t.status === 'disabled') return false;
    if (t.recurrenceDay && !t.templateId) {
      return monthPrefix >= t.date.substring(0, 7);
    }
    return t.date.startsWith(monthPrefix);
  });
  
  const incomes = monthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
  const healthReimbursements = monthTransactions
    .filter(t => t.type === 'health_reimbursement' && t.status === 'cleared')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
  let expenses = monthTransactions
    .filter(t => ['fixed_expense', 'variable_expense', 'daily', 'health_expense', 'loan_payment'].includes(t.type))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
  if (includeSavingsAsExpense) {
    const savingsOut = monthTransactions
      .filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    expenses += savingsOut;
  }
  
  return roundCurrency(incomes + healthReimbursements - expenses);
}

export function applyLoanPayment(loan: Loan, paymentAmount: number, isInterestIncluded: boolean, interestAmount: number = 0): Loan {
  const capitalPaid = isInterestIncluded ? paymentAmount - interestAmount : paymentAmount;
  return {
    ...loan,
    remainingCapital: Math.max(0, loan.remainingCapital - capitalPaid)
  };
}

export interface HealthSummary {
  totalExpense: number;
  totalReimbursed: number;
  totalExpected: number;
  totalRemaining: number;
}

export function calculateHealthSummary(expenses: Transaction[], reimbursements: Transaction[]): HealthSummary {
  let totalExpense = 0;
  let totalReimbursed = 0;
  let totalExpected = 0;
  let totalRemaining = 0;

  expenses.forEach(exp => {
    const expAmt = Number(exp.amount) || 0;
    totalExpense += expAmt;

    const expReimbs = reimbursements.filter(r => r.linkedId === exp.id);
    let clearedR = 0;
    let expectedR = 0;

    expReimbs.forEach(r => {
      const rAmt = Number(r.amount) || 0;
      if (r.status === 'cleared') clearedR += rAmt;
      else expectedR += rAmt; // pending or planned
    });

    totalReimbursed += clearedR;
    totalExpected += expectedR;
    
    // Reste à charge ne doit jamais être négatif
    const remaining = Math.max(0, expAmt - clearedR);
    totalRemaining += remaining;
  });

  return {
    totalExpense: roundCurrency(totalExpense),
    totalReimbursed: roundCurrency(totalReimbursed),
    totalExpected: roundCurrency(totalExpected),
    totalRemaining: roundCurrency(totalRemaining)
  };
}

/**
 * Calcul mensuel rigoureux du poste Santé pour un mois donné :
 * - Dépenses du mois (selon leur date de soin)
 * - Remboursements perçus/attendus durant ce mois (selon leur propre date de versement,
 *   y compris s'ils concernent un soin antérieur)
 * - Ne force pas le reste à charge / solde net à zéro : un solde négatif est légitime
 *   si les remboursements reçus dépassent les dépenses de soins du mois.
 */
export function calculateMonthlyHealthSummary(
  monthExpenses: Transaction[],
  monthReimbursements: Transaction[],
  pastPendingReimbursements: Transaction[] = []
): HealthSummary {
  const activeExpenses = monthExpenses.filter(e => e.status !== 'disabled');
  const activeReimbursements = monthReimbursements.filter(r => r.status !== 'disabled');
  const activePast = pastPendingReimbursements.filter(
    r => r.status !== 'disabled' && (r.status === 'planned' || r.status === 'pending')
  );

  const totalExpense = activeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const clearedReimbursements = activeReimbursements.filter(r => r.status === 'cleared');
  const expectedThisMonth = activeReimbursements.filter(
    r => r.status === 'planned' || r.status === 'pending'
  );

  const totalReimbursed = clearedReimbursements.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  
  // Total attendu : prévu/en attente ce mois + prévu/en attente des mois passés non encaissés
  // Chaque transaction est comptabilisée une seule fois
  const seenIds = new Set<string>();
  let totalExpected = 0;
  for (const r of [...expectedThisMonth, ...activePast]) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      totalExpected += (Number(r.amount) || 0);
    }
  }
  
  // Solde net santé du mois (peut être négatif si les remboursements du mois dépassent les dépenses)
  const totalRemaining = totalExpense - totalReimbursed;

  return {
    totalExpense: roundCurrency(totalExpense),
    totalReimbursed: roundCurrency(totalReimbursed),
    totalExpected: roundCurrency(totalExpected),
    totalRemaining: roundCurrency(totalRemaining)
  };
}

export function calculateLoanProgress(initialAmount: number, remainingCapital: number): number {
  if (initialAmount <= 0) return 0;
  const progress = ((initialAmount - remainingCapital) / initialAmount) * 100;
  return Math.min(100, Math.max(0, progress));
}

export interface LoanPaymentsSummary {
  planned: number;
  pending: number;
  cleared: number;
}

export function getLoanPaymentsSummary(loanId: string, transactions: Transaction[]): LoanPaymentsSummary {
  const loanPayments = transactions.filter(t => t.type === 'loan_payment' && t.linkedId === loanId);
  return {
    planned: loanPayments.filter(t => t.status === 'planned').reduce((sum, t) => sum + t.amount, 0),
    pending: loanPayments.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0),
    cleared: loanPayments.filter(t => t.status === 'cleared').reduce((sum, t) => sum + t.amount, 0)
  };
}

/**
 * Calcule la part de capital amorti pour une mensualité de crédit.
 * Règle métier : mensualité - intérêts - assurance.
 * Si les intérêts et l'assurance dépassent ou égalent la mensualité (ex: différé, frais élevés),
 * aucun capital n'est amorti (retourne 0).
 * Arrondi au centime d'euro le plus proche.
 */
export function calculateAmortizedCapital(
  amount: number,
  remainingCapital: number,
  interestRate?: number,
  insurancePart?: number
): number {
  if (isNaN(amount) || amount <= 0 || isNaN(remainingCapital) || remainingCapital < 0) {
    return 0;
  }
  const rate = Number(interestRate) || 0;
  const insurance = Number(insurancePart) || 0;
  const remaining = Number(remainingCapital) || 0;

  const monthlyRate = rate / 100 / 12;
  const interest = remaining * monthlyRate;
  const capitalPart = amount - interest - insurance;

  if (capitalPart <= 0) {
    return 0;
  }

  // Plafonnement au capital restant dû : le capital amorti ne peut excéder le solde restant du prêt
  const cappedCapital = Math.min(capitalPart, remaining);
  return Math.round(cappedCapital * 100) / 100;
}

import { getCurrentMonth } from '../utils/dateUtils';
export interface LoanPayoffEstimateClient {
  possible: boolean;
  reason?: string;
  monthsRemaining?: number;
  estimatedEndMonth?: string;
  lastPaymentAmount?: number;
  totalInterest?: number;
  totalInsurance?: number;
  totalCost?: number;
}

/**
 * Calcul actuariel indicatif et transparent de la date d'amortissement complet d'un crédit.
 * Simulation mois par mois au centime d'euro le plus proche, gérant assurance, intérêts et dernier paiement ajusté.
 */
export function estimateLoanPayoffClient(params: {
  remainingCapital: number;
  monthlyPayment: number;
  interestRate?: number;
  insurancePart?: number;
  startMonth?: string; // YYYY-MM
}): LoanPayoffEstimateClient {
  const capital = Number(params.remainingCapital) || 0;
  const payment = Number(params.monthlyPayment) || 0;
  const rate = Number(params.interestRate) || 0;
  const insurance = Number(params.insurancePart) || 0;
  const startMonth = params.startMonth || getCurrentMonth();

  if (capital <= 0) {
    return {
      possible: true,
      monthsRemaining: 0,
      estimatedEndMonth: startMonth,
      lastPaymentAmount: 0,
      totalInterest: 0,
      totalInsurance: 0,
      totalCost: 0
    };
  }

  const netPayment = payment - insurance;
  if (netPayment <= 0) {
    return { possible: false, reason: "La mensualité est inférieure ou égale à la prime d'assurance." };
  }

  const monthlyRate = rate / 100 / 12;
  const firstMonthInterest = Math.round(capital * monthlyRate * 100) / 100;
  if (netPayment <= firstMonthInterest) {
    return { possible: false, reason: "La mensualité ne couvre pas les intérêts mensuels dus." };
  }

  let currentCap = capital;
  let months = 0;
  let totalInterest = 0;
  let totalInsurance = 0;
  let lastPayment = payment;
  const maxMonths = 600; // Sécurité : 50 ans

  const [startY, startM] = startMonth.split('-').map(Number);

  while (currentCap > 0 && months < maxMonths) {
    months++;
    totalInsurance += insurance;
    const interest = Math.round(currentCap * monthlyRate * 100) / 100;
    totalInterest += interest;

    const totalDue = currentCap + interest + insurance;
    if (payment >= totalDue) {
      lastPayment = Math.round(totalDue * 100) / 100;
      currentCap = 0;
      break;
    } else {
      const amortized = Math.round((payment - interest - insurance) * 100) / 100;
      currentCap = Math.max(0, Math.round((currentCap - amortized) * 100) / 100);
      lastPayment = payment;
    }
  }

  if (months >= maxMonths) {
    return { possible: false, reason: "La durée estimée dépasse 50 ans." };
  }

  const endTotalMonths = (startY * 12 + (startM - 1)) + (months - 1);
  const endY = Math.floor(endTotalMonths / 12);
  const endM = (endTotalMonths % 12) + 1;
  const estimatedEndMonth = `${endY}-${String(endM).padStart(2, '0')}`;

  return {
    possible: true,
    monthsRemaining: months,
    estimatedEndMonth,
    lastPaymentAmount: Math.round(lastPayment * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalInsurance: Math.round(totalInsurance * 100) / 100,
    totalCost: Math.round((capital + totalInterest + totalInsurance) * 100) / 100
  };
}

