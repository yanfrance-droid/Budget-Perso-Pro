import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createSafetyBackup } from './migrationService.ts';
import { initDatabase } from '../db.ts';

export interface SystemHealthMetrics {
  uptimeSeconds: number;
  uptimeFormatted: string;
  memoryUsageMb: number;
  memoryUsageFormatted: string;
  ramStats?: {
    totalFormatted: string;
    freeFormatted: string;
    usedFormatted: string;
    percentUsed: number;
  };
  serverIp: string;
  cpu: {
    cores: number;
    usagePercent: number;
    loadAvg: number[];
    loadFormatted: string;
  };
  diskStats?: {
    totalFormatted: string;
    freeFormatted: string;
    usedFormatted: string;
    percentUsed: number;
  };
}

export interface MaintenanceStatus {
  integrity: string;
  dbSizeBytes: number;
  dbSizeFormatted: string;
  walSizeBytes: number;
  walSizeFormatted: string;
  tableCounts: {
    accounts: number;
    categories: number;
    incomePayers: number;
    transactions: number;
    loans: number;
    recurrenceTemplates: number;
    plannedExpenses: number;
  };
  systemMetrics: SystemHealthMetrics;
}

export interface OrphanCheckResult {
  orphanTransactionsCount: number;
  missingAccountTransactions: number;
  missingCategoryTransactions: number;
  brokenRecurringLinks: number;
  details: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

function getPrimaryServerIp(): string {
  try {
    const nets = os.networkInterfaces();
    const candidates: Array<{ name: string; address: string }> = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        const isIpv4 = net.family === 'IPv4' || (typeof (net.family as any) === 'number' && (net.family as any) === 4);
        if (isIpv4 && !net.internal) {
          candidates.push({ name, address: net.address });
        }
      }
    }
    // Privilégier les adresses IP privées LAN classiques
    const lan = candidates.find(c => 
      c.address.startsWith('192.168.') || 
      c.address.startsWith('10.') || 
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(c.address)
    );
    if (lan) return lan.address;
    if (candidates.length > 0) return candidates[0].address;
  } catch {}
  return '127.0.0.1';
}

function getCpuSnapshot(): { idle: number; total: number } {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const t in c.times) {
      total += (c.times as any)[t];
    }
    idle += c.times.idle;
  }
  return { idle, total };
}

let lastCpuSnapshot = getCpuSnapshot();
let lastCpuUsagePercent = 0;

