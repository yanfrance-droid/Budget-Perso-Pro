import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { saveTransaction } from './transactionService.ts';

export interface RecurrenceTemplateData {
  id?: string;
  type: string;
  amount: number;
  recurrenceDay: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  label?: string;
  notes?: string;
  startDate: string; // YYYY-MM
  endDate?: string;   // YYYY-MM
  isActive?: boolean;
  disabledFromMonth?: string;
  createdAt?: string;
  updatedAt?: string;
  payerId?: string;
  updateFutureOccurrencesFromDate?: string;
}

export function getAllRecurrenceTemplates(db: DatabaseSync): RecurrenceTemplateData[] {
  const stmt = db.prepare('SELECT * FROM recurrence_templates ORDER BY isActive DESC, label ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    recurrenceDay: Number(r.recurrenceDay),
    isActive: Boolean(r.isActive)
  }));
}

export function saveRecurrenceTemplate(db: DatabaseSync, data: Partial<RecurrenceTemplateData>): RecurrenceTemplateData {
  const id = data.id || crypto.randomUUID();
  const now = new Date().toISOString();

  // Si le modèle existe déjà, on fusionne les champs existants avec les modifications partielles
  let existing: any = null;
  if (data.id) {
    const checkStmt = db.prepare('SELECT * FROM recurrence_templates WHERE id = ?');
    existing = checkStmt.get(data.id);
  }

  const type = data.type ?? existing?.type ?? 'fixed_expense';
  const amount = data.amount !== undefined ? Number(data.amount) : (existing ? Number(existing.amount) : 0);
  const recurrenceDay = data.recurrenceDay !== undefined ? Number(data.recurrenceDay) : (existing ? Number(existing.recurrenceDay) : 1);
  const accountId = data.accountId ?? existing?.accountId ?? '';
  const destinationAccountId = data.destinationAccountId !== undefined ? (data.destinationAccountId || null) : (existing?.destinationAccountId ?? null);
  const categoryId = data.categoryId !== undefined ? (data.categoryId || null) : (existing?.categoryId ?? null);
  const label = data.label !== undefined ? (data.label || null) : (existing?.label ?? null);
  const notes = data.notes !== undefined ? (data.notes || null) : (existing?.notes ?? null);
  const startDate = data.startDate ?? existing?.startDate ?? now.slice(0, 7);
  const endDate = data.endDate !== undefined ? (data.endDate || null) : (existing?.endDate ?? null);
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing ? existing.isActive : 1);
  const disabledFromMonth = data.disabledFromMonth !== undefined ? (data.disabledFromMonth || null) : (existing?.disabledFromMonth ?? null);
  const createdAt = existing?.createdAt || data.createdAt || now;
  const payerId = data.payerId !== undefined ? (data.payerId || null) : (existing?.payerId ?? null);

  const stmt = db.prepare(`
    INSERT INTO recurrence_templates (
      id, type, amount, recurrenceDay, accountId, destinationAccountId,
      categoryId, label, notes, startDate, endDate, isActive,
      disabledFromMonth, createdAt, updatedAt, payerId
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      amount = excluded.amount,
      recurrenceDay = excluded.recurrenceDay,
      accountId = excluded.accountId,
      destinationAccountId = excluded.destinationAccountId,
      categoryId = excluded.categoryId,
      label = excluded.label,
      notes = excluded.notes,
      startDate = excluded.startDate,
      endDate = excluded.endDate,
      isActive = excluded.isActive,
      disabledFromMonth = excluded.disabledFromMonth,
      updatedAt = excluded.updatedAt,
      payerId = excluded.payerId
  `);

  stmt.run(
    id,
    type,
    amount,
    recurrenceDay,
    accountId,
    destinationAccountId,
    categoryId,
    label,
    notes,
    startDate,
    endDate,
    isActive,
    disabledFromMonth,
    createdAt,
    now,
    payerId
  );

  // Si le modèle a été désactivé durablement à partir d'un mois précis (disabledFromMonth) :
  // Désactiver immédiatement toutes les occurrences futures associées (>= disabledFromMonth) qui ne sont pas déjà débitées ('cleared')
  if (data.disabledFromMonth) {
    const fromDate = `${data.disabledFromMonth}-01`;
    const disableStmt = db.prepare(`
      UPDATE transactions
      SET status = 'disabled', isCustomized = 1
      WHERE templateId = ? AND date >= ? AND status != 'cleared'
    `);
    disableStmt.run(id, fromDate);
  }

  // Si demandé (application aux mois futurs), mettre à jour toutes les occurrences futures déjà générées
  // qui ne sont pas déjà débitées ('cleared') et n'ont pas fait l'objet d'une personnalisation ponctuelle (isCustomized = 0)
  if (data.updateFutureOccurrencesFromDate) {
    const fromDate = data.updateFutureOccurrencesFromDate;
    const futureOccurrences = db.prepare(`
      SELECT id, date FROM transactions
      WHERE templateId = ? AND date > ? AND status != 'cleared' AND isCustomized = 0
    `).all(id, fromDate) as { id: string; date: string }[];

    for (const occ of futureOccurrences) {
      const [y, m] = occ.date.split('-').map(Number);
      const newOccDate = computeOccurrenceDate(y, m, recurrenceDay);
      db.prepare(`
        UPDATE transactions
        SET amount = ?,
            label = ?,
            accountId = ?,
            destinationAccountId = ?,
            categoryId = ?,
            notes = ?,
            recurrenceDay = ?,
            date = ?,
            expectedDate = ?,
            payerId = ?
        WHERE id = ?
      `).run(
        amount,
        label,
        accountId,
        destinationAccountId,
        categoryId,
        notes,
        recurrenceDay,
        newOccDate,
        newOccDate,
        payerId,
        occ.id
      );
    }
  }

  const getStmt = db.prepare('SELECT * FROM recurrence_templates WHERE id = ?');
  const r = getStmt.get(id) as any;
  return {
    ...r,
    amount: Number(r.amount),
    recurrenceDay: Number(r.recurrenceDay),
    isActive: Boolean(r.isActive)
  };
}

