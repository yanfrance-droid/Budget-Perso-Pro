import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import {
  getLoanById,
  calculateAmortizedCapitalServer,
  syncLoanCapitalForTransaction,
  withTransaction
} from './loanService.ts';
import { syncRollingHorizon, shiftMonthKey } from './recurrenceService.ts';

export interface TransactionData {
  id?: string;
  date: string; // YYYY-MM-DD
  expectedDate?: string;
  recurrenceDay?: number;
  type: string;
  amount: number;
  status: 'planned' | 'pending' | 'cleared' | 'disabled';
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  linkedId?: string;
  label?: string;
  notes?: string;
  paymentMethod?: string;
  checkNumber?: string;
  amortizedCapital?: number;
  templateId?: string;
  isCustomized?: boolean;
  isReconstituted?: boolean;
  payerId?: string;
  deleted_at?: number | null;
}

export function getTransactions(
  db: DatabaseSync,
  filters: { month?: string; accountId?: string; type?: string; status?: string; includeDeleted?: boolean } = {}
): TransactionData[] {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: any[] = [];

  if (!filters.includeDeleted) {
    query += ' AND deleted_at IS NULL';
  }

  if (filters.month) {
    query += ' AND date LIKE ?';
    params.push(`${filters.month}%`);
  }
  if (filters.accountId) {
    query += ' AND (accountId = ? OR destinationAccountId = ?)';
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY date DESC, id DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    amortizedCapital: r.amortizedCapital !== null && r.amortizedCapital !== undefined ? Number(r.amortizedCapital) : undefined,
    isCustomized: Boolean(r.isCustomized),
    isReconstituted: Boolean(r.isReconstituted),
    deleted_at: r.deleted_at !== null && r.deleted_at !== undefined ? Number(r.deleted_at) : null
  }));
}

export function getTransactionById(db: DatabaseSync, id: string): TransactionData | null {
  const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    ...row,
    amount: Number(row.amount),
    amortizedCapital: row.amortizedCapital !== null && row.amortizedCapital !== undefined ? Number(row.amortizedCapital) : undefined,
    isCustomized: Boolean(row.isCustomized),
    isReconstituted: Boolean(row.isReconstituted),
    deleted_at: row.deleted_at !== null && row.deleted_at !== undefined ? Number(row.deleted_at) : null
  };
}