function calculateCpuMetrics(): SystemHealthMetrics['cpu'] {
  const cpus = os.cpus() || [];
  const cores = cpus.length;
  const currentSnap = getCpuSnapshot();
  const idleDiff = currentSnap.idle - lastCpuSnapshot.idle;
  const totalDiff = currentSnap.total - lastCpuSnapshot.total;

  if (totalDiff > 0) {
    lastCpuUsagePercent = Math.min(100, Math.max(0, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
    lastCpuSnapshot = currentSnap;
  } else if (lastCpuUsagePercent === 0 && currentSnap.total > 0) {
    // Calcul de base cumulatif initial
    lastCpuUsagePercent = Math.min(100, Math.max(0, Math.round(((currentSnap.total - currentSnap.idle) / currentSnap.total) * 100)));
  }

  const loadAvg = os.loadavg() || [0, 0, 0];
  const loadFormatted = loadAvg.map(l => l.toFixed(2)).join(', ');

  return {
    cores,
    usagePercent: lastCpuUsagePercent,
    loadAvg,
    loadFormatted
  };
}

function getSystemMetrics(): SystemHealthMetrics {
  const uptimeSec = Math.floor(process.uptime());
  const memUsage = process.memoryUsage().rss;

  let diskStats: SystemHealthMetrics['diskStats'] | undefined;
  try {
    const dbPath = process.env.DB_PATH || './data/budget.db';
    const targetDir = path.dirname(path.resolve(dbPath));
    if (fs.existsSync(targetDir) && (fs as any).statfsSync) {
      const stats = (fs as any).statfsSync(targetDir);
      const total = stats.bsize * stats.blocks;
      const free = stats.bsize * stats.bfree;
      const used = total - free;
      diskStats = {
        totalFormatted: formatBytes(total),
        freeFormatted: formatBytes(free),
        usedFormatted: formatBytes(used),
        percentUsed: Math.round((used / total) * 100)
      };
    }
  } catch {}

  let ramStats: SystemHealthMetrics['ramStats'] | undefined;
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    ramStats = {
      totalFormatted: formatBytes(totalMem),
      freeFormatted: formatBytes(freeMem),
      usedFormatted: formatBytes(usedMem),
      percentUsed: Math.round((usedMem / totalMem) * 100)
    };
  } catch {}

  return {
    uptimeSeconds: uptimeSec,
    uptimeFormatted: formatUptime(uptimeSec),
    memoryUsageMb: Math.round(memUsage / 1024 / 1024),
    memoryUsageFormatted: `${Math.round(memUsage / 1024 / 1024)} Mo`,
    ramStats,
    serverIp: getPrimaryServerIp(),
    cpu: calculateCpuMetrics(),
    diskStats
  };
}

/**
 * Diagnostic de l'intégrité SQLite et statistiques d'espace.
 */
export function getMaintenanceStatus(db: DatabaseSync): MaintenanceStatus {
  const integrityRow = db.prepare('PRAGMA integrity_check(1);').get() as { integrity_check?: string };
  const integrity = integrityRow?.integrity_check || 'ok';

  const dbPath = process.env.DB_PATH || './data/budget.db';
  let dbSizeBytes = 0;
  let walSizeBytes = 0;

  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    dbSizeBytes = fs.statSync(dbPath).size;
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      walSizeBytes = fs.statSync(walPath).size;
    }
  }

  const getCount = (table: string): number => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number };
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };

  return {
    integrity,
    dbSizeBytes,
    dbSizeFormatted: formatBytes(dbSizeBytes),
    walSizeBytes,
    walSizeFormatted: formatBytes(walSizeBytes),
    tableCounts: {
      accounts: getCount('accounts'),
      categories: getCount('categories'),
      incomePayers: getCount('income_payers'),
      transactions: getCount('transactions'),
      loans: getCount('loans'),
      recurrenceTemplates: getCount('recurrence_templates'),
      plannedExpenses: getCount('planned_expenses')
    },
    systemMetrics: getSystemMetrics()
  };
}

/**
 * Optimisation physique de la base (VACUUM, PRAGMA optimize et checkpoint TRUNCATE du WAL).
 */
export function vacuumAndOptimize(db: DatabaseSync): { success: boolean; message: string; beforeSize: string; afterSize: string } {
  const dbPath = process.env.DB_PATH || './data/budget.db';
  let beforeSize = 0;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    beforeSize = fs.statSync(dbPath).size;
  }

  // 1. Vidage et troncature complète du journal WAL vers la base principale
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (err) {
    console.warn('wal_checkpoint error:', err);
  }

  // 2. Optimisation des statistiques d'index
  db.exec('PRAGMA optimize;');

  // 3. Compaction physique de la base
  db.exec('VACUUM;');

  // 4. Second checkpoint pour s'assurer que le WAL généré par le VACUUM est ramené à zéro
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (err) {
    console.warn('wal_checkpoint error:', err);
  }

  let afterSize = 0;
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    afterSize = fs.statSync(dbPath).size;
  }

  return {
    success: true,
    message: 'Base de données optimisée, défragmentée et journal WAL purgé avec succès.',
    beforeSize: formatBytes(beforeSize),
    afterSize: formatBytes(afterSize)
  };
}

/**
 * Analyse et diagnostic des enregistrements orphelins.
 */
export function checkOrphans(db: DatabaseSync): OrphanCheckResult {
  const missingAccounts = db.prepare(`
    SELECT COUNT(*) as c FROM transactions t
    WHERE t.accountId NOT IN (SELECT id FROM accounts)
  `).get() as { c: number };

  const missingCategories = db.prepare(`
    SELECT COUNT(*) as c FROM transactions t
    WHERE t.categoryId IS NOT NULL 
      AND t.categoryId != '' 
      AND t.categoryId NOT IN (SELECT id FROM categories)
  `).get() as { c: number };

  const brokenRecurrences = db.prepare(`
    SELECT COUNT(*) as c FROM transactions t
    WHERE t.templateId IS NOT NULL 
      AND t.templateId != '' 
      AND t.templateId NOT IN (SELECT id FROM recurrence_templates)
  `).get() as { c: number };

  const details: string[] = [];
  if (missingAccounts.c > 0) details.push(`${missingAccounts.c} transaction(s) sans compte bancaire rattaché.`);
  if (missingCategories.c > 0) details.push(`${missingCategories.c} transaction(s) avec catégorie inexistante.`);
  if (brokenRecurrences.c > 0) details.push(`${brokenRecurrences.c} transaction(s) liée(s) à un modèle de récurrence supprimé.`);

  return {
    orphanTransactionsCount: missingAccounts.c + missingCategories.c + brokenRecurrences.c,
    missingAccountTransactions: missingAccounts.c,
    missingCategoryTransactions: missingCategories.c,
    brokenRecurringLinks: brokenRecurrences.c,
    details
  };
}

