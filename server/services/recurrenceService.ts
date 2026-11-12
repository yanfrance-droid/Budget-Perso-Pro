import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { saveTransaction } from './transactionService.ts';
import { withTransaction } from './loanService.ts';

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
  commitment_end_date?: string | null;
  price_after_promo?: number | null;
  notice_period_days?: number | null;
  contract_end_date?: string | null;
}

export function getAllRecurrenceTemplates(db: DatabaseSync): RecurrenceTemplateData[] {
  const stmt = db.prepare('SELECT * FROM recurrence_templates ORDER BY isActive DESC, label ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    recurrenceDay: Number(r.recurrenceDay),
    isActive: Boolean(r.isActive),
    commitment_end_date: r.commitment_end_date || null,
    price_after_promo: r.price_after_promo !== null && r.price_after_promo !== undefined ? Number(r.price_after_promo) : null,
    notice_period_days: r.notice_period_days !== null && r.notice_period_days !== undefined ? Number(r.notice_period_days) : 30,
    contract_end_date: r.contract_end_date || null
  }));
}

/**
 * Détermine le montant effectif à appliquer pour une occurrence récurrente :
 * Si la date de l'échéance dépasse strictement commitment_end_date et qu'un tarif post-promo
 * valide (> 0) est configuré, bascule automatiquement vers price_after_promo.
 */
export function computeEffectiveRecurrenceAmount(
  t: { amount: number; commitment_end_date?: string | null; price_after_promo?: number | null },
  occurrenceDate: string,
  targetMonth?: string
): number {
  if (
    t.commitment_end_date &&
    t.price_after_promo !== undefined &&
    t.price_after_promo !== null &&
    Number(t.price_after_promo) > 0
  ) {
    const isPastCommitment = t.commitment_end_date.length === 7
      ? (targetMonth ? targetMonth > t.commitment_end_date : occurrenceDate.slice(0, 7) > t.commitment_end_date)
      : occurrenceDate > t.commitment_end_date;

    if (isPastCommitment) {
      return Number(t.price_after_promo);
    }
  }
  return Number(t.amount);
}

