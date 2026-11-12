import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { repairOrphans, purgeExpiredDeletedTransactions } from './services/maintenanceService.ts';
import { syncRollingHorizon } from './services/recurrenceService.ts';
import { writeTechnicalLog } from './services/loggerService.ts';

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
  db.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
  }
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA cache_size = -16000;');

  createSchema(db);
  runMigrations(db);
  seedDefaultAccount(db);
  runStartupMaintenance(db);
  return db;
}

/**
 * Routine d'auto-maintenance silencieuse et idempotente exécutée à chaque démarrage du serveur :
 * Purge des sessions expirées, correction des liaisons orphelines et intégrité relationnelle.
 */
export function runStartupMaintenance(db: DatabaseSync): { repaired: number; purged: number } {
  try {
    const purged = purgeExpiredDeletedTransactions(db, 30);
    if (purged > 0) {
      writeTechnicalLog(
        'INFO',
        `Maintenance au démarrage : ${purged} transaction(s) supprimée(s) définitivement (> 30 jours).`
      );
    }
    const repairResult = repairOrphans(db);
    if (repairResult.repaired > 0) {
      writeTechnicalLog(
        'INFO',
        `Maintenance au démarrage : ${repairResult.repaired} anomalie(s) d'intégrité réparée(s).`
      );
    } else {
      writeTechnicalLog('INFO', 'Maintenance au démarrage : base de données vérifiée et intègre.');
    }

    // Synchronisation automatique de l'horizon glissant des récurrences (M-1 à M+12)
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      // Synchronisation automatique de l'horizon glissant des récurrences (M à M+12, passé strictement gelé)
      const horizonResult = syncRollingHorizon(db, currentMonth, 0, 12);
      if (horizonResult.totalCreated > 0) {
        writeTechnicalLog(
          'INFO',
          `Horizon glissant : ${horizonResult.totalCreated} occurrence(s) de récurrence générée(s) sur ${horizonResult.monthsProcessed.length} mois.`
        );
      }
    } catch (horizonErr: any) {
      writeTechnicalLog('WARN', `Avertissement horizon glissant au démarrage : ${horizonErr.message}`);
    }

    return { repaired: repairResult.repaired, purged };
  } catch (err: any) {
    writeTechnicalLog('WARN', `Avertissement maintenance au démarrage : ${err.message}`);
    return { repaired: 0, purged: 0 };
  }
}