/**
 * Nettoie et répare les anomalies orphelines sans altérer l'historique validé.
 */
export function repairOrphans(db: DatabaseSync): { success: boolean; repaired: number; message: string } {
  db.exec('BEGIN IMMEDIATE;');
  try {
    let repaired = 0;

    // 1. Déconnecter les liens vers des modèles de récurrence inexistants
    const brokenTmplStmt = db.prepare(`
      UPDATE transactions 
      SET templateId = NULL 
      WHERE templateId IS NOT NULL 
        AND templateId != '' 
        AND templateId NOT IN (SELECT id FROM recurrence_templates)
    `);
    const tmplChanges = brokenTmplStmt.run();
    repaired += Number(tmplChanges.changes || 0);

    // 2. Dissocier les catégories supprimées (passer categoryId à NULL pour conserver la transaction)
    const brokenCatStmt = db.prepare(`
      UPDATE transactions 
      SET categoryId = NULL 
      WHERE categoryId IS NOT NULL 
        AND categoryId != '' 
        AND categoryId NOT IN (SELECT id FROM categories)
    `);
    const catChanges = brokenCatStmt.run();
    repaired += Number(catChanges.changes || 0);

    // 3. Si des transactions n'ont pas de compte valide, les rattacher au premier compte actif existant
    const firstAccount = db.prepare('SELECT id FROM accounts WHERE isClosed = 0 LIMIT 1').get() as { id: string } | undefined;
    if (firstAccount) {
      const brokenAccStmt = db.prepare(`
        UPDATE transactions 
        SET accountId = ? 
        WHERE accountId NOT IN (SELECT id FROM accounts)
      `);
      const accChanges = brokenAccStmt.run(firstAccount.id);
      repaired += Number(accChanges.changes || 0);
    }

    db.exec('COMMIT;');
    return {
      success: true,
      repaired,
      message: `${repaired} anomalie(s) orpheline(s) corrigée(s) avec succès.`
    };
  } catch (err: any) {
    db.exec('ROLLBACK;');
    throw new Error(`Échec de la réparation des orphelins : ${err.message}`);
  }
}

/**
 * Réinitialisation complète des données (Hard Reset) avec instantané automatique préalable.
 * Conserve strictement les utilisateurs et sessions pour ne pas verrouiller l'accès.
 * Purge ABSOLUMENT TOUTES les données métier (y compris loan_capital_history) pour repartir
 * sur une base 100 % vierge et sans aucune donnée personnelle résiduelle.
 * (resetLoanCapitalHistory vaut true par défaut ; peut être passé à false si conservation demandée).
 */
