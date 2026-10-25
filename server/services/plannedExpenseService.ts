import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export type PlannedUrgency = 'urgent' | 'medium' | 'low';

export interface PlannedExpenseData {
  id?: string;
  label: string;
  estimatedAmount: number;
  categoryId?: string | null;
  urgency: PlannedUrgency;
  targetDate?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export function getAllPlannedExpenses(db: DatabaseSync): PlannedExpenseData[] {
  const stmt = db.prepare('SELECT * FROM planned_expenses ORDER BY createdAt DESC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    id: r.id,
    label: r.label,
    estimatedAmount: Number(r.estimatedAmount),
    categoryId: r.categoryId || null,
    urgency: r.urgency as PlannedUrgency,
    targetDate: r.targetDate || null,
    notes: r.notes || null,
    createdAt: r.createdAt
  }));
}

export function getPlannedExpenseById(db: DatabaseSync, id: string): PlannedExpenseData | null {
  const stmt = db.prepare('SELECT * FROM planned_expenses WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    estimatedAmount: Number(row.estimatedAmount),
    categoryId: row.categoryId || null,
    urgency: row.urgency as PlannedUrgency,
    targetDate: row.targetDate || null,
    notes: row.notes || null,
    createdAt: row.createdAt
  };
}

export function savePlannedExpense(db: DatabaseSync, data: PlannedExpenseData): PlannedExpenseData {
  if (!data.label || typeof data.label !== 'string' || data.label.trim().length === 0) {
    throw new Error('L\'intitulé de la dépense prévisionnelle est obligatoire.');
  }

  const amount = Number(data.estimatedAmount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Le montant estimé doit être un nombre strictement positif.');
  }

  const validUrgencies: PlannedUrgency[] = ['urgent', 'medium', 'low'];
  if (!data.urgency || !validUrgencies.includes(data.urgency)) {
    throw new Error('Le degré d\'urgence est obligatoire et doit valoir urgent, medium ou low.');
  }

  const id = data.id || crypto.randomUUID();
  const createdAt = data.createdAt || new Date().toISOString();
  const categoryId = data.categoryId ? String(data.categoryId) : null;
  const targetDate = data.targetDate ? String(data.targetDate) : null;
  const notes = data.notes ? String(data.notes) : null;

  const stmt = db.prepare(`
    INSERT INTO planned_expenses (id, label, estimatedAmount, categoryId, urgency, targetDate, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      estimatedAmount = excluded.estimatedAmount,
      categoryId = excluded.categoryId,
      urgency = excluded.urgency,
      targetDate = excluded.targetDate,
      notes = excluded.notes
  `);

  stmt.run(
    id,
    data.label.trim(),
    amount,
    categoryId,
    data.urgency,
    targetDate,
    notes,
    createdAt
  );

  return getPlannedExpenseById(db, id)!;
}

export function deletePlannedExpense(db: DatabaseSync, id: string): boolean {
  const stmt = db.prepare('DELETE FROM planned_expenses WHERE id = ?');
  stmt.run(id);
  return true;
}
