import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase, runMigrations } from './db.ts';

describe('Démarrage et Migration à chaud sur base existante v1.2.2 (server/db.ts)', () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) {
          fs.rmSync(f, { recursive: true, force: true });
        }
      } catch {}
    }
    tempFiles.length = 0;
  });

  it('initDatabase() démarre avec succès sur une base v1.2.2 existante sans planter sur idx_transactions_active', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-v122-startup-'));
    tempFiles.push(tempDir);
    const dbFilePath = path.join(tempDir, 'budget_v122_prod.db');

    // 1. Création préalable d'une base SQLite v1.2.2 (SANS deleted_at ni colonnes de récurrence)
    const rawDb = new DatabaseSync(dbFilePath);
    rawDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        initialBalance REAL NOT NULL DEFAULT 0,
        referenceDate TEXT NOT NULL,
        isClosed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      );
      -- Schéma v1.2.2 STRICT : PAS de colonne deleted_at
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        expectedDate TEXT,
        recurrenceDay INTEGER,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        accountId TEXT NOT NULL,
        destinationAccountId TEXT,
        categoryId TEXT,
        linkedId TEXT,
        label TEXT,
        notes TEXT,
        paymentMethod TEXT,
        checkNumber TEXT,
        amortizedCapital REAL,
        templateId TEXT,
        isCustomized INTEGER NOT NULL DEFAULT 0,
        isReconstituted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE loans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lender TEXT NOT NULL,
        initialAmount REAL NOT NULL,
        remainingCapital REAL NOT NULL,
        monthlyPayment REAL NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT,
        durationMonths INTEGER NOT NULL,
        accountId TEXT NOT NULL
      );
      -- Schéma v1.2.2 STRICT : PAS de colonnes commitment_end_date, price_after_promo, notice_period_days
      CREATE TABLE recurrence_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        recurrenceDay INTEGER NOT NULL,
        accountId TEXT NOT NULL,
        destinationAccountId TEXT,
        categoryId TEXT,
        startDate TEXT NOT NULL,
        endDate TEXT,
        isActive INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Insertion de données réelles existantes
      INSERT INTO accounts (id, name, type, initialBalance, referenceDate) 
      VALUES ('acc-legacy', 'Compte Courant Existant', 'checking', 1500, '2026-01-01');

      INSERT INTO transactions (id, date, type, amount, status, accountId, label)
      VALUES ('tx-legacy-prod-1', '2026-10-01', 'fixed_expense', 45, 'cleared', 'acc-legacy', 'Abonnement Téléphonique');
    `);
    rawDb.close();

    // 2. Appel de initDatabase() sur le fichier existant
    // Cette étape déclenche createSchema() puis runMigrations() puis seedDefaultAccount() puis runStartupMaintenance()
    // Elle DOIT réussir sans lever d'erreur 'no such column: deleted_at'
    let initializedDb: DatabaseSync | null = null;
    expect(() => {
      initializedDb = initDatabase(dbFilePath);
    }).not.toThrow();

    expect(initializedDb).not.toBeNull();

    try {
      // 3. Vérifications de schéma post-démarrage
      const txCols = initializedDb!.prepare("PRAGMA table_info(transactions)").all() as any[];
      expect(txCols.some(c => c.name === 'deleted_at')).toBe(true);
      expect(txCols.some(c => c.name === 'payerId')).toBe(true);

      const recCols = initializedDb!.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
      expect(recCols.some(c => c.name === 'commitment_end_date')).toBe(true);
      expect(recCols.some(c => c.name === 'price_after_promo')).toBe(true);
      expect(recCols.some(c => c.name === 'notice_period_days')).toBe(true);

      // 4. Vérification de la présence des index partiels et dynamiques
      const indexList = initializedDb!.prepare("PRAGMA index_list('transactions')").all() as any[];
      expect(indexList.some(i => i.name === 'idx_transactions_active')).toBe(true);
      expect(indexList.some(i => i.name === 'idx_transactions_deleted')).toBe(true);
      expect(indexList.some(i => i.name === 'idx_transactions_payer')).toBe(true);

      // 5. Intégrité des données existantes
      const existingTx = initializedDb!.prepare("SELECT * FROM transactions WHERE id = 'tx-legacy-prod-1'").get() as any;
      expect(existingTx).toBeDefined();
      expect(existingTx.amount).toBe(45);
      expect(existingTx.deleted_at).toBeNull();

      // 6. PRAGMA integrity_check
      const integrity = initializedDb!.prepare('PRAGMA integrity_check;').all() as any[];
      expect(integrity[0].integrity_check).toBe('ok');
    } finally {
      if (initializedDb) {
        try { (initializedDb as DatabaseSync).close(); } catch {}
      }
    }
  });

  it('createSchema() exécuté isolément sur une table v1.2.2 sans deleted_at ne lève aucune exception', () => {
    const rawDb = new DatabaseSync(':memory:');
    rawDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT, created_at TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, expires_at TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL DEFAULT 0, referenceDate TEXT, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        expectedDate TEXT,
        recurrenceDay INTEGER,
        accountId TEXT NOT NULL,
        destinationAccountId TEXT,
        linkedId TEXT,
        templateId TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount REAL NOT NULL
      );
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, endDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT, startDate TEXT, isActive INT DEFAULT 1);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    `);

    // S'assurer que les routines de migration et de schéma démarrent sans encombre
    expect(() => {
      runMigrations(rawDb);
    }).not.toThrow();

    const txCols = rawDb.prepare("PRAGMA table_info(transactions)").all() as any[];
    expect(txCols.some(c => c.name === 'deleted_at')).toBe(true);

    const indexList = rawDb.prepare("PRAGMA index_list('transactions')").all() as any[];
    expect(indexList.some(i => i.name === 'idx_transactions_active')).toBe(true);

    rawDb.close();
  });
});