export function saveTransaction(db: DatabaseSync, data: Partial<TransactionData>): TransactionData {
  return withTransaction(db, () => {
    const id = data.id || crypto.randomUUID();

    // Si la transaction existe déjà, on fusionne les champs existants avec les modifications partielles
    let existing: TransactionData | null = null;
    if (data.id) {
      existing = getTransactionById(db, data.id);
    }

    const date = data.date ?? existing?.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('La date doit être au format YYYY-MM-DD.');
    }

    const rawAmount = data.amount !== undefined ? data.amount : existing?.amount;
    if (rawAmount === undefined || rawAmount === null || isNaN(Number(rawAmount))) {
      throw new Error('Le montant de la transaction est invalide.');
    }
    const amount = Number(rawAmount);

    const accountId = data.accountId ?? existing?.accountId;
    if (!accountId) {
      throw new Error('Le compte bancaire associé est obligatoire.');
    }

    const status = data.status ?? existing?.status ?? 'planned';
    if (!['planned', 'pending', 'cleared', 'disabled'].includes(status)) {
      throw new Error(`Statut de transaction invalide : ${status}`);
    }

    const type = data.type ?? existing?.type ?? 'variable_expense';
    const expectedDate = data.expectedDate !== undefined ? (data.expectedDate || null) : (existing?.expectedDate ?? null);
    const recurrenceDay = data.recurrenceDay !== undefined ? (Number(data.recurrenceDay) || null) : (existing?.recurrenceDay ?? null);
    const destinationAccountId = data.destinationAccountId !== undefined ? (data.destinationAccountId || null) : (existing?.destinationAccountId ?? null);
    const categoryId = data.categoryId !== undefined ? (data.categoryId || null) : (existing?.categoryId ?? null);
    const linkedId = data.linkedId !== undefined ? (data.linkedId || null) : (existing?.linkedId ?? (data as any)?.loanId ?? null);
    const label = data.label !== undefined ? (data.label || null) : (existing?.label ?? null);
    const notes = data.notes !== undefined ? (data.notes || null) : (existing?.notes ?? null);
    const paymentMethod = data.paymentMethod !== undefined ? (data.paymentMethod || null) : (existing?.paymentMethod ?? null);
    const checkNumber = data.checkNumber !== undefined ? (data.checkNumber || null) : (existing?.checkNumber ?? null);

    // Calcul ou conservation de la part de capital amorti
    let amortizedCapital: number | null = null;
    if (data.amortizedCapital !== undefined && data.amortizedCapital !== null && !isNaN(Number(data.amortizedCapital))) {
      amortizedCapital = Math.round(Number(data.amortizedCapital) * 100) / 100;
    } else if (existing?.amortizedCapital !== undefined && existing?.amortizedCapital !== null && data.amount === undefined) {
      // Le montant n'a pas changé et une part amortie existait déjà
      amortizedCapital = Number(existing.amortizedCapital);
    } else if (type === 'loan_payment' && linkedId) {
      // Calcul automatique selon les conditions contractuelles du prêt
      const targetLoan = getLoanById(db, linkedId);
      if (targetLoan) {
        const baseCapital = (existing?.type === 'loan_payment' && existing?.status === 'cleared' && existing?.linkedId === linkedId && existing?.amortizedCapital)
          ? Math.round((targetLoan.remainingCapital + Number(existing.amortizedCapital)) * 100) / 100
          : targetLoan.remainingCapital;
        amortizedCapital = calculateAmortizedCapitalServer(
          amount,
          baseCapital,
          targetLoan.interestRate,
          targetLoan.insurancePart
        );
      }
    }

    const templateId = data.templateId !== undefined ? (data.templateId || null) : (existing?.templateId ?? null);
    const isCustomized = (data.isCustomized !== undefined ? data.isCustomized : existing?.isCustomized) ? 1 : 0;
    const isReconstituted = (data.isReconstituted !== undefined ? data.isReconstituted : existing?.isReconstituted) ? 1 : 0;
    const payerId = data.payerId !== undefined ? (data.payerId || null) : (existing?.payerId ?? null);
    const deleted_at = data.deleted_at !== undefined ? (data.deleted_at || null) : (existing?.deleted_at ?? null);

    const stmt = db.prepare(`
      INSERT INTO transactions (
        id, date, expectedDate, recurrenceDay, type, amount, status,
        accountId, destinationAccountId, categoryId, linkedId, label,
        notes, paymentMethod, checkNumber, amortizedCapital, templateId,
        isCustomized, isReconstituted, payerId, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        expectedDate = excluded.expectedDate,
        recurrenceDay = excluded.recurrenceDay,
        type = excluded.type,
        amount = excluded.amount,
        status = excluded.status,
        accountId = excluded.accountId,
        destinationAccountId = excluded.destinationAccountId,
        categoryId = excluded.categoryId,
        linkedId = excluded.linkedId,
        label = excluded.label,
        notes = excluded.notes,
        paymentMethod = excluded.paymentMethod,
        checkNumber = excluded.checkNumber,
        amortizedCapital = excluded.amortizedCapital,
        templateId = excluded.templateId,
        isCustomized = excluded.isCustomized,
        isReconstituted = excluded.isReconstituted,
        payerId = excluded.payerId,
        deleted_at = excluded.deleted_at
    `);

    stmt.run(
      id,
      date,
      expectedDate,
      recurrenceDay,
      type,
      amount,
      status,
      accountId,
      destinationAccountId,
      categoryId,
      linkedId,
      label,
      notes,
      paymentMethod,
      checkNumber,
      amortizedCapital,
      templateId,
      isCustomized,
      isReconstituted,
      payerId,
      deleted_at
    );

    const savedTx = getTransactionById(db, id)!;

    // Synchronisation atomique du capital restant dû du prêt
    if (existing?.type === 'loan_payment' || savedTx.type === 'loan_payment') {
      syncLoanCapitalForTransaction(db, existing, savedTx);
    }

    return getTransactionById(db, id)!;
  });
}

