import { DatabaseSync } from 'node:sqlite';

export interface LoanCapitalRecordData {
  month: string; // Format 'YYYY-MM'
  realEstateCapital: number | null;
  realEstateMonthlyPayment: number | null;
  consumerCapital: number | null;
  consumerMonthlyPayment: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoanCapitalHistoryExportPayload {
  format: 'PersonalBudgetPro_LoanCapitalHistory';
  version: 1;
  exportedAt: string;
  metadata: {
    totalRecords: number;
    startMonth: string | null;
    endMonth: string | null;
  };
  records: LoanCapitalRecordData[];
}

export interface LoanCapitalHistoryImportResult {
  importedCount: number;
  mode: 'replace' | 'merge';
  startMonth: string | null;
  endMonth: string | null;
}

const MONTH_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export function validateMonthFormat(month: string): void {
  if (!month || typeof month !== 'string' || !MONTH_REGEX.test(month)) {
    throw new Error(`Format de mois invalide : "${month}". Le format attendu est "YYYY-MM" (ex: "2024-05").`);
  }
}

export function validateRecordValues(record: Partial<LoanCapitalRecordData>): void {
  if (record.realEstateCapital !== undefined && record.realEstateCapital !== null) {
    if (typeof record.realEstateCapital !== 'number' || isNaN(record.realEstateCapital) || record.realEstateCapital < 0) {
      throw new Error('Le capital restant du prêt immobilier doit être un nombre positif ou nul.');
    }
  }
  if (record.realEstateMonthlyPayment !== undefined && record.realEstateMonthlyPayment !== null) {
    if (typeof record.realEstateMonthlyPayment !== 'number' || isNaN(record.realEstateMonthlyPayment) || record.realEstateMonthlyPayment < 0) {
      throw new Error('La mensualité du prêt immobilier doit être un nombre positif ou nul.');
    }
  }
  if (record.consumerCapital !== undefined && record.consumerCapital !== null) {
    if (typeof record.consumerCapital !== 'number' || isNaN(record.consumerCapital) || record.consumerCapital < 0) {
      throw new Error('Le capital restant des crédits consommation doit être un nombre positif ou nul.');
    }
  }
  if (record.consumerMonthlyPayment !== undefined && record.consumerMonthlyPayment !== null) {
    if (typeof record.consumerMonthlyPayment !== 'number' || isNaN(record.consumerMonthlyPayment) || record.consumerMonthlyPayment < 0) {
      throw new Error('La mensualité des crédits consommation doit être un nombre positif ou nul.');
    }
  }
}

export function getAllLoanCapitalHistory(db: DatabaseSync): LoanCapitalRecordData[] {
  const stmt = db.prepare('SELECT * FROM loan_capital_history ORDER BY month ASC');
  const rows = stmt.all() as any[];
  return rows.map(r => ({
    month: r.month,
    realEstateCapital: r.real_estate_capital !== null ? Number(r.real_estate_capital) : null,
    realEstateMonthlyPayment: r.real_estate_monthly_payment !== null ? Number(r.real_estate_monthly_payment) : null,
    consumerCapital: r.consumer_capital !== null ? Number(r.consumer_capital) : null,
    consumerMonthlyPayment: r.consumer_monthly_payment !== null ? Number(r.consumer_monthly_payment) : null,
    notes: r.notes || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export function getLoanCapitalRecordByMonth(db: DatabaseSync, month: string): LoanCapitalRecordData | null {
  validateMonthFormat(month);
  const stmt = db.prepare('SELECT * FROM loan_capital_history WHERE month = ?');
  const r = stmt.get(month) as any;
  if (!r) return null;
  return {
    month: r.month,
    realEstateCapital: r.real_estate_capital !== null ? Number(r.real_estate_capital) : null,
    realEstateMonthlyPayment: r.real_estate_monthly_payment !== null ? Number(r.real_estate_monthly_payment) : null,
    consumerCapital: r.consumer_capital !== null ? Number(r.consumer_capital) : null,
    consumerMonthlyPayment: r.consumer_monthly_payment !== null ? Number(r.consumer_monthly_payment) : null,
    notes: r.notes || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export function saveLoanCapitalRecord(db: DatabaseSync, data: LoanCapitalRecordData): LoanCapitalRecordData {
  validateMonthFormat(data.month);
  validateRecordValues(data);

  const realEstateCapital = data.realEstateCapital !== undefined && data.realEstateCapital !== null ? Number(data.realEstateCapital) : null;
  const realEstateMonthlyPayment = data.realEstateMonthlyPayment !== undefined && data.realEstateMonthlyPayment !== null ? Number(data.realEstateMonthlyPayment) : null;
  const consumerCapital = data.consumerCapital !== undefined && data.consumerCapital !== null ? Number(data.consumerCapital) : null;
  const consumerMonthlyPayment = data.consumerMonthlyPayment !== undefined && data.consumerMonthlyPayment !== null ? Number(data.consumerMonthlyPayment) : null;
  const notes = data.notes !== undefined && data.notes !== null ? String(data.notes).trim() : null;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO loan_capital_history (
      month,
      real_estate_capital,
      real_estate_monthly_payment,
      consumer_capital,
      consumer_monthly_payment,
      notes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(month) DO UPDATE SET
      real_estate_capital = excluded.real_estate_capital,
      real_estate_monthly_payment = excluded.real_estate_monthly_payment,
      consumer_capital = excluded.consumer_capital,
      consumer_monthly_payment = excluded.consumer_monthly_payment,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    data.month,
    realEstateCapital,
    realEstateMonthlyPayment,
    consumerCapital,
    consumerMonthlyPayment,
    notes,
    now,
    now
  );

  return getLoanCapitalRecordByMonth(db, data.month)!;
}

export function deleteLoanCapitalRecord(db: DatabaseSync, month: string): boolean {
  validateMonthFormat(month);
  const stmt = db.prepare('DELETE FROM loan_capital_history WHERE month = ?');
  const result = stmt.run(month);
  return Number(result.changes) > 0;
}

export function clearLoanCapitalHistory(db: DatabaseSync): number {
  const countBefore = (db.prepare('SELECT count(*) as count FROM loan_capital_history').get() as any).count;
  db.exec('DELETE FROM loan_capital_history');
  return Number(countBefore);
}

export function exportLoanCapitalHistory(db: DatabaseSync): LoanCapitalHistoryExportPayload {
  const records = getAllLoanCapitalHistory(db);
  const startMonth = records.length > 0 ? records[0].month : null;
  const endMonth = records.length > 0 ? records[records.length - 1].month : null;

  return {
    format: 'PersonalBudgetPro_LoanCapitalHistory',
    version: 1,
    exportedAt: new Date().toISOString(),
    metadata: {
      totalRecords: records.length,
      startMonth,
      endMonth
    },
    records
  };
}

export function importLoanCapitalHistory(
  db: DatabaseSync,
  payload: any,
  mode: 'replace' | 'merge' = 'replace'
): LoanCapitalHistoryImportResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Données d\'importation invalides : le contenu doit être un objet JSON.');
  }

  // Accepte soit le format dédié avec wrapper, soit directement une liste d'enregistrements
  let records: any[];
  if (Array.isArray(payload.records)) {
    if (payload.format && payload.format !== 'PersonalBudgetPro_LoanCapitalHistory') {
      throw new Error(`Format non reconnu : "${payload.format}". Le format attendu est "PersonalBudgetPro_LoanCapitalHistory".`);
    }
    records = payload.records;
  } else if (Array.isArray(payload)) {
    records = payload;
  } else {
    throw new Error('Format de fichier invalide : liste "records" introuvable dans le payload.');
  }

  // Validation préalable complète de tous les enregistrements avant d'écrire quoi que ce soit
  const validatedRecords: LoanCapitalRecordData[] = [];
  const seenMonths = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r || typeof r !== 'object') {
      throw new Error(`Enregistrement #${i + 1} invalide : objet attendu.`);
    }
    validateMonthFormat(r.month);
    if (seenMonths.has(r.month)) {
      throw new Error(`Doublon détecté pour le mois "${r.month}" dans le fichier d'importation.`);
    }
    seenMonths.add(r.month);

    validateRecordValues(r);

    validatedRecords.push({
      month: r.month,
      realEstateCapital: r.realEstateCapital !== undefined && r.realEstateCapital !== null ? Number(r.realEstateCapital) : null,
      realEstateMonthlyPayment: r.realEstateMonthlyPayment !== undefined && r.realEstateMonthlyPayment !== null ? Number(r.realEstateMonthlyPayment) : null,
      consumerCapital: r.consumerCapital !== undefined && r.consumerCapital !== null ? Number(r.consumerCapital) : null,
      consumerMonthlyPayment: r.consumerMonthlyPayment !== undefined && r.consumerMonthlyPayment !== null ? Number(r.consumerMonthlyPayment) : null,
      notes: r.notes !== undefined && r.notes !== null ? String(r.notes).trim() : null
    });
  }

  // Tri chronologique des enregistrements
  validatedRecords.sort((a, b) => a.month.localeCompare(b.month));

  // Exécution transactionnelle stricte avec Rollback automatique en cas d'erreur
  db.exec('BEGIN IMMEDIATE;');
  try {
    if (mode === 'replace') {
      db.exec('DELETE FROM loan_capital_history;');
    }

    const stmt = db.prepare(`
      INSERT INTO loan_capital_history (
        month,
        real_estate_capital,
        real_estate_monthly_payment,
        consumer_capital,
        consumer_monthly_payment,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(month) DO UPDATE SET
        real_estate_capital = excluded.real_estate_capital,
        real_estate_monthly_payment = excluded.real_estate_monthly_payment,
        consumer_capital = excluded.consumer_capital,
        consumer_monthly_payment = excluded.consumer_monthly_payment,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `);

    const now = new Date().toISOString();
    for (const rec of validatedRecords) {
      stmt.run(
        rec.month,
        rec.realEstateCapital,
        rec.realEstateMonthlyPayment,
        rec.consumerCapital,
        rec.consumerMonthlyPayment,
        rec.notes,
        now,
        now
      );
    }

    db.exec('COMMIT;');

    const startMonth = validatedRecords.length > 0 ? validatedRecords[0].month : null;
    const endMonth = validatedRecords.length > 0 ? validatedRecords[validatedRecords.length - 1].month : null;

    return {
      importedCount: validatedRecords.length,
      mode,
      startMonth,
      endMonth
    };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
