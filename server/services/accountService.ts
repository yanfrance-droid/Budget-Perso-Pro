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
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Le nom du compte est obligatoire.');
  }
  if (!['checking', 'savings', 'cash'].includes(data.type)) {
    throw new Error(`Type de compte invalide : ${data.type}`);
  }
  if (!data.referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.referenceDate)) {
    throw new Error('La date de référence doit être au format YYYY-MM-DD.');
  }

  const id = data.id || crypto.randomUUID();
  const isClosed = data.isClosed ? 1 : 0;
  const initialBalance = Number(data.initialBalance) || 0;

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
    data.name.trim(),
    data.type,
    data.subType || null,
    initialBalance,
    data.referenceDate,
    data.interestRate !== undefined ? Number(data.interestRate) : null,
    data.targetAmount !== undefined ? Number(data.targetAmount) : null,
    isClosed,
    data.closedDate || null,
    data.closedBalance !== undefined ? Number(data.closedBalance) : null
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

  const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
  stmt.run(id);
}