export function saveRecurrenceTemplate(db: DatabaseSync, data: Partial<RecurrenceTemplateData>): RecurrenceTemplateData {
  return withTransaction(db, () => {
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
    const commitment_end_date = data.commitment_end_date !== undefined ? (data.commitment_end_date || null) : (existing?.commitment_end_date ?? null);
    const price_after_promo = data.price_after_promo !== undefined
      ? (data.price_after_promo !== null && !isNaN(Number(data.price_after_promo)) ? Number(data.price_after_promo) : null)
      : (existing?.price_after_promo !== undefined && existing?.price_after_promo !== null ? Number(existing.price_after_promo) : null);
    const notice_period_days = data.notice_period_days !== undefined
      ? (data.notice_period_days !== null && !isNaN(Number(data.notice_period_days)) ? Number(data.notice_period_days) : 30)
      : (existing?.notice_period_days !== undefined && existing?.notice_period_days !== null ? Number(existing.notice_period_days) : 30);
    const contract_end_date = data.contract_end_date !== undefined ? (data.contract_end_date || null) : (existing?.contract_end_date ?? null);

    const stmt = db.prepare(`
      INSERT INTO recurrence_templates (
        id, type, amount, recurrenceDay, accountId, destinationAccountId,
        categoryId, label, notes, startDate, endDate, isActive,
        disabledFromMonth, createdAt, updatedAt, payerId,
        commitment_end_date, price_after_promo, notice_period_days,
        contract_end_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        payerId = excluded.payerId,
        commitment_end_date = excluded.commitment_end_date,
        price_after_promo = excluded.price_after_promo,
        notice_period_days = excluded.notice_period_days,
        contract_end_date = excluded.contract_end_date
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
      payerId,
      commitment_end_date,
      price_after_promo,
      notice_period_days,
      contract_end_date
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

    // Mise à jour automatique des occurrences non pointées et non personnalisées
    // pour garantir la cohérence du palier tarifaire actuel / post-promo
    const unpointedOccurrences = db.prepare(`
      SELECT id, date FROM transactions
      WHERE templateId = ? AND status != 'cleared' AND isCustomized = 0
    `).all(id) as { id: string; date: string }[];

    for (const occ of unpointedOccurrences) {
      const effectiveAmt = computeEffectiveRecurrenceAmount({
        amount,
        commitment_end_date,
        price_after_promo
      }, occ.date);
      db.prepare('UPDATE transactions SET amount = ? WHERE id = ?').run(effectiveAmt, occ.id);
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
        const effectiveAmt = computeEffectiveRecurrenceAmount({
          amount,
          commitment_end_date,
          price_after_promo
        }, newOccDate);

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
          effectiveAmt,
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
      isActive: Boolean(r.isActive),
      commitment_end_date: r.commitment_end_date || null,
      price_after_promo: r.price_after_promo !== null && r.price_after_promo !== undefined ? Number(r.price_after_promo) : null,
      notice_period_days: r.notice_period_days !== null && r.notice_period_days !== undefined ? Number(r.notice_period_days) : 30,
      contract_end_date: r.contract_end_date || null
    };
  });
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

export function shiftMonthKey(baseMonth: string, offset: number): string {
  const [yearStr, monthStr] = baseMonth.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Retourne le mois civil courant du système au format YYYY-MM.
 */
export function getSystemCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Synchronise et matérialise l'ensemble des occurrences contractuelles et récurrentes
 * sur un horizon temporel glissant de manière strictement idempotente.
 * RÈGLE D'OR : Le passé (< mois courant système) est strictement gelé et immuable.
 * Même si un mois passé est passé en paramètre, le point de départ est impérativement
 * ramené au minimum au mois courant système (minAllowedMonth).
 */
export function syncRollingHorizon(
  db: DatabaseSync,
  currentMonth: string,
  pastMonths = 0,
  futureMonths = 12,
  minAllowedMonth: string = getSystemCurrentMonth()
): { totalCreated: number; totalGenerated: number; monthsProcessed: string[]; monthsSynced: string[] } {
  if (!/^\d{4}-\d{2}$/.test(currentMonth)) {
    throw new Error('Le mois de référence doit être au format YYYY-MM.');
  }

  // Clamping absolu : l'horizon glissant ne peut jamais démarrer dans le passé (< minAllowedMonth)
  const safeBaseMonth = currentMonth < minAllowedMonth ? minAllowedMonth : currentMonth;

  const monthsSynced: string[] = [];
  let totalGenerated = 0;

  // Interdiction formelle de régénérer le passé : offset commence TOUJOURS à 0 (safeBaseMonth) jusqu'à futureMonths
  const startOffset = 0;

  for (let offset = startOffset; offset <= futureMonths; offset++) {
    const targetMonth = shiftMonthKey(safeBaseMonth, offset);
    monthsSynced.push(targetMonth);
    totalGenerated += generateMonthlyOccurrences(db, targetMonth, minAllowedMonth);
  }

  return {
    totalCreated: totalGenerated,
    totalGenerated,
    monthsProcessed: monthsSynced,
    monthsSynced
  };
}

export function generateMonthlyOccurrences(
  db: DatabaseSync,
  targetMonth: string,
  minAllowedMonth: string = getSystemCurrentMonth()
): number {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error('Le mois cible doit être au format YYYY-MM.');
  }

  // Verrou temporel absolu : le passé (< minAllowedMonth) est sanctuarisé en lecture seule
  if (targetMonth < minAllowedMonth) {
    return 0;
  }

  return withTransaction(db, () => {
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

      // Vérifier si une occurrence existe déjà pour ce template dans ce mois (qu'elle soit active ou soft-deleted)
      const existingStmt = db.prepare(`
        SELECT id, status, deleted_at, templateId FROM transactions
        WHERE (templateId = ? OR (accountId = ? AND recurrenceDay = ? AND label = ?))
          AND date LIKE ?
      `);
      const existing = existingStmt.get(t.id!, t.accountId, t.recurrenceDay, t.label, `${targetMonth}%`) as any;
      if (existing) {
        // Si elle n'avait pas encore son templateId rattaché, la rattacher
        if (!existing.templateId && !existing.deleted_at) {
          db.prepare('UPDATE transactions SET templateId = ? WHERE id = ?').run(t.id, existing.id);
        }
        // Anti-Zombie : Si l'occurrence existante a été supprimée par l'utilisateur (soft-deleted), NE PAS LA RECRÉER NI LA RESSUSCITER
        if (existing.deleted_at) {
          continue;
        }
        // Sanctuarisation : ne JAMAIS altérer le statut d'une transaction existante si elle est 'cleared', 'pending' ou personnalisée
        if (isExplicitlyDisabled && existing.status === 'planned') {
          const updateStmt = db.prepare('UPDATE transactions SET status = \'disabled\', isCustomized = 1 WHERE id = ?');
          updateStmt.run(existing.id);
        }
        continue;
      }

      // Construction de la date exacte
      const [year, month] = targetMonth.split('-').map(Number);
      const occurrenceDate = computeOccurrenceDate(year, month, t.recurrenceDay);
      const occurrenceAmount = computeEffectiveRecurrenceAmount(t, occurrenceDate, targetMonth);

      saveTransaction(db, {
        date: occurrenceDate,
        expectedDate: occurrenceDate,
        recurrenceDay: t.recurrenceDay,
        type: t.type,
        amount: occurrenceAmount,
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
  });
}

/**
 * Génère ou réactive l'occurrence d'un template spécifique pour un mois donné (YYYY-MM).
 * Si l'occurrence était supprimée (soft-deleted) et forceUnDelete est actif, elle est réactivée.
 */
export function generateSingleOccurrence(
  db: DatabaseSync,
  templateId: string,
  targetMonth: string,
  forceUnDelete = true
): { success: boolean; transaction: any } {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error('Le mois cible doit être au format YYYY-MM.');
  }

  return withTransaction(db, () => {
    const tmplStmt = db.prepare('SELECT * FROM recurrence_templates WHERE id = ?');
    const t = tmplStmt.get(templateId) as any;
    if (!t) {
      throw new Error(`Modèle de récurrence ${templateId} introuvable.`);
    }

    const existingStmt = db.prepare(`
      SELECT id, status, deleted_at, templateId FROM transactions
      WHERE (templateId = ? OR (accountId = ? AND recurrenceDay = ? AND label = ?))
        AND date LIKE ?
    `);
    const existing = existingStmt.get(templateId, t.accountId, Number(t.recurrenceDay), t.label, `${targetMonth}%`) as any;

    if (existing) {
      if (!existing.templateId && !existing.deleted_at) {
        db.prepare('UPDATE transactions SET templateId = ? WHERE id = ?').run(templateId, existing.id);
      }
      if (existing.deleted_at && forceUnDelete) {
        db.prepare('UPDATE transactions SET deleted_at = NULL, templateId = ? WHERE id = ?').run(templateId, existing.id);
        const restored = db.prepare('SELECT * FROM transactions WHERE id = ?').get(existing.id);
        return { success: true, transaction: restored };
      }
      return { success: true, transaction: existing };
    }

    // Construction de l'occurrence
    const [year, month] = targetMonth.split('-').map(Number);
    const occurrenceDate = computeOccurrenceDate(year, month, Number(t.recurrenceDay));
    const occurrenceAmount = computeEffectiveRecurrenceAmount({
      amount: Number(t.amount),
      commitment_end_date: t.commitment_end_date,
      price_after_promo: t.price_after_promo !== null ? Number(t.price_after_promo) : null
    }, occurrenceDate, targetMonth);

    const isExplicitlyDisabled = !t.isActive || Boolean(t.disabledFromMonth && targetMonth >= t.disabledFromMonth);
    const occurrenceStatus: 'planned' | 'disabled' = isExplicitlyDisabled ? 'disabled' : 'planned';

    const saved = saveTransaction(db, {
      date: occurrenceDate,
      expectedDate: occurrenceDate,
      recurrenceDay: Number(t.recurrenceDay),
      type: t.type,
      amount: occurrenceAmount,
      status: occurrenceStatus,
      isCustomized: isExplicitlyDisabled ? 1 : 0,
      accountId: t.accountId,
      destinationAccountId: t.destinationAccountId,
      categoryId: t.categoryId,
      label: t.label,
      notes: t.notes,
      templateId: t.id,
      payerId: t.payerId
    });

    return { success: true, transaction: saved };
  });
}

export function deleteRecurrenceTemplate(db: DatabaseSync, id: string, fromDate?: string): void {
  withTransaction(db, () => {
    const now = Date.now();

    if (fromDate) {
      // Normaliser la date charnière (si format YYYY-MM, étendre au 1er jour YYYY-MM-01)
      const effectiveFromDate = fromDate.length === 7 ? `${fromDate}-01` : fromDate;

      // 1. Sur le mois sélectionné et les mois futurs (date >= effectiveFromDate) :
      // - Si status = 'planned' : purge physique pure
      db.prepare(`
        DELETE FROM transactions
        WHERE templateId = ? AND date >= ? AND status = 'planned'
      `).run(id, effectiveFromDate);

      // - Si status != 'planned' (ex: cleared ou pending sur le mois sélectionné M) :
      //   SUPPRESSION ATOMIQUE EN 1 CLIC : soft-delete immédiat pour disparition instantanée de l'écran dès le 1er clic !
      db.prepare(`
        UPDATE transactions
        SET deleted_at = ?, templateId = NULL
        WHERE templateId = ? AND date >= ? AND deleted_at IS NULL
      `).run(now, id, effectiveFromDate);

      // 2. Sur les mois passés strictement antérieurs (date < effectiveFromDate) :
      // INTANGIBLES ET SANCTUARISÉS : deleted_at reste NULL, la transaction reste active et visible dans le passé.
      // On détache simplement le templateId pour préserver les contraintes relationnelles.
      db.prepare(`
        UPDATE transactions
        SET templateId = NULL
        WHERE templateId = ? AND date < ?
      `).run(id, effectiveFromDate);
    } else {
      // Suppression globale sans date de début :
      // Supprimer les projections prévisionnelles (planned)
      db.prepare(`
        DELETE FROM transactions
        WHERE templateId = ? AND status = 'planned'
      `).run(id);

      // Conserver les écritures réelles (cleared, pending) actives dans le Grand Livre (deleted_at reste NULL)
      db.prepare(`
        UPDATE transactions
        SET templateId = NULL
        WHERE templateId = ?
      `).run(id);
    }

    // 3. Supprime le modèle récurrent
    const stmt = db.prepare('DELETE FROM recurrence_templates WHERE id = ?');
    stmt.run(id);
  });
}