export function runMigrations(db: DatabaseSync) {
  try {
    const txCols = db.prepare("PRAGMA table_info(transactions)").all() as any[];
    if (!txCols.some(c => c.name === 'payerId')) {
      db.exec("ALTER TABLE transactions ADD COLUMN payerId TEXT;");
    }
    if (!txCols.some(c => c.name === 'deleted_at')) {
      db.exec("ALTER TABLE transactions ADD COLUMN deleted_at INTEGER DEFAULT NULL;");
    }
    // Création immédiate et sécurisée des index dépendant des colonnes dynamiques
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions(payerId);
      CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions(accountId, date) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(deleted_at);
    `);
  } catch (e) {
    console.error("Migration transactions payerId/deleted_at error:", e);
  }

  try {
    const recCols = db.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
    if (!recCols.some(c => c.name === 'payerId')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN payerId TEXT;");
    }
    if (!recCols.some(c => c.name === 'commitment_end_date')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN commitment_end_date TEXT DEFAULT NULL;");
    }
    if (!recCols.some(c => c.name === 'price_after_promo')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN price_after_promo REAL DEFAULT NULL;");
    }
    if (!recCols.some(c => c.name === 'notice_period_days')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN notice_period_days INTEGER DEFAULT 30;");
    }
    if (!recCols.some(c => c.name === 'contract_end_date')) {
      db.exec("ALTER TABLE recurrence_templates ADD COLUMN contract_end_date TEXT DEFAULT NULL;");
    }
  } catch (e) {
    console.error("Migration recurrence_templates commitment error:", e);
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

  try {
    const loanCols = db.prepare("PRAGMA table_info(loans)").all() as any[];
    if (!loanCols.some(c => c.name === 'isArchived')) {
      db.exec("ALTER TABLE loans ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0;");
    }
  } catch (e) {
    console.error("Migration loans isArchived error:", e);
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS loan_payment_history (
        id TEXT PRIMARY KEY,
        loanId TEXT NOT NULL,
        effectiveMonth TEXT NOT NULL,
        monthlyPayment REAL NOT NULL,
        previousPayment REAL,
        notes TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (loanId) REFERENCES loans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_loan_payment_history_loan_month ON loan_payment_history(loanId, effectiveMonth);
    `);
  } catch (e) {
    console.error("Migration loan_payment_history error:", e);
  }

  try {
    const loansWithoutHistory = db.prepare(`
      SELECT l.id, l.monthlyPayment, l.startDate
      FROM loans l
      WHERE NOT EXISTS (
        SELECT 1 FROM loan_payment_history h WHERE h.loanId = l.id
      )
    `).all() as any[];

    for (const l of loansWithoutHistory) {
      // Recherche de la première transaction enregistrée pour ce crédit en base
      const earliestTx = db.prepare(`
        SELECT MIN(date) as minDate FROM transactions WHERE linkedId = ? AND type = 'loan_payment'
      `).get(l.id) as { minDate?: string };

      let baselineMonth: string;
      let note = 'Mensualité contractuelle de référence';

      if (earliestTx?.minDate && /^\d{4}-\d{2}/.test(earliestTx.minDate)) {
        const txMonth = earliestTx.minDate.slice(0, 7);
        if (l.startDate && /^\d{4}-\d{2}/.test(l.startDate) && l.startDate.slice(0, 7) < txMonth) {
          baselineMonth = l.startDate.slice(0, 7);
          note = `Mensualité contractuelle initiale (début du contrat : ${baselineMonth})`;
        } else {
          baselineMonth = txMonth;
          note = `Mensualité contractuelle initiale (première échéance enregistrée : ${baselineMonth})`;
        }
      } else if (l.startDate && /^\d{4}-\d{2}/.test(l.startDate)) {
        baselineMonth = l.startDate.slice(0, 7);
        note = `Mensualité contractuelle initiale (début du contrat : ${baselineMonth})`;
      } else {
        baselineMonth = '1970-01';
        note = 'Mensualité contractuelle initiale (date d’origine contractuelle non spécifiée)';
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, previousPayment, notes, createdAt)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(crypto.randomUUID(), l.id, baselineMonth, Number(l.monthlyPayment) || 0, note, now);
    }
  } catch (e) {
    console.error("Migration seed loan_payment_history error:", e);
  }

  try {
    initPreExistingFutureExpenses(db);
  } catch (e) {
    console.error("Migration initPreExistingFutureExpenses error:", e);
  }

  // Auto-réhabilitation idempotente des charges récurrentes orphelines (recurrenceDay sans templateId)
  try {
    rehabilitateOrphanRecurrentTransactions(db);
  } catch (e) {
    console.error("Migration rehabilitateOrphanRecurrentTransactions error:", e);
  }

  // Migration des index de performance pour filtres fréquents et intégrité
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linkedId);
      CREATE INDEX IF NOT EXISTS idx_transactions_dest_account ON transactions(destinationAccountId);
      CREATE INDEX IF NOT EXISTS idx_transactions_payer ON transactions(payerId);
      CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(accountId, date);
      CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions(accountId, date) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_loans_account ON loans(accountId);
      CREATE INDEX IF NOT EXISTS idx_recurrence_account ON recurrence_templates(accountId);
      CREATE INDEX IF NOT EXISTS idx_planned_expenses_category ON planned_expenses(categoryId);
      DROP INDEX IF EXISTS idx_loan_capital_history_month;
    `);
  } catch (e) {
    console.error("Migration indexes error:", e);
  }
}

/**
 * Migration unique & idempotente :
 * Initialise le champ expectedDate pour les dépenses journalières ponctuelles futures
 * préexistantes dans la base SQLite avant l'implémentation de la rubrique « Dépenses futures ».
 *
 * Règles strictes :
 * - type = 'daily'
 * - templateId IS NULL ou vide
 * - recurrenceDay IS NULL ou 0
 * - status IN ('planned', 'pending')
 * - expectedDate IS NULL ou vide
 * - date >= date du jour locale (ex: '2026-10-31')
 *
 * Les dépenses passées (date < todayStr) sont formellement exclues.
 * L'exécution est tracée de manière persistante dans la table app_settings.
 */
export function initPreExistingFutureExpenses(
  db: DatabaseSync, 
  referenceDate?: string
): { updatedCount: number; executed: boolean } {
  const MIGRATION_KEY = 'migration_init_future_expenses_expected_date';

  // 1. Vérification de l'indicateur persistant dans app_settings
  try {
    const alreadyRun = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(MIGRATION_KEY) as { value: string } | undefined;
    if (alreadyRun) {
      return { updatedCount: 0, executed: false };
    }
  } catch {
    return { updatedCount: 0, executed: false };
  }

  // 2. Détermination de la date de référence en temps local (évite tout décalage UTC)
  const todayStr = referenceDate || (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  // 3. Exécution transactionnelle
  const spName = `sp_migrate_future_${crypto.randomUUID().replace(/-/g, '_')}`;
  db.exec(`SAVEPOINT ${spName};`);
  try {
    const stmt = db.prepare(`
      UPDATE transactions
      SET expectedDate = date
      WHERE type = 'daily'
        AND (templateId IS NULL OR templateId = '')
        AND (recurrenceDay IS NULL OR recurrenceDay = 0)
        AND status IN ('planned', 'pending')
        AND (expectedDate IS NULL OR expectedDate = '')
        AND date >= ?
    `);
    const result = stmt.run(todayStr) as { changes?: number };
    const updatedCount = Number(result?.changes || 0);

    // 4. Enregistrement persistant de la migration
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(MIGRATION_KEY, JSON.stringify({
      executedAt: nowIso,
      referenceDate: todayStr,
      updatedCount
    }));

    db.exec(`RELEASE ${spName};`);
    return { updatedCount, executed: true };
  } catch (err) {
    db.exec(`ROLLBACK TO ${spName}; RELEASE ${spName};`);
    throw err;
  }
}

/**
 * Migration & auto-réparation idempotente des charges récurrentes orphelines :
 * Détecte les transactions distinctes possédant recurrenceDay IS NOT NULL mais sans templateId valide.
 * Insère automatiquement ces modèles dans recurrence_templates et met à jour les transactions existantes.
 */
export function rehabilitateOrphanRecurrentTransactions(db: DatabaseSync): { rehabilitatedCount: number; updatedTxsCount: number } {
  const orphans = db.prepare(`
    SELECT DISTINCT label, type, amount, recurrenceDay, accountId, categoryId, notes, payerId, substr(date, 1, 7) as startMonth
    FROM transactions
    WHERE deleted_at IS NULL
      AND recurrenceDay IS NOT NULL
      AND (templateId IS NULL OR templateId = '')
  `).all() as any[];

  if (orphans.length === 0) {
    return { rehabilitatedCount: 0, updatedTxsCount: 0 };
  }

  let rehabilitatedCount = 0;
  let updatedTxsCount = 0;

  const spName = `sp_rehab_rec_${Date.now()}`;
  db.exec(`SAVEPOINT ${spName};`);
  try {
    for (const orph of orphans) {
      // Vérifier si un template actif ou inactif avec le même label, type, recurrenceDay et accountId existe déjà
      const existingTmpl = db.prepare(`
        SELECT id FROM recurrence_templates
        WHERE label = ? AND type = ? AND recurrenceDay = ? AND accountId = ?
        LIMIT 1
      `).get(orph.label, orph.type, orph.recurrenceDay, orph.accountId) as { id: string } | undefined;

      let templateId: string;
      if (existingTmpl) {
        templateId = existingTmpl.id;
      } else {
        templateId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        db.prepare(`
          INSERT INTO recurrence_templates (
            id, type, amount, recurrenceDay, accountId, categoryId, label, notes, startDate, isActive, payerId, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
          templateId,
          orph.type,
          Number(orph.amount) || 0,
          Number(orph.recurrenceDay),
          orph.accountId,
          orph.categoryId || null,
          orph.label || '',
          orph.notes || null,
          orph.startMonth || '2026-11',
          orph.payerId || null,
          nowIso,
          nowIso
        );
        rehabilitatedCount++;
      }

      // Lier toutes les transactions correspondantes au templateId
      const updateStmt = db.prepare(`
        UPDATE transactions
        SET templateId = ?
        WHERE deleted_at IS NULL
          AND label = ?
          AND type = ?
          AND recurrenceDay = ?
          AND accountId = ?
          AND (templateId IS NULL OR templateId = '')
      `);
      const updateRes = updateStmt.run(templateId, orph.label, orph.type, orph.recurrenceDay, orph.accountId) as { changes?: number };
      updatedTxsCount += Number(updateRes?.changes || 0);
    }

    db.exec(`RELEASE ${spName};`);
    return { rehabilitatedCount, updatedTxsCount };
  } catch (err) {
    db.exec(`ROLLBACK TO ${spName}; RELEASE ${spName};`);
    throw err;
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
      deleted_at INTEGER DEFAULT NULL,
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

    -- 7b. Table Historique des modifications de mensualités de prêts
    CREATE TABLE IF NOT EXISTS loan_payment_history (
      id TEXT PRIMARY KEY,
      loanId TEXT NOT NULL,
      effectiveMonth TEXT NOT NULL,
      monthlyPayment REAL NOT NULL,
      previousPayment REAL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (loanId) REFERENCES loans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_loan_payment_history_loan_month ON loan_payment_history(loanId, effectiveMonth);

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
      payerId TEXT,
      commitment_end_date TEXT DEFAULT NULL,
      price_after_promo REAL DEFAULT NULL,
      notice_period_days INTEGER DEFAULT 30,
      contract_end_date TEXT DEFAULT NULL
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

    -- Index de performance pour les filtres par date, compte, type, liens et échéances (colonnes stables du schéma de base)
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(accountId);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_template ON transactions(templateId);
    CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linkedId);
    CREATE INDEX IF NOT EXISTS idx_transactions_dest_account ON transactions(destinationAccountId);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(accountId, date);
    CREATE INDEX IF NOT EXISTS idx_loans_account ON loans(accountId);
    CREATE INDEX IF NOT EXISTS idx_recurrence_account ON recurrence_templates(accountId);
    CREATE INDEX IF NOT EXISTS idx_planned_expenses_category ON planned_expenses(categoryId);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}