export function resetDatabaseData(
  db: DatabaseSync, 
  reseedDefaults = true,
  resetLoanCapitalHistory = true
): {
  success: boolean;
  safetyBackupPath: string;
  loanCapitalHistoryReset: boolean;
  message: string;
} {
  // 1. Sauvegarde de sécurité absolue avant toute purge
  const safetyBackupPath = createSafetyBackup(db);

  db.exec('BEGIN IMMEDIATE;');
  try {
    // Purge de toutes les données métier
    db.exec('DELETE FROM transactions;');
    db.exec('DELETE FROM loans;');
    db.exec('DELETE FROM recurrence_templates;');
    db.exec('DELETE FROM income_payers;');
    db.exec('DELETE FROM planned_expenses;');
    db.exec('DELETE FROM categories;');
    db.exec('DELETE FROM accounts;');
    db.exec("DELETE FROM app_settings WHERE key IN ('manualBalance', 'card1', 'card2');");

    // Purge de l'historique des capitaux (par défaut OUI pour un RAZ 100% propre)
    let historyWasReset = false;
    if (resetLoanCapitalHistory !== false) {
      db.exec('DELETE FROM loan_capital_history;');
      historyWasReset = true;
    }

    // 2. Si demandé, réensemencer un compte par défaut propre
    if (reseedDefaults) {
      const accountId = crypto.randomUUID();
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate, isClosed)
        VALUES (?, 'Compte Courant', 'checking', 'checking', 0, ?, 0)
      `).run(accountId, today);

      // Création de quelques catégories standard pour démarrer proprement
      const defaultCategories = [
        { name: 'Salaire & Revenus', type: 'income', color: '#10b981' },
        { name: 'Logement & Loyer', type: 'fixed_expense', color: '#3b82f6' },
        { name: 'Électricité / Gaz / Eau', type: 'fixed_expense', color: '#6366f1' },
        { name: 'Abonnements & Internet', type: 'fixed_expense', color: '#8b5cf6' },
        { name: 'Alimentation & Supermarché', type: 'daily', color: '#f59e0b' },
        { name: 'Transports & Carburant', type: 'variable_expense', color: '#ef4444' },
        { name: 'Santé & Pharmacie', type: 'health_expense', color: '#ec4899' },
        { name: 'Loisirs & Sorties', type: 'daily', color: '#14b8a6' },
        { name: 'Épargne & Virements', type: 'transfer', color: '#06b6d4' }
      ];

      const catStmt = db.prepare('INSERT INTO categories (id, name, type, color, isArchived) VALUES (?, ?, ?, ?, 0)');
      for (const cat of defaultCategories) {
        catStmt.run(crypto.randomUUID(), cat.name, cat.type, cat.color);
      }
    }

    db.exec('COMMIT;');

    // 3. Défragmentation post-purge
    try {
      db.exec('VACUUM;');
    } catch {
      // Ignoré si verrou temporaire
    }

    return {
      success: true,
      safetyBackupPath,
      loanCapitalHistoryReset: historyWasReset,
      message: historyWasReset 
        ? 'La base de données et l\'historique des capitaux ont été réinitialisés avec succès. Une copie de sécurité a été créée.'
        : 'La base de données a été réinitialisée avec succès (l\'historique patrimonial des crédits a été préservé). Une copie de sécurité a été créée.'
    };
  } catch (err: any) {
    db.exec('ROLLBACK;');
    throw new Error(`Échec de la réinitialisation des données : ${err.message}`);
  }
}

/**
 * Restaure une base de données depuis un fichier SQLite (.db) uploadé.
 * Valide rigoureusement le fichier avec PRAGMA integrity_check avant tout remplacement.
 */
/**
 * Restaure une base de données depuis un fichier SQLite (.db) uploadé ou présent sur le serveur.
 * Valide rigoureusement le fichier avec PRAGMA integrity_check avant tout remplacement.
 * Effectue un drainage sécurisé, ferme la base pour libérer -wal et -shm, remplace de façon atomique
 * et applique un retour arrière complet en cas de problème.
 */
export function restoreSqliteDbFile(
  db: DatabaseSync, 
  uploadedFilePath: string,
  options?: { targetDbPath?: string; onBeforeClose?: () => Promise<void> | void }
): {
  success: boolean;
  safetyBackupPath: string;
  message: string;
} {
  if (!fs.existsSync(uploadedFilePath)) {
    throw new Error('Fichier de restauration introuvable.');
  }

  // 1. Vérification d'intégrité du fichier candidat avec une connexion temporaire
  let tempDb: DatabaseSync | null = null;
  try {
    tempDb = new DatabaseSync(uploadedFilePath);
    const integrityCheck = tempDb.prepare('PRAGMA integrity_check(1);').get() as { integrity_check?: string };
    if (!integrityCheck || integrityCheck.integrity_check !== 'ok') {
      throw new Error(`Le fichier SQLite fourni est corrompu (${integrityCheck?.integrity_check || 'invalide'}).`);
    }

    // Vérifier les contraintes de clés étrangères du fichier candidat
    const fkCheck = tempDb.prepare('PRAGMA foreign_key_check;').all() as any[];
    if (fkCheck.length > 0) {
      throw new Error('Le fichier SQLite fourni contient des violations de clés étrangères.');
    }

    // Vérifier la présence obligatoire de toutes les tables du schéma
    const REQUIRED_TABLES = [
      'users',
      'sessions',
      'accounts',
      'categories',
      'transactions',
      'loans',
      'recurrence_templates',
      'app_settings'
    ];

    const placeholders = REQUIRED_TABLES.map(() => '?').join(',');
    const tableRows = tempDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})
    `).all(...REQUIRED_TABLES) as { name: string }[];

    const foundTables = new Set(tableRows.map(r => r.name));
    const missingTables = REQUIRED_TABLES.filter(t => !foundTables.has(t));
    if (missingTables.length > 0) {
      throw new Error(`Le fichier SQLite fourni est incomplet pour Budget Perso Pro. Table(s) manquante(s) : ${missingTables.join(', ')}.`);
    }
  } finally {
    if (tempDb) {
      try { tempDb.close(); } catch {}
    }
  }

  // 2. Détermination du chemin effectif de la base de données
  const dbLoc = typeof (db as any).location === 'function' ? (db as any).location() : null;
  const dbPath = options?.targetDbPath || dbLoc || (process.env.DB_PATH || './data/budget.db');
  
  if (dbPath === ':memory:' || dbLoc === null) {
    return {
      success: true,
      safetyBackupPath: ':memory:',
      message: 'Restauration validée avec succès (environnement mémoire).'
    };
  }

  const resolvedDbPath = path.resolve(dbPath);
  const dbDir = path.dirname(resolvedDbPath);

  // 3. Création préalable d'une copie de sécurité de la base actuelle
  const safetyBackupPath = createSafetyBackup(db, path.join(dbDir, 'backups'));

  // Notification / hook avant fermeture si fourni (ex: drainage applicatif)
  if (options?.onBeforeClose) {
    const res = options.onBeforeClose();
    if (res && typeof (res as any).then === 'function') {
      throw new Error('onBeforeClose doit être synchrone dans ce contexte.');
    }
  }

  // 4. Checkpoint WAL et fermeture propre de la base pour relâcher les verrous OS
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (cpErr: any) {
    console.warn('Avertissement checkpoint avant restauration:', cpErr.message);
  }

  db.close();

  const backupOldPath = `${resolvedDbPath}.old_${Date.now()}`;
  let isRenamed = false;

  try {
    // 5. Renommage atomique de l'ancienne base vers .old
    if (fs.existsSync(resolvedDbPath)) {
      fs.renameSync(resolvedDbPath, backupOldPath);
      isRenamed = true;
    }

    // 6. Suppression propre des résidus WAL et SHM (désormais déverrouillés car db est fermée)
    const walPath = `${resolvedDbPath}-wal`;
    const shmPath = `${resolvedDbPath}-shm`;
    if (fs.existsSync(walPath)) {
      try { fs.unlinkSync(walPath); } catch (e: any) { console.warn('Impossible de supprimer wal:', e.message); }
    }
    if (fs.existsSync(shmPath)) {
      try { fs.unlinkSync(shmPath); } catch (e: any) { console.warn('Impossible de supprimer shm:', e.message); }
    }

    // 7. Copie du nouveau fichier restauré vers l'emplacement cible
    fs.copyFileSync(uploadedFilePath, resolvedDbPath);

    // 8. Réouverture de la connexion SQLite et réactivation des pragmas de sécurité
    db.open();
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');

    // 8b. Application automatique des migrations (ex: table income_payers ou colonnes ajoutées)
    // directement sur la connexion réouverte pour garantir la rétrocompatibilité totale
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS income_payers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          isArchived INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL
        );
      `);
      const txCols = db.prepare("PRAGMA table_info(transactions)").all() as any[];
      if (!txCols.some(c => c.name === 'payerId')) {
        db.exec("ALTER TABLE transactions ADD COLUMN payerId TEXT;");
      }
      const recCols = db.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
      if (!recCols.some(c => c.name === 'payerId')) {
        db.exec("ALTER TABLE recurrence_templates ADD COLUMN payerId TEXT;");
      }
      const userCols = db.prepare("PRAGMA table_info(users)").all() as any[];
      if (!userCols.some(c => c.name === 'recovery_key_hash')) {
        db.exec("ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;");
        db.exec("ALTER TABLE users ADD COLUMN recovery_key_salt TEXT;");
      }
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
    } catch (migErr: any) {
      console.warn('Avertissement migration post-restauration:', migErr.message);
    }

    // 9. Vérification d'intégrité à chaud après réouverture
    const postCheck = db.prepare('PRAGMA quick_check(1);').get() as { quick_check?: string };
    if (!postCheck || postCheck.quick_check !== 'ok') {
      throw new Error(`La base réouverte n'est pas intègre (${postCheck?.quick_check || 'invalide'}).`);
    }

    // Tout est validé : suppression du fichier temporaire .old
    if (isRenamed && fs.existsSync(backupOldPath)) {
      try { fs.unlinkSync(backupOldPath); } catch {}
    }

    return {
      success: true,
      safetyBackupPath,
      message: 'Base de données SQLite restaurée avec succès. Toutes vos données ont été synchronisées.'
    };
  } catch (err: any) {
    // ==========================================
    // STRATÉGIE DE RETOUR ARRIÈRE (ROLLBACK)
    // ==========================================
    console.error('Échec du remplacement lors de la restauration. Déclenchement du retour arrière :', err);

    let rollbackSuccess = false;
    try {
      if (db.isOpen) {
        try { db.close(); } catch {}
      }

      // Nettoyer l'éventuel fichier partiellement copié
      if (fs.existsSync(resolvedDbPath)) {
        try { fs.unlinkSync(resolvedDbPath); } catch {}
      }

      // Rétablir l'ancienne base depuis .old
      if (isRenamed && fs.existsSync(backupOldPath)) {
        fs.renameSync(backupOldPath, resolvedDbPath);
        isRenamed = false;
      }

      // Réouvrir l'ancienne base restaurée
      db.open();
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 5000;');
      rollbackSuccess = true;
    } catch (rbErr: any) {
      console.error('CRITIQUE: Le retour arrière automatique a également échoué :', rbErr);
    }

    const additionalInfo = rollbackSuccess
      ? 'L\'ancienne base de données a été rétablie avec succès (retour arrière automatique).'
      : `ATTENTION: Le retour arrière a échoué. Le fichier de sauvegarde préalable est disponible sous : ${safetyBackupPath}`;

    throw new Error(`Échec de la restauration SQLite : ${err.message}. ${additionalInfo}`);
  }
}

