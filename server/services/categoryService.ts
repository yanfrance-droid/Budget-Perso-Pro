import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export interface CategoryData {
  id?: string;
  name: string;
  type: string;
  color?: string;
  isArchived?: boolean;
}

export function getAllCategories(db: DatabaseSync): CategoryData[] {
  const stmt = db.prepare('SELECT * FROM categories ORDER BY isArchived ASC, name ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    isArchived: Boolean(r.isArchived)
  }));
}

export function getCategoryById(db: DatabaseSync, id: string): CategoryData | null {
  const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    ...row,
    isArchived: Boolean(row.isArchived)
  };
}

export function saveCategory(db: DatabaseSync, data: CategoryData): CategoryData {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Le nom de la catégorie est obligatoire.');
  }

  const id = data.id || crypto.randomUUID();
  const isArchived = data.isArchived ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO categories (id, name, type, color, isArchived)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      color = excluded.color,
      isArchived = excluded.isArchived
  `);

  stmt.run(
    id,
    data.name.trim(),
    data.type,
    data.color || null,
    isArchived
  );

  return getCategoryById(db, id)!;
}

export function deleteCategory(db: DatabaseSync, id: string): void {
  const txCheck = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE categoryId = ?');
  const txCount = (txCheck.get(id) as any).count;
  if (txCount > 0) {
    // Si des transactions l'utilisent, on archive au lieu de supprimer pour préserver l'historique
    const archiveStmt = db.prepare('UPDATE categories SET isArchived = 1 WHERE id = ?');
    archiveStmt.run(id);
    return;
  }

  const stmt = db.prepare('DELETE FROM categories WHERE id = ?');
  stmt.run(id);
}
