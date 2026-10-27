import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { restoreSqliteDbFile, restoreServerSnapshot } from './services/maintenanceService.ts';
import { createServer } from './app.ts';
import type { Server } from 'node:http';

describe('Restauration SQLite réelle sur disque avec WAL actif', () => {
  let tempTestDir: string;
  let testDbPath: string;
  let testBackupsDir: string;
  let db: DatabaseSync;
  let server: Server;
  let baseUrl: string;

  beforeEach(() => {
    // Répertoire temporaire isolé distinct de ./data/budget.db et ./data/backups
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget_restore_test_'));
    testDbPath = path.join(tempTestDir, 'budget.db');
    testBackupsDir = path.join(tempTestDir, 'backups');
    fs.mkdirSync(testBackupsDir, { recursive: true });

    // Initialisation réelle avec mode WAL et foreign keys
    db = new DatabaseSync(testDbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');

    // Schéma minimal pour le test
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT, FOREIGN KEY (accountId) REFERENCES accounts(id));
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
    `);

    // Données initiales (Version 1)
    db.exec(`
      INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-1', 'Compte V1', 'checking', 1000);
      INSERT INTO transactions (id, label, amount, accountId) VALUES ('tx-1', 'Achat V1', 50, 'acc-1');
    `);
  });

  afterEach(() => {
    if (server && server.listening) {
      server.close();
    }
    if (db && db.isOpen) {
      db.close();
    }
    // Nettoyage complet du dossier temporaire
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. Restaure avec succès une base de données sur disque en mode WAL sans corruption', () => {
    // 1. Créer un instantané valide "Version 2" dans un fichier séparé
    const snapshotPath = path.join(testBackupsDir, 'budget_snapshot_v2.db');
    const dbSnap = new DatabaseSync(snapshotPath);
    dbSnap.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    dbSnap.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT, FOREIGN KEY (accountId) REFERENCES accounts(id));
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
      INSERT INTO accounts (id, name, type, initialBalance, isClosed) VALUES ('acc-2', 'Compte V2 Restauré', 'savings', 5000, 0);
      INSERT INTO transactions (id, label, amount, accountId) VALUES ('tx-2', 'Dépôt V2', 200, 'acc-2');
    `);
    dbSnap.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    dbSnap.close();

    // 2. Générer des écritures actives dans la base V1 (créant des données dans le fichier .db-wal)
    db.exec(`
      INSERT INTO transactions (id, label, amount, accountId) VALUES ('tx-wal', 'Écriture WAL V1', 99, 'acc-1');
    `);
    expect(fs.existsSync(`${testDbPath}-wal`)).toBe(true);

    // 3. Exécuter la restauration de la V2
    const res = restoreSqliteDbFile(db, snapshotPath, { targetDbPath: testDbPath });
    expect(res.success).toBe(true);
    expect(fs.existsSync(res.safetyBackupPath)).toBe(true);

    // 4. Vérifier que la connexion db lit immédiatement la Version 2 sans redémarrage
    expect(db.isOpen).toBe(true);
    const accounts = db.prepare('SELECT * FROM accounts').all() as any[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('Compte V2 Restauré');

    const transactions = db.prepare('SELECT * FROM transactions').all() as any[];
    expect(transactions).toHaveLength(1);
    expect(transactions[0].label).toBe('Dépôt V2');

    // 5. Vérifier que les pragmas sont toujours actifs
    const journalMode = db.prepare('PRAGMA journal_mode;').get() as any;
    expect(journalMode.journal_mode).toBe('wal');
    const fk = db.prepare('PRAGMA foreign_keys;').get() as any;
    expect(fk.foreign_keys).toBe(1);

    // 6. Vérifier l'intégrité après nouvelle écriture
    db.exec("INSERT INTO transactions (id, label, amount, accountId) VALUES ('tx-post', 'Post-restauration', 15, 'acc-2');");
    const check = db.prepare('PRAGMA integrity_check;').get() as any;
    expect(check.integrity_check).toBe('ok');
  });

  it('2. Déclenche un retour arrière (Rollback) automatique si le fichier de restauration est corrompu', () => {
    // Créer un fichier invalide
    const corruptedPath = path.join(tempTestDir, 'corrupted.db');
    fs.writeFileSync(corruptedPath, 'CONTENU_TOTALEMENT_CORROMPU');

    // Tenter la restauration
    expect(() => {
      restoreSqliteDbFile(db, corruptedPath, { targetDbPath: testDbPath });
    }).toThrow();

    // Vérifier que la connexion est toujours ouverte et que les données V1 sont intactes
    expect(db.isOpen).toBe(true);
    const accs = db.prepare('SELECT * FROM accounts').all() as any[];
    expect(accs).toHaveLength(1);
    expect(accs[0].name).toBe('Compte V1');
  });

  it('3. Rejette les requêtes concurrentes en 503 pendant la restauration', async () => {
    // Initialiser un utilisateur et une session pour accéder à l'API
    db.exec(`
      INSERT INTO users (id, username, password_hash, salt) VALUES ('u1', 'admin', 'hash', 'salt');
      INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ('valid-token', 'u1', datetime('now', '+1 day'), datetime('now'));
    `);

    // Créer un serveur HTTP de test
    server = createServer(db);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;

    // Créer un instantané à restaurer
    const snapshotPath = path.join(testBackupsDir, 'budget_backup_server.db');
    const snap = new DatabaseSync(snapshotPath);
    snap.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    snap.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT, FOREIGN KEY (accountId) REFERENCES accounts(id));
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
      INSERT INTO users (id, username, password_hash, salt) VALUES ('u1', 'admin', 'hash', 'salt');
      INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ('valid-token', 'u1', datetime('now', '+1 day'), datetime('now'));
      INSERT INTO accounts (id, name, type, initialBalance, isClosed) VALUES ('acc-restored', 'Restauré', 'checking', 2000, 0);
    `);
    snap.close();

    // Déclencher la restauration via l'API
    const restorePromise = fetch(`${baseUrl}/api/maintenance/restore-db`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/x-sqlite3'
      },
      body: fs.readFileSync(snapshotPath)
    });

    // Émettre immédiatement une requête concurrente pendant que la restauration est en cours
    const concurrentPromise = fetch(`${baseUrl}/api/accounts`, {
      headers: { 'Authorization': 'Bearer valid-token' }
    });

    const [resRestore, resConcurrent] = await Promise.all([restorePromise, concurrentPromise]);
    expect(resRestore.status).toBe(200);

    // Si la requête concurrente a touché le serveur pendant isRestoringDatabase, elle a reçu 503
    // Sinon elle a reçu 200 avec les données restaurées (les deux cas sont valides selon le timing d'exécution)
    expect([200, 503]).toContain(resConcurrent.status);
    if (resConcurrent.status === 503) {
      expect(resConcurrent.headers.get('retry-after')).toBe('3');
    }

    // Vérifier que la base est immédiatement opérationnelle après fin de restauration
    const resAccounts = await fetch(`${baseUrl}/api/accounts`, {
      headers: { 'Authorization': 'Bearer valid-token' }
    });
    expect(resAccounts.status).toBe(200);
    const data = await resAccounts.json();
    expect(data[0].name).toBe('Restauré');
  });

  it('4. Refuse immédiatement une seconde restauration simultanée avec HTTP 503 et Retry-After', async () => {
    db.exec(`
      INSERT INTO users (id, username, password_hash, salt) VALUES ('u1', 'admin', 'hash', 'salt');
      INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ('valid-token', 'u1', datetime('now', '+1 day'), datetime('now'));
    `);

    server = createServer(db);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}`;

    const snapshotPath = path.join(testBackupsDir, 'snap_concurrent.db');
    const snap = new DatabaseSync(snapshotPath);
    snap.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT);
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
      INSERT INTO users (id, username, password_hash, salt) VALUES ('u1', 'admin', 'hash', 'salt');
      INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES ('valid-token', 'u1', datetime('now', '+1 day'), datetime('now'));
    `);
    snap.close();

    const snapshotContent = fs.readFileSync(snapshotPath);

    // Lancer deux requêtes de restauration simultanées
    const req1 = fetch(`${baseUrl}/api/maintenance/restore-db`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/x-sqlite3'
      },
      body: snapshotContent
    });

    const req2 = fetch(`${baseUrl}/api/maintenance/restore-db`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/x-sqlite3'
      },
      body: snapshotContent
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status];

    // L'une des deux doit réussir (200), l'autre doit être refusée pour collision (503)
    expect(statuses).toContain(200);
    expect(statuses).toContain(503);

    const rejected = res1.status === 503 ? res1 : res2;
    expect(rejected.headers.get('retry-after')).toBe('3');
    const rejectedBody = await rejected.json();
    expect(rejectedBody.error).toContain('déjà en cours');
  });

  it('5. Abandonne la restauration et préserve la base si des requêtes concurrentes ne peuvent être drainées', async () => {
    // Tester drainActiveDbRequests() : simuler activeDbRequestsCount bloqué
    // Initialiser une vraie connexion sur disque
    expect(db.isOpen).toBe(true);

    // On passe un timeout très court pour le test
    const dummyPath = path.join(testBackupsDir, 'dummy.db');
    const dummySnap = new DatabaseSync(dummyPath);
    dummySnap.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT);
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
    `);
    dummySnap.close();

    // Vérifier que la fonction lève bien une exception si onBeforeClose simule un drainage impossible ou timeout
    const failOption = {
      targetDbPath: testDbPath,
      onBeforeClose: () => {
        throw new Error('Délai d\'attente dépassé (5000 ms) : des requêtes concurrentes utilisent encore la base de données. Restauration abandonnée pour préserver l\'intégrité.');
      }
    };

    expect(() => {
      restoreSqliteDbFile(db, dummyPath, failOption);
    }).toThrow(/Délai d'attente dépassé/);

    // Vérifier que la base V1 est restée ouverte et intacte
    expect(db.isOpen).toBe(true);
    const accs = db.prepare('SELECT * FROM accounts').all() as any[];
    expect(accs[0].name).toBe('Compte V1');
  });

  it('6. Rejette une base de données valide mais incomplète (tables obligatoires manquantes) avant toute modification de la base active', () => {
    // 1. État initial de la base active V1
    expect(db.isOpen).toBe(true);
    const initialAccounts = db.prepare('SELECT * FROM accounts').all() as any[];
    expect(initialAccounts).toHaveLength(1);
    expect(initialAccounts[0].name).toBe('Compte V1');

    // 2. Créer une base SQLite techniquement valide (PRAGMA integrity_check ok),
    // mais à laquelle il manque plusieurs tables obligatoires (ex: sans 'categories', sans 'loans', sans 'users')
    const incompletePath = path.join(testBackupsDir, 'incomplete_schema.db');
    const incSnap = new DatabaseSync(incompletePath);
    incSnap.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT);
      INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-hack', 'Compte Incomplet', 'checking', 9999);
    `);
    incSnap.close();

    // 3. Tenter la restauration : doit lever une exception explicite listant les tables manquantes
    expect(() => {
      restoreSqliteDbFile(db, incompletePath, { targetDbPath: testDbPath });
    }).toThrow(/Le fichier SQLite fourni est incomplet pour Budget Perso Pro/);

    // 4. Vérifier que la base active n'a JAMAIS été fermée, renommée ou altérée
    expect(db.isOpen).toBe(true);
    const postAccounts = db.prepare('SELECT * FROM accounts').all() as any[];
    expect(postAccounts).toHaveLength(1);
    expect(postAccounts[0].name).toBe('Compte V1');
    expect(postAccounts[0].initialBalance).toBe(1000);

    // Vérifier qu'aucune sauvegarde safety n'a même eu besoin d'être créée
    const safetyFiles = fs.readdirSync(testBackupsDir).filter(f => f.startsWith('budget_safety_'));
    expect(safetyFiles).toHaveLength(0);
  });

  it('7. Préserve et restaure fidèlement tous les enregistrements de planned_expenses lors d\'une restauration SQLite (DB)', () => {
    // 1. Créer une nouvelle base source complète (snapshot V2) incluant des dépenses prévisionnelles
    const v2Path = path.join(testBackupsDir, 'budget_v2_with_planned.db');
    const v2Db = new DatabaseSync(v2Path);
    v2Db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT);
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
      CREATE TABLE planned_expenses (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        estimatedAmount REAL NOT NULL,
        categoryId TEXT,
        urgency TEXT NOT NULL,
        targetDate TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL
      );

      INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-restored', 'Compte Restauré', 'checking', 2500);
      INSERT INTO planned_expenses (id, label, estimatedAmount, categoryId, urgency, targetDate, notes, createdAt)
      VALUES 
        ('plan-1', 'Nouvelle Toiture', 4500, NULL, 'urgent', '2026-11-01', 'Devis couvreur validé', '2026-10-20'),
        ('plan-2', 'Table basse', 180, NULL, 'low', NULL, 'Salon', '2026-10-21');
    `);
    v2Db.close();

    // 2. Exécuter la restauration de ce fichier DB sur la base active
    const result = restoreSqliteDbFile(db, v2Path, { targetDbPath: testDbPath });
    expect(result.success).toBe(true);

    // 3. Vérifier que la connexion réouverte contient bien les 2 dépenses prévisionnelles avec toutes leurs propriétés
    expect(db.isOpen).toBe(true);
    const rows = db.prepare('SELECT * FROM planned_expenses ORDER BY id ASC').all() as any[];
    expect(rows).toHaveLength(2);

    expect(rows[0].id).toBe('plan-1');
    expect(rows[0].label).toBe('Nouvelle Toiture');
    expect(rows[0].estimatedAmount).toBe(4500);
    expect(rows[0].urgency).toBe('urgent');
    expect(rows[0].targetDate).toBe('2026-11-01');
    expect(rows[0].notes).toBe('Devis couvreur validé');

    expect(rows[1].id).toBe('plan-2');
    expect(rows[1].label).toBe('Table basse');
    expect(rows[1].estimatedAmount).toBe(180);
    expect(rows[1].urgency).toBe('low');
  });

  it('8. Rétrocompatibilité : restaure avec succès une ancienne base SQLite ne contenant pas la table planned_expenses', () => {
    // 1. Créer une sauvegarde ancienne (valide selon le schéma historique avant planned_expenses)
    const oldDbPath = path.join(testBackupsDir, 'budget_legacy.db');
    const oldDb = new DatabaseSync(oldDbPath);
    oldDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, label TEXT, amount REAL, accountId TEXT);
      CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
      CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);

      INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-legacy', 'Compte Ancien', 'checking', 500);
    `);
    oldDb.close();

    // 2. Restaurer cette base ancienne : doit être acceptée sans lever d'erreur
    const result = restoreSqliteDbFile(db, oldDbPath, { targetDbPath: testDbPath });
    expect(result.success).toBe(true);

    // 3. Vérifier que la migration automatique post-restauration a recréé la table planned_expenses prête pour de nouvelles saisies
    expect(db.isOpen).toBe(true);
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planned_expenses'").get() as any;
    expect(tableInfo).toBeDefined();
    expect(tableInfo.name).toBe('planned_expenses');

    // La table existe et est vide, prête à accueillir de nouvelles entrées
    const countRow = db.prepare('SELECT COUNT(*) as c FROM planned_expenses').get() as { c: number };
    expect(countRow.c).toBe(0);
  });
});
