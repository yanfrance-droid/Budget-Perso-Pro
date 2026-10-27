import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export interface IncomePayerData {
  id?: string;
  name: string;
  isArchived?: boolean;
  createdAt?: string;
}

export function getAllIncomePayers(db: DatabaseSync): IncomePayerData[] {
  const stmt = db.prepare('SELECT * FROM income_payers ORDER BY isArchived ASC, name ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    isArchived: Boolean(r.isArchived)
  }));
}

export function getIncomePayerById(db: DatabaseSync, id: string): IncomePayerData | null {
  const stmt = db.prepare('SELECT * FROM income_payers WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    ...row,
    isArchived: Boolean(row.isArchived)
  };
}

export function saveIncomePayer(db: DatabaseSync, data: IncomePayerData): IncomePayerData {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Le nom de l\'organisme verseur est obligatoire.');
  }

  const id = data.id || crypto.randomUUID();
  const isArchived = data.isArchived ? 1 : 0;
  const createdAt = data.createdAt || new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO income_payers (id, name, isArchived, createdAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      isArchived = excluded.isArchived
  `);

  stmt.run(id, data.name.trim(), isArchived, createdAt);
  return getIncomePayerById(db, id)!;
}

export function deleteIncomePayer(db: DatabaseSync, id: string): void {
  // Vérifier si des transactions ou modèles utilisent cet organisme
  const txCheck = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE payerId = ?');
  const txCount = (txCheck.get(id) as any).count;
  if (txCount > 0) {
    throw new Error('Impossible de supprimer cet organisme verseur : des revenus y sont associés. Vous pouvez le désactiver à la place.');
  }

  const recCheck = db.prepare('SELECT COUNT(*) as count FROM recurrence_templates WHERE payerId = ?');
  const recCount = (recCheck.get(id) as any).count;
  if (recCount > 0) {
    throw new Error('Impossible de supprimer cet organisme verseur : des revenus récurrents y sont associés. Vous pouvez le désactiver à la place.');
  }

  const stmt = db.prepare('DELETE FROM income_payers WHERE id = ?');
  stmt.run(id);
}
