import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ServerConfig {
  dbPath?: string;
}

export function initDatabase(dbPath = process.env.DB_PATH || './data/budget.db'): DatabaseSync {
  // Si ce n'est pas une base en mémoire, s'assurer que le répertoire existe
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Activation des contraintes et du mode WAL pour la concurrence multi-appareils
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  createSchema(db);
  runMigrations(db);
  seedDefaultAccount(db);
  return db;
}

function runMigrations(db: DatabaseSync) {
  try {
    const txCols = db.prepare("PRAGMA table_info(transactions)").all() as any[];
    if (!txCols.some(c => c.name === 'payerId')) {
      db.exec("ALTER TABLE transactions ADD COLUMN payerId TEXT;");
    }
  } catch (e) {
    console.error("Migration transactions payerId error:", e);
  }

  try {
    const recCols = db.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
    if (!recCols.some(c => c.name === 'payerId')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN payerId TEXT;");
    }
  } catch (e) {
    console.error("Migration recurrence_templates payerId error:", e);
  }

  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
    if (!userCols.some(c => c.name === 'recovery_key_hash')) {
      db.exec("ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;");
      db.exec("ALTER TABLE users ADD COLUMN recovery_key_salt TEXT;");
    }
  } catch (e) {
    console.error("Migration users recovery_key error:", e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS planned_expenses (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        estimatedAmount REAL NOT NULL,
        categoryId TEXT,
        urgency TEXT NOT NULL,
        targetDate TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL
      );
    `);
  } catch (e) {
    console.error("Migration planned_expenses error:", e);
  }
}

function seedDefaultAccount(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
  if (row.count === 0) {
    const id = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate, isClosed)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, 'Compte Courant', 'checking', 'checking', 0, today);
  }
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    -- 1. Table Utilisateurs (Authentification)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      recovery_key_hash TEXT,
      recovery_key_salt TEXT,
      created_at TEXT NOT NULL
    );

    -- 2. Table Sessions actives (Tokens d'accès)
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 3. Table Comptes
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      subType TEXT,
      initialBalance REAL NOT NULL DEFAULT 0,
      referenceDate TEXT NOT NULL,
      interestRate REAL,
      targetAmount REAL,
      isClosed INTEGER NOT NULL DEFAULT 0,
      closedDate TEXT,
      closedBalance REAL
    );

    -- 4. Table Catégories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0
    );

    -- 5. Table Organismes Verseurs (Tiers payeurs de revenus : employeur, CAF, etc.)
    CREATE TABLE IF NOT EXISTS income_payers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    -- 6. Table Transactions (Revenus, Dépenses fixes, Dépenses variables, Virements, Santé, Mensualités)
    CREATE TABLE IF NOT EXISTS transactions (
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
      isReconstituted INTEGER NOT NULL DEFAULT 0,
      payerId TEXT,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT
    );

    -- 7. Table Crédits et Prêts
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lender TEXT NOT NULL,
      initialAmount REAL NOT NULL,
      remainingCapital REAL NOT NULL,
      monthlyPayment REAL NOT NULL,
      interestRate REAL DEFAULT 0,
      insurancePart REAL DEFAULT 0,
      startDate TEXT NOT NULL,
      durationMonths INTEGER NOT NULL,
      endDate TEXT,
      debitDay INTEGER,
      prepaidInstallments INTEGER DEFAULT 0,
      monthsAdjustment INTEGER DEFAULT 0,
      accountId TEXT NOT NULL,
      notes TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      isPaused INTEGER NOT NULL DEFAULT 0,
      loanType TEXT DEFAULT 'consumer'
    );

    -- 8. Table Modèles de Récurrence
    CREATE TABLE IF NOT EXISTS recurrence_templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      recurrenceDay INTEGER NOT NULL,
      accountId TEXT NOT NULL,
      destinationAccountId TEXT,
      categoryId TEXT,
      label TEXT,
      notes TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      disabledFromMonth TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      payerId TEXT
    );

    -- 9. Table Clés de configuration et état Dashboard (manualBalance, card1, card2)
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 10. Table Dépenses prévisionnelles (pense-bête / wishlist isolé des transactions réelles)
    CREATE TABLE IF NOT EXISTS planned_expenses (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      estimatedAmount REAL NOT NULL,
      categoryId TEXT,
      urgency TEXT NOT NULL,
      targetDate TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    -- 11. Table Historique des capitaux de prêts (Prêt immobilier et Crédits consommation)
    CREATE TABLE IF NOT EXISTS loan_capital_history (
      month TEXT PRIMARY KEY,
      real_estate_capital REAL,
      real_estate_monthly_payment REAL,
      consumer_capital REAL,
      consumer_monthly_payment REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Index de performance pour les filtres par mois, type et compte
    CREATE INDEX IF NOT EXISTS idx_loan_capital_history_month ON loan_capital_history(month);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(accountId);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_template ON transactions(templateId);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}
