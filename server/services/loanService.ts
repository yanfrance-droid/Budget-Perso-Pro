import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { getTransactionById, saveTransaction } from './transactionService.ts';

export interface LoanData {
  id?: string;
  name: string;
  lender: string;
  initialAmount: number;
  remainingCapital: number;
  monthlyPayment: number;
  interestRate?: number;
  insurancePart?: number;
  startDate: string;
  durationMonths: number;
  endDate?: string;
  debitDay?: number;
  prepaidInstallments?: number;
  monthsAdjustment?: number;
  accountId: string;
  notes?: string;
  isArchived?: boolean;
  isPaused?: boolean;
  loanType?: 'consumer' | 'mortgage';
}

export function getAllLoans(db: DatabaseSync): LoanData[] {
  const stmt = db.prepare('SELECT * FROM loans ORDER BY isArchived ASC, name ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    initialAmount: Number(r.initialAmount),
    remainingCapital: Number(r.remainingCapital),
    monthlyPayment: Number(r.monthlyPayment),
    interestRate: r.interestRate !== null ? Number(r.interestRate) : undefined,
    insurancePart: r.insurancePart !== null ? Number(r.insurancePart) : undefined,
    isArchived: Boolean(r.isArchived),
    isPaused: Boolean(r.isPaused)
  }));
}

export function getLoanById(db: DatabaseSync, id: string): LoanData | null {
  const stmt = db.prepare('SELECT * FROM loans WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    ...row,
    initialAmount: Number(row.initialAmount),
    remainingCapital: Number(row.remainingCapital),
    monthlyPayment: Number(row.monthlyPayment),
    interestRate: row.interestRate !== null ? Number(row.interestRate) : undefined,
    insurancePart: row.insurancePart !== null ? Number(row.insurancePart) : undefined,
    isArchived: Boolean(row.isArchived),
    isPaused: Boolean(row.isPaused)
  };
}

