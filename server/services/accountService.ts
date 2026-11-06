import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export interface AccountData {
  id?: string;
  name: string;
  type: string;
  subType?: string;
  initialBalance: number;
  referenceDate: string;
  interestRate?: number;
  targetAmount?: number;
  isClosed?: boolean;
  closedDate?: string;
  closedBalance?: number;
}

export function getAllAccounts(db: DatabaseSync): AccountData[] {
  const stmt = db.prepare('SELECT * FROM accounts ORDER BY isClosed ASC, name ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    isClosed: Boolean(r.isClosed)
  }));
}

export function getAccountById(db: DatabaseSync, id: string): AccountData | null {
  const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    ...row,
    isClosed: Boolean(row.isClosed)
  };
}

export function saveAccount(db: DatabaseSync, data: AccountData): AccountData {
  const existing = data.id ? getAccountById(db, data.id) : null;

  const resolvedName = (data.name !== undefined ? data.name : (existing?.name || '')).trim();
  const resolvedType = data.type || existing?.type;
  const resolvedSubType = data.subType !== undefined ? data.subType : (existing?.subType || null);
  const resolvedRefDate = data.referenceDate || existing?.referenceDate;

  if (!resolvedName || resolvedName.length === 0) {
    throw new Error('Le nom du compte est obligatoire.');
  }
  if (!resolvedType || !['checking', 'savings', 'cash'].includes(resolvedType)) {
    throw new Error(`Type de compte invalide : ${resolvedType}`);
  }
  if (!resolvedRefDate || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedRefDate)) {
    throw new Error('La date de référence doit être au format YYYY-MM-DD.');
  }

  const id = data.id || crypto.randomUUID();
  const isClosed = data.isClosed !== undefined ? (data.isClosed ? 1 : 0) : (existing?.isClosed ? 1 : 0);
  const initialBalance = data.initialBalance !== undefined 
    ? (Number(data.initialBalance) || 0) 
    : (existing?.initialBalance ?? 0);

  const interestRate = data.interestRate !== undefined 
    ? (data.interestRate === null ? null : Number(data.interestRate))
    : (existing?.interestRate ?? null);

  const targetAmount = data.targetAmount !== undefined
    ? (data.targetAmount === null ? null : Number(data.targetAmount))
    : (existing?.targetAmount ?? null);

  const closedDate = data.closedDate !== undefined 
    ? data.closedDate 
    : (existing?.closedDate || null);

  const closedBalance = data.closedBalance !== undefined
    ? (data.closedBalance === null ? null : Number(data.closedBalance))
    : (existing?.closedBalance ?? null);

  const stmt = db.prepare(`
    INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate, interestRate, targetAmount, isClosed, closedDate, closedBalance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      subType = excluded.subType,
      initialBalance = excluded.initialBalance,
      referenceDate = excluded.referenceDate,
      interestRate = excluded.interestRate,
      targetAmount = excluded.targetAmount,
      isClosed = excluded.isClosed,
      closedDate = excluded.closedDate,
      closedBalance = excluded.closedBalance
  `);

  stmt.run(
    id,
    resolvedName,
    resolvedType,
    resolvedSubType || null,
    initialBalance,
    resolvedRefDate,
    interestRate !== null && !isNaN(interestRate) ? interestRate : null,
    targetAmount !== null && !isNaN(targetAmount) ? targetAmount : null,
    isClosed,
    closedDate || null,
    closedBalance !== null && !isNaN(closedBalance) ? closedBalance : null
  );

  return getAccountById(db, id)!;
}

export function deleteAccount(db: DatabaseSync, id: string): void {
  // Vérification de sécurité : vérifier si des transactions ou prêts utilisent ce compte
  const txCheck = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE accountId = ? OR destinationAccountId = ?');
  const txCount = (txCheck.get(id, id) as any).count;
  if (txCount > 0) {
    throw new Error('Impossible de supprimer ce compte : des opérations financières y sont associées.');
  }

  const loanCheck = db.prepare('SELECT COUNT(*) as count FROM loans WHERE accountId = ?');
  const loanCount = (loanCheck.get(id) as any).count;
  if (loanCount > 0) {
    throw new Error('Impossible de supprimer ce compte : un prêt en cours y est associé.');
  }

  const recurrenceCheck = db.prepare('SELECT COUNT(*) as count FROM recurrence_templates WHERE accountId = ? OR destinationAccountId = ?');
  const recurrenceCount = (recurrenceCheck.get(id, id) as any).count;
  if (recurrenceCount > 0) {
    throw new Error('Impossible de supprimer ce compte : un modèle d\'opération récurrente y est associé.');
  }

  const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
  stmt.run(id);
}
