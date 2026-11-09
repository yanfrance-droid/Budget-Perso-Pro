import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, runMigrations } from './db.ts';
import {
  saveRecurrenceTemplate,
  getAllRecurrenceTemplates
} from './services/recurrenceService.ts';
import { saveAccount } from './services/accountService.ts';
import { exportBackupData, importBackupData } from './services/migrationService.ts';

describe('Suivi des Fins de Contrat (v1.3.9) - Backend SQLite & Intégration', () => {
  let db: DatabaseSync;
  let accountId: string;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const acc = saveAccount(db, {
      name: 'Compte Principal',
      type: 'checking',
      initialBalance: 1000,
      referenceDate: '2026-01-01'
    });
    accountId = acc.id!;
  });

  afterEach(() => {
    db.close();
  });

  it('persiste et restitue fidèlement contract_end_date sur recurrence_templates', () => {
    const created = saveRecurrenceTemplate(db, {
      type: 'fixed_expense',
      amount: 49.99,
      recurrenceDay: 12,
      accountId,
      label: 'Contrat Fibre Optique',
      startDate: '2026-01',
      isActive: true,
      contract_end_date: '2026-12-15'
    });

    expect(created.contract_end_date).toBe('2026-12-15');

    const all = getAllRecurrenceTemplates(db);
    const found = all.find(t => t.id === created.id);
    expect(found).toBeDefined();
    expect(found?.contract_end_date).toBe('2026-12-15');
  });

  it('permet la mise à jour de contract_end_date sur un modèle existant', () => {
    const created = saveRecurrenceTemplate(db, {
      type: 'fixed_expense',
      amount: 30,
      recurrenceDay: 5,
      accountId,
      label: 'Salle de sport',
      startDate: '2026-01',
      isActive: true,
      contract_end_date: '2026-10-31'
    });

    expect(created.contract_end_date).toBe('2026-10-31');

    const updated = saveRecurrenceTemplate(db, {
      id: created.id,
      contract_end_date: '2027-10-31'
    });

    expect(updated.contract_end_date).toBe('2027-10-31');

    const all = getAllRecurrenceTemplates(db);
    const found = all.find(t => t.id === created.id);
    expect(found?.contract_end_date).toBe('2027-10-31');
  });

  it('les migrations v1.3.9 ajoutent de manière idempotente la colonne contract_end_date sur une ancienne base', () => {
    const oldDb = new DatabaseSync(':memory:');
    oldDb.exec(`
      CREATE TABLE recurrence_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        recurrenceDay INTEGER NOT NULL,
        accountId TEXT NOT NULL,
        startDate TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1
      );
    `);

    runMigrations(oldDb);

    const cols = oldDb.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
    expect(cols.some(c => c.name === 'contract_end_date')).toBe(true);
    oldDb.close();
  });

  it('préserve fidèlement contract_end_date lors d\'un export JSON et de sa ré-importation (snapshot restore)', () => {
    saveRecurrenceTemplate(db, {
      type: 'fixed_expense',
      amount: 19.99,
      recurrenceDay: 1,
      accountId,
      label: 'Abonnement Cloud Pro',
      startDate: '2026-01',
      isActive: true,
      contract_end_date: '2027-04-30'
    });

    const backup = exportBackupData(db);
    expect(backup.tables.recurrenceTemplates).toBeDefined();
    const exportedTmpl = backup.tables.recurrenceTemplates?.find((t: any) => t.label === 'Abonnement Cloud Pro');
    expect(exportedTmpl).toBeDefined();
    expect(exportedTmpl.contract_end_date).toBe('2027-04-30');

    // Ré-importation sur une base neuve
    const targetDb = initDatabase(':memory:');
    const result = importBackupData(targetDb, backup, { skipSafetyBackup: true });
    expect(result.success).toBe(true);

    const reimported = getAllRecurrenceTemplates(targetDb).find(t => t.label === 'Abonnement Cloud Pro');
    expect(reimported).toBeDefined();
    expect(reimported?.contract_end_date).toBe('2027-04-30');
    targetDb.close();
  });
});