/**
 * Calcule de manière déterministe et sécurisée la date d'une occurrence.
 * Gère le repli de fin de mois (ex: 31 février -> 28/29 février, 31 avril -> 30 avril).
 */
export function computeOccurrenceDate(year: number, month: number, recurrenceDay: number): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(1, recurrenceDay), daysInMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function generateMonthlyOccurrences(db: DatabaseSync, targetMonth: string): number {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error('Le mois cible doit être au format YYYY-MM.');
  }

  const templates = getAllRecurrenceTemplates(db);
  let generatedCount = 0;

  for (const t of templates) {
    if (t.startDate > targetMonth) continue;
    if (t.endDate && t.endDate < targetMonth) continue;

    // Détermination du statut de l'occurrence pour ce mois :
    // Si le modèle est actif et non désactivé pour ce mois -> 'planned'
    // Si le modèle est inactif ou désactivé à partir d'un mois antérieur ou égal -> 'disabled'
    const isExplicitlyDisabled = !t.isActive || Boolean(t.disabledFromMonth && targetMonth >= t.disabledFromMonth);
    const occurrenceStatus: 'planned' | 'disabled' = isExplicitlyDisabled ? 'disabled' : 'planned';

    // Vérifier si une occurrence existe déjà pour ce template dans ce mois
    const existingStmt = db.prepare(`
      SELECT id, status FROM transactions
      WHERE templateId = ? AND date LIKE ?
    `);
    const existing = existingStmt.get(t.id!, `${targetMonth}%`) as any;
    if (existing) {
      // Si l'occurrence existante est au statut planned alors que le modèle est désormais désactivé durablement, on la synchronise
      if (isExplicitlyDisabled && existing.status === 'planned') {
        const updateStmt = db.prepare('UPDATE transactions SET status = \'disabled\', isCustomized = 1 WHERE id = ?');
        updateStmt.run(existing.id);
      }
      continue;
    }

    // Construction de la date exacte
    const [year, month] = targetMonth.split('-').map(Number);
    const occurrenceDate = computeOccurrenceDate(year, month, t.recurrenceDay);

    saveTransaction(db, {
      date: occurrenceDate,
      expectedDate: occurrenceDate,
      recurrenceDay: t.recurrenceDay,
      type: t.type,
      amount: t.amount,
      status: occurrenceStatus,
      isCustomized: isExplicitlyDisabled,
      accountId: t.accountId,
      destinationAccountId: t.destinationAccountId,
      categoryId: t.categoryId,
      label: t.label,
      notes: t.notes,
      templateId: t.id,
      payerId: t.payerId
    });

    generatedCount++;
  }

  return generatedCount;
}

export function deleteRecurrenceTemplate(db: DatabaseSync, id: string, fromDate?: string): void {
  // Supprime le modèle récurrent
  const stmt = db.prepare('DELETE FROM recurrence_templates WHERE id = ?');
  stmt.run(id);

  // Détermination de la date pivot (début du mois en cours par défaut)
  const thresholdDate = fromDate || (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  })();

  // Supprime UNIQUEMENT les occurrences futures associées qui n'ont jamais été débitées en banque (statut != 'cleared' et date >= thresholdDate)
  // pour que la récurrence disparaisse définitivement de la vue sur tous les mois futurs,
  // tout en préservant scrupuleusement l'historique financier et les impayés des mois passés (statut planned ou pending antérieurs).
  const cleanStmt = db.prepare(`
    DELETE FROM transactions
    WHERE templateId = ? AND status != 'cleared' AND date >= ?
  `);
  cleanStmt.run(id, thresholdDate);

  // Détacher les éventuelles transactions passées restantes pour éviter un lien orphelin vers un template supprimé
  const detachStmt = db.prepare(`
    UPDATE transactions
    SET templateId = NULL
    WHERE templateId = ?
  `);
  detachStmt.run(id);
}