export function saveLoan(db: DatabaseSync, data: LoanData): LoanData {
  let toSave = { ...data };
  if (data.id) {
    const existing = getLoanById(db, data.id);
    if (existing) {
      toSave = { ...existing, ...data };
    }
  }

  if (!toSave.name || toSave.name.trim().length === 0) {
    throw new Error('Le nom du crédit est obligatoire.');
  }
  if (!toSave.lender || toSave.lender.trim().length === 0) {
    throw new Error('Le prêteur / organisme est obligatoire.');
  }
  if (toSave.initialAmount === undefined || isNaN(Number(toSave.initialAmount)) || Number(toSave.initialAmount) <= 0) {
    throw new Error('Le montant initial doit être supérieur à 0.');
  }
  if (toSave.monthlyPayment === undefined || isNaN(Number(toSave.monthlyPayment)) || Number(toSave.monthlyPayment) <= 0) {
    throw new Error('La mensualité doit être supérieure à 0.');
  }

  const id = toSave.id || crypto.randomUUID();
  const initialAmount = Number(toSave.initialAmount);
  const remainingCapital = toSave.remainingCapital !== undefined ? Number(toSave.remainingCapital) : initialAmount;
  const monthlyPayment = Number(toSave.monthlyPayment);
  const isArchived = toSave.isArchived ? 1 : 0;
  const isPaused = toSave.isPaused ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO loans (
      id, name, lender, initialAmount, remainingCapital, monthlyPayment,
      interestRate, insurancePart, startDate, durationMonths, endDate,
      debitDay, prepaidInstallments, monthsAdjustment, accountId, notes,
      isArchived, isPaused, loanType
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      lender = excluded.lender,
      initialAmount = excluded.initialAmount,
      remainingCapital = excluded.remainingCapital,
      monthlyPayment = excluded.monthlyPayment,
      interestRate = excluded.interestRate,
      insurancePart = excluded.insurancePart,
      startDate = excluded.startDate,
      durationMonths = excluded.durationMonths,
      endDate = excluded.endDate,
      debitDay = excluded.debitDay,
      prepaidInstallments = excluded.prepaidInstallments,
      monthsAdjustment = excluded.monthsAdjustment,
      accountId = excluded.accountId,
      notes = excluded.notes,
      isArchived = excluded.isArchived,
      isPaused = excluded.isPaused,
      loanType = excluded.loanType
  `);

  stmt.run(
    id,
    toSave.name.trim(),
    toSave.lender.trim(),
    initialAmount,
    remainingCapital,
    monthlyPayment,
    toSave.interestRate !== undefined ? Number(toSave.interestRate) : 0,
    toSave.insurancePart !== undefined ? Number(toSave.insurancePart) : 0,
    toSave.startDate,
    Number(toSave.durationMonths) || 12,
    toSave.endDate || null,
    toSave.debitDay !== undefined ? Number(toSave.debitDay) : null,
    toSave.prepaidInstallments !== undefined ? Number(toSave.prepaidInstallments) : 0,
    toSave.monthsAdjustment !== undefined ? Number(toSave.monthsAdjustment) : 0,
    toSave.accountId,
    toSave.notes || null,
    isArchived,
    isPaused,
    toSave.loanType || 'consumer'
  );

  return getLoanById(db, id)!;
}

export function updateLoanPaymentStatus(
  db: DatabaseSync,
  paymentId: string,
  newStatus: 'planned' | 'pending' | 'cleared' | 'disabled'
): { payment: any; loan: LoanData } {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const payment = getTransactionById(db, paymentId);
    if (!payment) {
      throw new Error(`Mensualité de prêt ${paymentId} introuvable.`);
    }
    if (!payment.linkedId) {
      throw new Error(`La transaction ${paymentId} n'est associée à aucun crédit.`);
    }

    const loan = getLoanById(db, payment.linkedId);
    if (!loan) {
      throw new Error(`Crédit associé ${payment.linkedId} introuvable.`);
    }

    const oldStatus = payment.status;
    if (oldStatus === newStatus) {
      db.exec('COMMIT;');
      return { payment, loan };
    }

    // Calcul du capital amorti
    let capitalToDeduct = payment.amortizedCapital;
    if (capitalToDeduct === undefined) {
      // Déduire le capital à partir de la mensualité et des taux
      const insurance = Number(loan.insurancePart) || 0;
      const annualRate = Number(loan.interestRate) || 0;
      const monthlyRate = annualRate / 100 / 12;
      const interest = loan.remainingCapital * monthlyRate;
      capitalToDeduct = payment.amount - insurance - interest;
    }

    if (capitalToDeduct === undefined || isNaN(capitalToDeduct) || capitalToDeduct < 0) {
      throw new Error(`Impossible de calculer le capital amorti de la mensualité ${paymentId}.`);
    }

    let updatedRemainingCapital = loan.remainingCapital;

    // Règle 1 : Passage vers 'cleared' -> déduction du capital restant
    if (newStatus === 'cleared' && oldStatus !== 'cleared') {
      updatedRemainingCapital = Math.max(0, loan.remainingCapital - capitalToDeduct);
    }
    // Règle 2 : Rétablissement depuis 'cleared' vers autre statut -> restitution du capital
    else if (oldStatus === 'cleared' && newStatus !== 'cleared') {
      updatedRemainingCapital = loan.remainingCapital + capitalToDeduct;
    }

    // Mise à jour de la mensualité
    const updatePaymentStmt = db.prepare(`
      UPDATE transactions
      SET status = ?, amortizedCapital = ?
      WHERE id = ?
    `);
    updatePaymentStmt.run(newStatus, capitalToDeduct, paymentId);

    // Mise à jour du capital restant du crédit
    const updateLoanStmt = db.prepare(`
      UPDATE loans
      SET remainingCapital = ?
      WHERE id = ?
    `);
    updateLoanStmt.run(updatedRemainingCapital, loan.id!);

    db.exec('COMMIT;');

    return {
      payment: getTransactionById(db, paymentId)!,
      loan: getLoanById(db, loan.id!)!
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function deleteLoan(db: DatabaseSync, id: string): void {
  const stmt = db.prepare('DELETE FROM loans WHERE id = ?');
  stmt.run(id);
}