/**
 * Exécute une sauvegarde quotidienne automatique si activée.
 * Conserve les 7 derniers jours (rotation automatique).
 */
export function runDailyAutoBackup(db: DatabaseSync): string | null {
  try {
    const dbPath = process.env.DB_PATH || './data/budget.db';
    if (dbPath === ':memory:') return null;

    const dbDir = path.dirname(path.resolve(dbPath));
    const backupDir = path.join(dbDir, 'backups', 'auto');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const backupFile = path.join(backupDir, `budget_auto_${todayStr}.db`);

    // Si la sauvegarde du jour existe déjà, rien à faire
    if (fs.existsSync(backupFile)) {
      return backupFile;
    }

    db.exec(`VACUUM INTO '${backupFile.replace(/\\/g, '/')}'`);

    // Rotation : conserver uniquement les 7 sauvegardes les plus récentes
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('budget_auto_') && f.endsWith('.db'))
      .sort();

    while (files.length > 7) {
      const oldest = files.shift();
      if (oldest) {
        try { fs.unlinkSync(path.join(backupDir, oldest)); } catch {}
      }
    }

    return backupFile;
  } catch (err) {
    console.warn('Erreur lors de la sauvegarde automatique quotidienne :', err);
    return null;
  }
}

export interface ServerSnapshotInfo {
  fileName: string;
  relativePath: string;
  type: 'auto' | 'safety' | 'manual';
  label: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  createdFormatted: string;
}