export function deleteTransaction(db: DatabaseSync, id: string): void {
  withTransaction(db, () => {
    const existing = getTransactionById(db, id);
    if (!existing || existing.deleted_at) {
      return;
    }

    // 1. Synchronisation du capital si mensualité de prêt
    if (existing.type === 'loan_payment') {
      syncLoanCapitalForTransaction(db, existing, null);
    }

    // 2. Sécurisation relationnelle : détacher automatiquement les transactions associées (ex: remboursements de soins liés)
    db.prepare('UPDATE transactions SET linkedId = NULL WHERE linkedId = ?').run(id);

    // 3. Soft-delete avec horodatage Unix
    const now = Date.now();
    db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ?').run(now, id);
  });
}

export function restoreTransaction(
  db: DatabaseSync,
  id: string,
  fallbackData?: Partial<TransactionData>
): TransactionData {
  return withTransaction(db, () => {
    const existing = getTransactionById(db, id);
    if (!existing) {
      if (fallbackData && (fallbackData.id || fallbackData.amount !== undefined)) {
        return saveTransaction(db, { ...fallbackData, id, deleted_at: null });
      }
      throw new Error(`Transaction ${id} introuvable.`);
    }

    // 1. Restaurer la transaction en préservant rigoureusement son statut initial
    // Si fallbackData.status est fourni, le respecter prioritairement ; sinon conserver existing.status.
    const finalStatus = fallbackData?.status || existing.status;
    db.prepare('UPDATE transactions SET deleted_at = NULL, status = ? WHERE id = ?').run(finalStatus, id);
    const restoredTx = getTransactionById(db, id)!;

    // 2. Resynchroniser le capital du crédit si la mensualité était réglée
    if (restoredTx.type === 'loan_payment' && restoredTx.status === 'cleared') {
      syncLoanCapitalForTransaction(db, null, restoredTx);
    }

    // 3. Réactivation automatique du contrat récurrent et régénération STRICTEMENT sur les mois futurs (M+1 à M+12)
    // S'assurer que le mois courant/restauré M n'est JAMAIS écrasé ou altéré en 'planned'
    if (restoredTx.templateId) {
      db.prepare(`
        UPDATE recurrence_templates
        SET isActive = 1, endDate = NULL, disabledFromMonth = NULL, updatedAt = ?
        WHERE id = ?
      `).run(new Date().toISOString(), restoredTx.templateId);

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const restoredMonth = restoredTx.date ? restoredTx.date.slice(0, 7) : currentMonth;
      const nextMonth = shiftMonthKey(restoredMonth, 1);
      // Synchronisation exclusive des mois futurs (>= mois courant civil) : interdiction formelle de synchroniser dans le passé
      const startSyncMonth = nextMonth < currentMonth ? currentMonth : nextMonth;
      syncRollingHorizon(db, startSyncMonth, 0, 11);
    }

    return restoredTx;
  });
}

export function updateTransactionStatus(
  db: DatabaseSync,
  id: string,
  newStatus: 'planned' | 'pending' | 'cleared' | 'disabled'
): TransactionData {
  if (!['planned', 'pending', 'cleared', 'disabled'].includes(newStatus)) {
    throw new Error(`Statut invalide : ${newStatus}`);
  }

  return withTransaction(db, () => {
    const existing = getTransactionById(db, id);
    if (!existing) {
      throw new Error(`Transaction ${id} introuvable.`);
    }

    if (existing.status === newStatus) {
      return existing;
    }

    const newTx: TransactionData = { ...existing, status: newStatus };

    if (existing.type === 'loan_payment') {
      syncLoanCapitalForTransaction(db, existing, newTx);
    }

    const stmt = db.prepare('UPDATE transactions SET status = ?, amortizedCapital = ? WHERE id = ?');
    stmt.run(newStatus, newTx.amortizedCapital ?? null, id);

    return getTransactionById(db, id)!;
  });
}
