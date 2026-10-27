import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../db.ts';
import { 
  getMaintenanceStatus, 
  vacuumAndOptimize, 
  checkOrphans, 
  repairOrphans, 
  resetDatabaseData,
  runDailyAutoBackup,
  purgeServerBackups
} from './maintenanceService.ts';

describe('maintenanceService', () => {
  let db: DatabaseSync;
  const originalEnvDbPath = process.env.DB_PATH;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    process.env.DB_PATH = originalEnvDbPath;
  });

  it('1. retourne un statut d intégrité valide et le décompte des tables', () => {
    const status = getMaintenanceStatus(db);
    expect(status.integrity).toBe('ok');
    expect(status.tableCounts.accounts).toBeGreaterThanOrEqual(1); // Seeded default account
    expect(status.tableCounts.transactions).toBe(0);
  });

  it('2. exécute vacuumAndOptimize sans erreur', () => {
    const result = vacuumAndOptimize(db);
    expect(result.success).toBe(true);
    expect(result.message).toContain('optimisée');
  });

  it('3. détecte et répare les anomalies orphelines', () => {
    // Insérer une transaction avec une catégorie inexistante et un template inexistant
    const acc = db.prepare('SELECT id FROM accounts LIMIT 1').get() as { id: string };
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, categoryId, templateId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tx-orphan-1', '2026-10-01', 'fixed_expense', 50, 'planned', acc.id, 'cat-ghost', 'tmpl-ghost');

    const checkBefore = checkOrphans(db);
    expect(checkBefore.missingCategoryTransactions).toBe(1);
    expect(checkBefore.brokenRecurringLinks).toBe(1);

    const repairResult = repairOrphans(db);
    expect(repairResult.success).toBe(true);
    expect(repairResult.repaired).toBeGreaterThan(0);

    const checkAfter = checkOrphans(db);
    expect(checkAfter.missingCategoryTransactions).toBe(0);
    expect(checkAfter.brokenRecurringLinks).toBe(0);

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-orphan-1') as any;
    expect(tx.categoryId).toBeNull();
    expect(tx.templateId).toBeNull();
  });

  it('4. réinitialise les données tout en conservant l utilisateur et en réensemençant des catégories propres', () => {
    // Créer un utilisateur et quelques données
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('u1', 'admin', 'hash', 'salt', '2026-10-01');

    const acc = db.prepare('SELECT id FROM accounts LIMIT 1').get() as { id: string };
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('tx-to-delete', '2026-10-01', 'income', 1000, 'cleared', acc.id);

    // Insérer des dépenses prévisionnelles
    db.prepare(`
      INSERT INTO planned_expenses (id, label, estimatedAmount, urgency, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run('plan-to-delete-1', 'Dépense prévisionnelle 1', 250, 'urgent', '2026-10-01');
    db.prepare(`
      INSERT INTO planned_expenses (id, label, estimatedAmount, urgency, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run('plan-to-delete-2', 'Dépense prévisionnelle 2', 500, 'medium', '2026-10-02');

    // Insérer un enregistrement dans loan_capital_history
    db.prepare(`
      INSERT INTO loan_capital_history (month, real_estate_capital, real_estate_monthly_payment, consumer_capital, consumer_monthly_payment)
      VALUES (?, ?, ?, ?, ?)
    `).run('2026-09', 93185.49, 544.12, 45528.51, 839.35);

    expect(db.prepare('SELECT COUNT(*) as c FROM planned_expenses').get() as { c: number }).toEqual({ c: 2 });
    expect(db.prepare('SELECT COUNT(*) as c FROM loan_capital_history').get() as { c: number }).toEqual({ c: 1 });

    const resetRes = resetDatabaseData(db, true);
    expect(resetRes.success).toBe(true);
    expect(resetRes.loanCapitalHistoryReset).toBe(true);

    // L'utilisateur existe toujours
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get('u1');
    expect(user).toBeDefined();

    // La transaction est effacée
    const tx = db.prepare('SELECT COUNT(*) as c FROM transactions').get() as { c: number };
    expect(tx.c).toBe(0);

    // Les dépenses prévisionnelles sont également purgées
    const planned = db.prepare('SELECT COUNT(*) as c FROM planned_expenses').get() as { c: number };
    expect(planned.c).toBe(0);

    // L'historique des capitaux de prêts est intégralement purgé (0 résidu)
    const historyCount = db.prepare('SELECT COUNT(*) as c FROM loan_capital_history').get() as { c: number };
    expect(historyCount.c).toBe(0);

    // Un compte et des catégories par défaut ont été créés
    const accCount = db.prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number };
    const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number };
    expect(accCount.c).toBe(1);
    expect(catCount.c).toBeGreaterThan(0);
  });

  describe('runDailyAutoBackup - Sauvegarde automatique quotidienne et rotation', () => {
    let tempDir: string;
    let tempDbPath: string;
    let diskDb: DatabaseSync;
    const originalEnvDbPath = process.env.DB_PATH;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget_auto_backup_test_'));
      tempDbPath = path.join(tempDir, 'budget.db');
      diskDb = new DatabaseSync(tempDbPath);
      diskDb.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
      diskDb.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT);
        CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT);
        INSERT INTO accounts (id, name) VALUES ('acc-auto-1', 'Compte Auto Test');
      `);
      process.env.DB_PATH = tempDbPath;
    });

    afterEach(() => {
      if (diskDb && diskDb.isOpen) {
        diskDb.close();
      }
      process.env.DB_PATH = originalEnvDbPath;
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('1. crée une sauvegarde automatique quotidienne dans le sous-dossier backups/auto', () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const backupPath = runDailyAutoBackup(diskDb);

      expect(backupPath).not.toBeNull();
      expect(fs.existsSync(backupPath!)).toBe(true);
      expect(backupPath).toContain(path.join('backups', 'auto'));
      expect(path.basename(backupPath!)).toBe(`budget_auto_${todayStr}.db`);

      // Vérifier que le fichier produit est un SQLite intègre et contient les données
      const verifyDb = new DatabaseSync(backupPath!);
      const check = verifyDb.prepare('PRAGMA integrity_check;').get() as any;
      expect(check.integrity_check).toBe('ok');

      const accounts = verifyDb.prepare('SELECT * FROM accounts').all() as any[];
      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('Compte Auto Test');
      verifyDb.close();
    });

    it('2. ne crée aucune duplication si une sauvegarde existe déjà pour la journée', () => {
      const firstPath = runDailyAutoBackup(diskDb);
      expect(firstPath).not.toBeNull();
      expect(fs.existsSync(firstPath!)).toBe(true);

      const mtimeFirst = fs.statSync(firstPath!).mtimeMs;

      // Deuxième exécution pour la même journée
      const secondPath = runDailyAutoBackup(diskDb);
      expect(secondPath).toBe(firstPath);

      // Le fichier existant ne doit pas être réécrit
      const mtimeSecond = fs.statSync(firstPath!).mtimeMs;
      expect(mtimeSecond).toBe(mtimeFirst);

      const autoDir = path.join(tempDir, 'backups', 'auto');
      const files = fs.readdirSync(autoDir).filter(f => f.startsWith('budget_auto_'));
      expect(files).toHaveLength(1);
    });

    it('3. rotation : lorsqu il existe plus de 7 sauvegardes automatiques, seules les 7 plus récentes sont conservées', () => {
      const autoDir = path.join(tempDir, 'backups', 'auto');
      fs.mkdirSync(autoDir, { recursive: true });

      // Simuler 8 sauvegardes passées créées avec des dates antérieures ordonnées
      const pastDates = [
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
        '2026-10-06',
        '2026-10-07',
        '2026-10-08'
      ];

      for (const d of pastDates) {
        const dummyFile = path.join(autoDir, `budget_auto_${d}.db`);
        fs.writeFileSync(dummyFile, 'DUMMY_SQLITE_CONTENT');
      }

      const filesBefore = fs.readdirSync(autoDir).filter(f => f.startsWith('budget_auto_'));
      expect(filesBefore).toHaveLength(8);

      // Exécuter la sauvegarde automatique du jour (aujourd'hui)
      // La sauvegarde du jour s'ajoute (total = 9), la boucle de rotation doit purger les plus anciennes
      // jusqu'à ce qu'il ne reste que 7 fichiers.
      const todayStr = new Date().toISOString().split('T')[0];
      const res = runDailyAutoBackup(diskDb);
      expect(res).not.toBeNull();

      const filesAfter = fs.readdirSync(autoDir)
        .filter(f => f.startsWith('budget_auto_') && f.endsWith('.db'))
        .sort();

      expect(filesAfter).toHaveLength(7);
      // Les deux plus anciennes dates (2026-10-01 et 2026-10-02) ont été purgées
      expect(filesAfter).not.toContain('budget_auto_2026-10-01.db');
      expect(filesAfter).not.toContain('budget_auto_2026-10-02.db');

      // Les dates plus récentes et celle d'aujourd'hui sont conservées
      expect(filesAfter).toContain('budget_auto_2026-10-08.db');
      expect(filesAfter).toContain(`budget_auto_${todayStr}.db`);
    });

    it('4. gère silencieusement les erreurs et retourne null sans faire planter l application', () => {
      // Simuler une base fermée qui échouera lors de db.exec('VACUUM INTO ...')
      diskDb.close();

      const result = runDailyAutoBackup(diskDb);
      expect(result).toBeNull();
    });

    it('5. retourne null immédiatement et n écrit rien si DB_PATH vaut :memory:', () => {
      process.env.DB_PATH = ':memory:';
      const memDb = initDatabase(':memory:');
      
      const result = runDailyAutoBackup(memDb);
      expect(result).toBeNull();

      // Vérifier qu'aucun dossier backups/auto n'a été créé dans tempDir
      const autoDir = path.join(tempDir, 'backups', 'auto');
      expect(fs.existsSync(autoDir)).toBe(false);
      memDb.close();
    });

    it('6. purgeServerBackups supprime les sauvegardes sans toucher à budget.db', () => {
      const autoDir = path.join(tempDir, 'backups', 'auto');
      const manualDir = path.join(tempDir, 'backups', 'manual');
      fs.mkdirSync(autoDir, { recursive: true });
      fs.mkdirSync(manualDir, { recursive: true });

      fs.writeFileSync(path.join(autoDir, 'backup1.db'), 'dummy1');
      fs.writeFileSync(path.join(manualDir, 'backup2.json'), '{"dummy": true}');
      fs.writeFileSync(path.join(tempDir, 'backups', 'backup3.sqlite'), 'dummy3');

      // Vérifier que budget.db existe
      expect(fs.existsSync(tempDbPath)).toBe(true);

      const res = purgeServerBackups();
      expect(res.success).toBe(true);
      expect(res.deletedCount).toBe(3);

      // Vérifier que les fichiers de backup ont bien été effacés
      expect(fs.existsSync(path.join(autoDir, 'backup1.db'))).toBe(false);
      expect(fs.existsSync(path.join(manualDir, 'backup2.json'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'backups', 'backup3.sqlite'))).toBe(false);

      // Vérifier que la base active budget.db existe toujours et n'a pas été supprimée
      expect(fs.existsSync(tempDbPath)).toBe(true);
    });
  });
});