/**
 * Liste l'ensemble des instantanés SQLite (.db) disponibles sur le serveur
 * dans data/backups/auto et data/backups, classés du plus récent au plus ancien.
 */
export function listServerSnapshots(): ServerSnapshotInfo[] {
  const dbPath = process.env.DB_PATH || './data/budget.db';
  if (dbPath === ':memory:') return [];

  const dbDir = path.dirname(path.resolve(dbPath));
  const backupsDir = path.join(dbDir, 'backups');
  const autoBackupsDir = path.join(backupsDir, 'auto');

  const snapshots: ServerSnapshotInfo[] = [];

  const inspectDirectory = (dir: string, defaultType: 'auto' | 'manual') => {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.db')) continue;

      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        let type: 'auto' | 'safety' | 'manual' = defaultType;
        let label = 'Sauvegarde manuelle';

        if (file.startsWith('budget_auto_')) {
          type = 'auto';
          const match = file.match(/budget_auto_(\d{4}-\d{2}-\d{2})\.db/);
          label = match ? `Sauvegarde quotidienne auto (${match[1]})` : 'Sauvegarde automatique';
        } else if (file.startsWith('budget_safety_')) {
          type = 'safety';
          label = 'Copie de sécurité avant restauration';
        } else if (file.startsWith('budget_backup_')) {
          type = 'manual';
          label = 'Instantané manuel';
        }

        const dateObj = new Date(stat.mtime);
        const createdFormatted = `${dateObj.toLocaleDateString('fr-FR')} à ${dateObj.toLocaleTimeString('fr-FR')}`;

        snapshots.push({
          fileName: file,
          relativePath: path.relative(backupsDir, fullPath).replace(/\\/g, '/'),
          type,
          label,
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          createdAt: dateObj.toISOString(),
          createdFormatted
        });
      } catch {}
    }
  };

  inspectDirectory(autoBackupsDir, 'auto');
  inspectDirectory(backupsDir, 'manual');

  // Trier par date décroissante (les plus récents en premier)
  snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return snapshots;
}

