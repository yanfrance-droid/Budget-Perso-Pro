import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { getTransactionById, type TransactionData } from './transactionService.ts';

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

export interface LoanPaymentHistoryData {
  id?: string;
  loanId: string;
  effectiveMonth: string; // YYYY-MM
  monthlyPayment: number;
  previousPayment?: number | null;
  notes?: string | null;
  createdAt?: string;
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
  const existing = getLoanById(db, id);
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

  // Pour un nouveau prêt, initialiser immédiatement le palier initial d'historique de mensualité
  if (!existing) {
    const now = new Date().toISOString();
    const baselineMonth = toSave.startDate && /^\d{4}-\d{2}/.test(toSave.startDate)
      ? toSave.startDate.slice(0, 7)
      : now.slice(0, 7);
    try {
      db.prepare(`
        INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, previousPayment, notes, createdAt)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(crypto.randomUUID(), id, baselineMonth, monthlyPayment, 'Mensualité contractuelle initiale', now);
    } catch {
      // Ignorer si la table n'est pas encore créée dans un contexte de test isolé
    }
  }

  return getLoanById(db, id)!;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const spName = `sp_${crypto.randomUUID().replace(/-/g, '_')}`;
  db.exec(`SAVEPOINT ${spName};`);
  try {
    const result = fn();
    db.exec(`RELEASE ${spName};`);
    return result;
  } catch (err) {
    db.exec(`ROLLBACK TO ${spName}; RELEASE ${spName};`);
    throw err;
  }
}

/**
 * Calcule la part de capital amorti pour une mensualité de crédit.
 * Règle métier : mensualité - intérêts - assurance.
 * Si les intérêts et l'assurance dépassent ou égalent la mensualité (ex: différé),
 * aucun capital n'est amorti (retourne 0).
 * Arrondi au centime d'euro le plus proche (2 décimales).
 */
export function calculateAmortizedCapitalServer(
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

  return Math.round(capitalPart * 100) / 100;
}

/**
 * Synchronise atomiquement le capital restant dû du/des crédits associés lors
 * d'une création, modification, changement de statut ou suppression de mensualité.
 * Doit être appelé à l'intérieur d'une transaction SQLite / SAVEPOINT.
 */
export function syncLoanCapitalForTransaction(
  db: DatabaseSync,
  oldTx: TransactionData | null,
  newTx: TransactionData | null
): void {
  const isOldClearedLoanPayment = Boolean(
    oldTx &&
    oldTx.type === 'loan_payment' &&
    oldTx.status === 'cleared' &&
    oldTx.linkedId
  );

  const isNewClearedLoanPayment = Boolean(
    newTx &&
    newTx.type === 'loan_payment' &&
    newTx.status === 'cleared' &&
    newTx.linkedId
  );

  // Cas 1 : Aucun impact sur les crédits
  if (!isOldClearedLoanPayment && !isNewClearedLoanPayment) {
    return;
  }

  // Cas 2 : Même crédit et les deux transactions sont 'cleared' (modification montant ou amorti)
  if (isOldClearedLoanPayment && isNewClearedLoanPayment && oldTx!.linkedId === newTx!.linkedId) {
    const loan = getLoanById(db, newTx!.linkedId!);
    if (!loan) return;

    const oldAmortized = oldTx!.amortizedCapital !== undefined && oldTx!.amortizedCapital !== null
      ? Math.round(Number(oldTx!.amortizedCapital) * 100) / 100
      : 0;

    let newAmortized = newTx!.amortizedCapital;
    if (newAmortized === undefined || newAmortized === null || isNaN(Number(newAmortized))) {
      // Pour recalculer la nouvelle part amortie avec précision si non fournie,
      // la base de capital avant cette mensualité est loan.remainingCapital + oldAmortized
      const baseCapital = Math.round((loan.remainingCapital + oldAmortized) * 100) / 100;
      newAmortized = calculateAmortizedCapitalServer(
        newTx!.amount,
        baseCapital,
        loan.interestRate,
        loan.insurancePart
      );
      newTx!.amortizedCapital = newAmortized;
      if (newTx!.id) {
        const updateTxStmt = db.prepare('UPDATE transactions SET amortizedCapital = ? WHERE id = ?');
        updateTxStmt.run(newAmortized, newTx!.id);
      }
    } else {
      newAmortized = Math.round(Number(newAmortized) * 100) / 100;
    }

    const delta = Math.round((oldAmortized - newAmortized) * 100) / 100;
    if (delta !== 0) {
      const updatedRemainingCapital = Math.max(0, Math.round((loan.remainingCapital + delta) * 100) / 100);
      const stmt = db.prepare('UPDATE loans SET remainingCapital = ? WHERE id = ?');
      stmt.run(updatedRemainingCapital, loan.id!);
    }
    return;
  }

  // Cas 3 : Restitution du capital sur l'ancien prêt si l'ancienne mensualité était réglée
  if (isOldClearedLoanPayment) {
    const oldLoan = getLoanById(db, oldTx!.linkedId!);
    if (oldLoan) {
      const restoredCapital = oldTx!.amortizedCapital !== undefined && oldTx!.amortizedCapital !== null
        ? Math.round(Number(oldTx!.amortizedCapital) * 100) / 100
        : 0;
      if (restoredCapital > 0) {
        const updatedRemainingCapital = Math.round((oldLoan.remainingCapital + restoredCapital) * 100) / 100;
        const stmt = db.prepare('UPDATE loans SET remainingCapital = ? WHERE id = ?');
        stmt.run(updatedRemainingCapital, oldLoan.id!);
      }
    }
  }

  // Cas 4 : Déduction du capital sur le nouveau prêt si la nouvelle mensualité est réglée
  if (isNewClearedLoanPayment) {
    const newLoan = getLoanById(db, newTx!.linkedId!);
    if (newLoan) {
      let amortized = newTx!.amortizedCapital;
      if (amortized === undefined || amortized === null || isNaN(Number(amortized))) {
        amortized = calculateAmortizedCapitalServer(
          newTx!.amount,
          newLoan.remainingCapital,
          newLoan.interestRate,
          newLoan.insurancePart
        );
        newTx!.amortizedCapital = amortized;
        if (newTx!.id) {
          const updateTxStmt = db.prepare('UPDATE transactions SET amortizedCapital = ? WHERE id = ?');
          updateTxStmt.run(amortized, newTx!.id);
        }
      } else {
        amortized = Math.round(Number(amortized) * 100) / 100;
      }

      if (amortized > 0) {
        const updatedRemainingCapital = Math.max(0, Math.round((newLoan.remainingCapital - amortized) * 100) / 100);
        const stmt = db.prepare('UPDATE loans SET remainingCapital = ? WHERE id = ?');
        stmt.run(updatedRemainingCapital, newLoan.id!);
      }
    }
  }
}

export function updateLoanPaymentStatus(
  db: DatabaseSync,
  paymentId: string,
  newStatus: 'planned' | 'pending' | 'cleared' | 'disabled'
): { payment: any; loan: LoanData } {
  return withTransaction(db, () => {
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
      return { payment, loan };
    }

    const oldTx = { ...payment };
    const newTx = { ...payment, status: newStatus };

    syncLoanCapitalForTransaction(db, oldTx, newTx);

    const updatePaymentStmt = db.prepare(`
      UPDATE transactions
      SET status = ?, amortizedCapital = ?
      WHERE id = ?
    `);
    updatePaymentStmt.run(newStatus, newTx.amortizedCapital ?? null, paymentId);

    return {
      payment: getTransactionById(db, paymentId)!,
      loan: getLoanById(db, loan.id!)!
    };
  });
}

export function deleteLoan(db: DatabaseSync, id: string): void {
  withTransaction(db, () => {
    // 1. Supprime toutes les transactions associées à ce prêt qui ne sont pas encore pointées/payées
    db.prepare("DELETE FROM transactions WHERE linkedId = ? AND status != 'cleared'").run(id);

    // 2. Détache les transactions déjà payées pour préserver l'historique bancaire sans référence orpheline
    db.prepare("UPDATE transactions SET linkedId = NULL WHERE linkedId = ? AND status = 'cleared'").run(id);

    // 3. Supprime l'historique des paliers du prêt
    db.prepare('DELETE FROM loan_payment_history WHERE loanId = ?').run(id);

    // 4. Supprime le prêt de la table loans
    const stmt = db.prepare('DELETE FROM loans WHERE id = ?');
    stmt.run(id);
  });
}

export function getLoanPaymentHistory(db: DatabaseSync, loanId: string): LoanPaymentHistoryData[] {
  const stmt = db.prepare('SELECT * FROM loan_payment_history WHERE loanId = ? ORDER BY effectiveMonth DESC, createdAt DESC');
  const rows = stmt.all(loanId) as any[];
  return rows.map(r => ({
    ...r,
    monthlyPayment: Number(r.monthlyPayment),
    previousPayment: r.previousPayment !== null && r.previousPayment !== undefined ? Number(r.previousPayment) : null
  }));
}

export function getEffectiveMonthlyPayment(db: DatabaseSync, loanId: string, targetMonth: string): number {
  try {
    const stmt = db.prepare(`
      SELECT monthlyPayment FROM loan_payment_history
      WHERE loanId = ? AND effectiveMonth <= ?
      ORDER BY effectiveMonth DESC, createdAt DESC
      LIMIT 1
    `);
    const row = stmt.get(loanId, targetMonth) as any;
    if (row) {
      return Number(row.monthlyPayment);
    }

    const oldestStmt = db.prepare(`
      SELECT monthlyPayment FROM loan_payment_history
      WHERE loanId = ?
      ORDER BY effectiveMonth ASC, createdAt ASC
      LIMIT 1
    `);
    const oldestRow = oldestStmt.get(loanId) as any;
    if (oldestRow) {
      return Number(oldestRow.monthlyPayment);
    }
  } catch {
    // Si la table n'existe pas encore dans un test isolé
  }

  const loan = getLoanById(db, loanId);
  return loan ? Number(loan.monthlyPayment) : 0;
}

export function addLoanPaymentHistory(
  db: DatabaseSync,
  data: { loanId: string; effectiveMonth: string; monthlyPayment: number; notes?: string }
): LoanPaymentHistoryData {
  return withTransaction(db, () => {
    const loan = getLoanById(db, data.loanId);
    if (!loan) {
      throw new Error(`Crédit ${data.loanId} introuvable.`);
    }

    if (!data.effectiveMonth || !/^\d{4}-\d{2}$/.test(data.effectiveMonth)) {
      throw new Error('Le mois d\'effet doit être au format YYYY-MM.');
    }

    const amount = Number(data.monthlyPayment);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Le montant de la nouvelle mensualité doit être supérieur à 0.');
    }

    const previousPayment = getEffectiveMonthlyPayment(db, data.loanId, data.effectiveMonth);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, previousPayment, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, data.loanId, data.effectiveMonth, amount, previousPayment, data.notes || null, now);

    const currentMonth = now.slice(0, 7);
    if (data.effectiveMonth <= currentMonth) {
      const updateLoanStmt = db.prepare('UPDATE loans SET monthlyPayment = ? WHERE id = ?');
      updateLoanStmt.run(amount, data.loanId);
    }

    return {
      id,
      loanId: data.loanId,
      effectiveMonth: data.effectiveMonth,
      monthlyPayment: amount,
      previousPayment,
      notes: data.notes || null,
      createdAt: now
    };
  });
}

export function deleteLoanPaymentHistory(db: DatabaseSync, historyId: string, allowPastCorrection = false): void {
  withTransaction(db, () => {
    const stmt = db.prepare('SELECT * FROM loan_payment_history WHERE id = ?');
    const row = stmt.get(historyId) as any;
    if (!row) {
      throw new Error('Palier d\'historique introuvable.');
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const isFuture = row.effectiveMonth > currentMonth;

    if (!isFuture && !allowPastCorrection) {
      throw new Error('La suppression d’un palier en vigueur ou passé requiert une procédure explicite de correction.');
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM loan_payment_history WHERE loanId = ?').get(row.loanId) as { count: number };
    if (countRow.count <= 1) {
      throw new Error('Impossible de supprimer le palier contractuel initial de référence.');
    }

    db.prepare('DELETE FROM loan_payment_history WHERE id = ?').run(historyId);

    const newCurrent = getEffectiveMonthlyPayment(db, row.loanId, currentMonth);
    db.prepare('UPDATE loans SET monthlyPayment = ? WHERE id = ?').run(newCurrent, row.loanId);
  });
}

export function archiveLoan(
  db: DatabaseSync,
  loanId: string,
  isArchived: boolean,
  disableFuturePlanned = false
): { loan: LoanData; disabledCount: number } {
  return withTransaction(db, () => {
    const loan = getLoanById(db, loanId);
    if (!loan) {
      throw new Error(`Crédit ${loanId} introuvable.`);
    }

    const updateStmt = db.prepare('UPDATE loans SET isArchived = ? WHERE id = ?');
    updateStmt.run(isArchived ? 1 : 0, loanId);

    let disabledCount = 0;
    if (isArchived && disableFuturePlanned) {
      const today = new Date().toISOString().split('T')[0];
      const disableStmt = db.prepare(`
        UPDATE transactions
        SET status = 'disabled', isCustomized = 1
        WHERE linkedId = ? AND type = 'loan_payment' AND status = 'planned' AND date >= ?
      `);
      const res = disableStmt.run(loanId, today);
      disabledCount = Number(res.changes) || 0;
    }

    return {
      loan: getLoanById(db, loanId)!,
      disabledCount
    };
  });
}

export function reactivateLoanFuturePlanned(db: DatabaseSync, loanId: string): number {
  return withTransaction(db, () => {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
      UPDATE transactions
      SET status = 'planned'
      WHERE linkedId = ? AND type = 'loan_payment' AND status = 'disabled' AND date >= ?
    `);
    const res = stmt.run(loanId, today);
    return Number(res.changes) || 0;
  });
}

export interface LoanPayoffEstimate {
  possible: boolean;
  reason?: string;
  monthsRemaining?: number;
  estimatedEndMonth?: string;
  lastPaymentAmount?: number;
  totalInterest?: number;
  totalInsurance?: number;
  totalCost?: number;
}

export function estimateLoanPayoff(params: {
  remainingCapital: number;
  monthlyPayment: number;
  interestRate?: number;
  insurancePart?: number;
  startMonth?: string; // YYYY-MM
}): LoanPayoffEstimate {
  const capital = Number(params.remainingCapital) || 0;
  const payment = Number(params.monthlyPayment) || 0;
  const rate = Number(params.interestRate) || 0;
  const insurance = Number(params.insurancePart) || 0;
  const startMonth = params.startMonth || new Date().toISOString().slice(0, 7);

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
