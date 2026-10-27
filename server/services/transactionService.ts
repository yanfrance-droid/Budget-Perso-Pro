import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

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
}

export function getTransactions(
  db: DatabaseSync,
  filters: { month?: string; accountId?: string; type?: string; status?: string } = {}
): TransactionData[] {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params: any[] = [];

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
    isReconstituted: Boolean(r.isReconstituted)
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
    isReconstituted: Boolean(row.isReconstituted)
  };
}

export function saveTransaction(db: DatabaseSync, data: Partial<TransactionData>): TransactionData {
  const id = data.id || crypto.randomUUID();

  // Si la transaction existe déjà, on fusionne les champs existants avec les modifications partielles
  let existing: any = null;
  if (data.id) {
    const checkStmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    existing = checkStmt.get(data.id);
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
  const amortizedCapital = data.amortizedCapital !== undefined ? (Number(data.amortizedCapital) || null) : (existing?.amortizedCapital ?? null);
  const templateId = data.templateId !== undefined ? (data.templateId || null) : (existing?.templateId ?? null);
  const isCustomized = (data.isCustomized !== undefined ? data.isCustomized : existing?.isCustomized) ? 1 : 0;
  const isReconstituted = (data.isReconstituted !== undefined ? data.isReconstituted : existing?.isReconstituted) ? 1 : 0;
  const payerId = data.payerId !== undefined ? (data.payerId || null) : (existing?.payerId ?? null);

  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, date, expectedDate, recurrenceDay, type, amount, status,
      accountId, destinationAccountId, categoryId, linkedId, label,
      notes, paymentMethod, checkNumber, amortizedCapital, templateId,
      isCustomized, isReconstituted, payerId
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      payerId = excluded.payerId
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
    payerId
  );

  return getTransactionById(db, id)!;
}

export function deleteTransaction(db: DatabaseSync, id: string): void {
  const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
  stmt.run(id);
}

export function updateTransactionStatus(
  db: DatabaseSync,
  id: string,
  newStatus: 'planned' | 'pending' | 'cleared' | 'disabled'
): TransactionData {
  if (!['planned', 'pending', 'cleared', 'disabled'].includes(newStatus)) {
    throw new Error(`Statut invalide : ${newStatus}`);
  }

  const existing = getTransactionById(db, id);
  if (!existing) {
    throw new Error(`Transaction ${id} introuvable.`);
  }

  const stmt = db.prepare('UPDATE transactions SET status = ? WHERE id = ?');
  stmt.run(newStatus, id);

  return getTransactionById(db, id)!;
}