/**
 * Restaure directement un instantané SQLite (.db) stocké sur le serveur
 * avec copie de sécurité préalable de la base courante.
 */
export function restoreServerSnapshot(
  db: DatabaseSync,
  targetRelativeOrFileName: string,
  options?: { targetDbPath?: string; onBeforeClose?: () => Promise<void> | void }
): { success: boolean; safetyBackupPath: string; message: string } {
  const dbPath = options?.targetDbPath || (typeof (db as any).location === 'function' ? (db as any).location() : (process.env.DB_PATH || './data/budget.db'));
  if (dbPath === ':memory:') {
    return {
      success: true,
      safetyBackupPath: ':memory:',
      message: 'Restauration effectuée avec succès (environnement mémoire).'
    };
  }

  const dbDir = path.dirname(path.resolve(dbPath));
  const backupsDir = path.join(dbDir, 'backups');

  // Sécurisation stricte contre les tentatives de path traversal
  const sanitized = targetRelativeOrFileName.replace(/\\/g, '/').replace(/\.\./g, '');
  const candidatePath = path.resolve(backupsDir, sanitized);

  if (!candidatePath.startsWith(backupsDir) || !fs.existsSync(candidatePath)) {
    throw new Error('Le fichier de sauvegarde spécifié est introuvable sur le serveur.');
  }

  // Appliquer la restauration directe et sécurisée
  return restoreSqliteDbFile(db, candidatePath, options);
}

/**
 * Supprime tous les fichiers de sauvegarde (.db, .json) situés dans le dossier backups
 * et ses sous-dossiers (auto, manual, safety, etc.) sans jamais toucher à la base principale active.
 */
export function purgeServerBackups(): { success: boolean; deletedCount: number; message: string } {
  const dbPath = process.env.DB_PATH || './data/budget.db';
  if (dbPath === ':memory:') {
    return { success: true, deletedCount: 0, message: 'Aucune sauvegarde physique en mode mémoire.' };
  }

  const resolvedDbPath = path.resolve(dbPath);
  const dbDir = path.dirname(resolvedDbPath);
  const backupsDir = path.join(dbDir, 'backups');

  if (!fs.existsSync(backupsDir)) {
    return { success: true, deletedCount: 0, message: 'Le dossier des sauvegardes est vide.' };
  }

  let deletedCount = 0;

  const purgeDirectoryRecursive = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Sécurité absolue : ne JAMAIS toucher au fichier de base actif ni à ses dérivés wal/shm
      if (fullPath === resolvedDbPath || fullPath === `${resolvedDbPath}-wal` || fullPath === `${resolvedDbPath}-shm`) {
        continue;
      }

      if (entry.isDirectory()) {
        purgeDirectoryRecursive(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.db' || ext === '.json' || ext === '.sqlite' || ext === '.sqlite3') {
          try {
            fs.unlinkSync(fullPath);
            deletedCount++;
          } catch (err: any) {
            console.warn(`Impossible de supprimer la sauvegarde ${fullPath}:`, err.message);
          }
        }
      }
    }
  };

  purgeDirectoryRecursive(backupsDir);

  return {
    success: true,
    deletedCount,
    message: `${deletedCount} fichier(s) de sauvegarde supprimé(s) avec succès.`
  };
}
