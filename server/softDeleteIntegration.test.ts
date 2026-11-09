import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, runMigrations } from './db.ts';
import { createServer } from './app.ts';
import { apiClient } from '../src/services/apiClient.ts';
import {
  saveTransaction,
  deleteTransaction,
  restoreTransaction,
  getTransactions,
  getTransactionById
} from './services/transactionService.ts';
import { saveAccount } from './services/accountService.ts';
import { saveLoan, getLoanById } from './services/loanService.ts';
import { saveRecurrenceTemplate, generateMonthlyOccurrences } from './services/recurrenceService.ts';
import {
  purgeExpiredDeletedTransactions,
  restoreSqliteDbFile,
  getMaintenanceStatus
} from './services/maintenanceService.ts';

describe('Lot 1 : Unification des Migrations & Système Soft-Delete / Undo', () => {
  let db: DatabaseSync;
  let server: http.Server;
  let baseUrl: string;
  let accountId: string;

  beforeEach(async () => {
    db = initDatabase(':memory:');
    server = createServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        apiClient.setBaseUrl(baseUrl);
        apiClient.setToken(null);
        resolve();
      });
    });

    // Authentification
    const auth = await apiClient.auth.setup('admin_test', 'MonSuperPass123!');
    apiClient.setToken(auth.token);

    // Compte de test
    const acc = saveAccount(db, { name: 'Compte Principal', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });
    accountId = acc.id!;
  });

  afterEach(async () => {
    apiClient.setToken(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  describe('1. Soft-Delete (masquage et intégrité)', () => {
    it('masque les transactions supprimées de getTransactions par défaut tout en conservant les données en base', () => {
      const tx = saveTransaction(db, {
        label: 'Achat Courses',
        amount: 45.5,
        type: 'variable_expense',
        status: 'cleared',
        date: '2026-11-05',
        accountId
      });

      // 1. Transaction visible avant suppression
      const activeBefore = getTransactions(db);
      expect(activeBefore.some(t => t.id === tx.id)).toBe(true);

      // 2. Soft-delete
      deleteTransaction(db, tx.id!);

      // 3. Masquée par défaut dans getTransactions
      const activeAfter = getTransactions(db);
      expect(activeAfter.some(t => t.id === tx.id)).toBe(false);

      // 4. Présente dans SQLite avec deleted_at horodaté
      const row = db.prepare('SELECT id, deleted_at FROM transactions WHERE id = ?').get(tx.id!) as any;
      expect(row).toBeDefined();
      expect(row.deleted_at).toBeTypeOf('number');
      expect(row.deleted_at).toBeGreaterThan(0);

      // 5. Accessible via getTransactions avec { includeDeleted: true }
      const allWithDeleted = getTransactions(db, { includeDeleted: true });
      const foundDeleted = allWithDeleted.find(t => t.id === tx.id);
      expect(foundDeleted).toBeDefined();
      expect(foundDeleted?.deleted_at).toBe(row.deleted_at);

      // 6. Accessible individuellement via getTransactionById pour restauration
      const singleTx = getTransactionById(db, tx.id!);
      expect(singleTx).toBeDefined();
      expect(singleTx?.deleted_at).toBe(row.deleted_at);
    });

    it('ignore les appels répétés de deleteTransaction si la transaction est déjà soft-deleted', () => {
      const tx = saveTransaction(db, {
        label: 'Facture Gaz',
        amount: 80,
        type: 'fixed_expense',
        status: 'planned',
        date: '2026-11-10',
        accountId
      });

      deleteTransaction(db, tx.id!);
      const firstRow = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get(tx.id!) as any;

      // Deuxième appel
      deleteTransaction(db, tx.id!);
      const secondRow = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get(tx.id!) as any;
      expect(secondRow.deleted_at).toBe(firstRow.deleted_at);
    });
  });

  describe('2. Restauration / Undo via Service et API HTTP', () => {
    it('restaure une transaction avec restoreTransaction (deleted_at redevient null)', () => {
      const tx = saveTransaction(db, {
        label: 'Pharmacie',
        amount: 25,
        type: 'variable_expense',
        status: 'cleared',
        date: '2026-11-06',
        accountId
      });

      deleteTransaction(db, tx.id!);
      expect(getTransactions(db).some(t => t.id === tx.id)).toBe(false);

      // Restauration
      const restored = restoreTransaction(db, tx.id!);
      expect(restored.deleted_at).toBeNull();

      // Transaction réapparaît immédiatement
      const activeAfterRestore = getTransactions(db);
      expect(activeAfterRestore.some(t => t.id === tx.id)).toBe(true);

      const dbRow = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get(tx.id!) as any;
      expect(dbRow.deleted_at).toBeNull();
    });

    it('expose la route HTTP POST /api/transactions/:id/restore et supporte includeDeleted sur GET', async () => {
      // 1. Création via API
      const tx = await apiClient.transactions.save({
        label: 'Abonnement Cloud',
        amount: 9.99,
        type: 'fixed_expense',
        status: 'cleared',
        date: '2026-11-01',
        accountId
      });

      // 2. Suppression via API
      await apiClient.transactions.delete(tx.id!);

      // 3. Vérification GET sans includeDeleted
      const resActive = await apiClient.transactions.get();
      expect(resActive.some(t => t.id === tx.id)).toBe(false);

      // 4. Vérification GET avec includeDeleted
      const resAll = await apiClient.transactions.get({ includeDeleted: true });
      expect(resAll.some(t => t.id === tx.id)).toBe(true);

      // 5. Restauration via route POST /api/transactions/:id/restore
      const restoreRes = await apiClient.transactions.restore(tx.id!);
      expect(restoreRes.success).toBe(true);
      expect(restoreRes.transaction.id).toBe(tx.id);
      expect(restoreRes.transaction.deleted_at).toBeNull();

      // 6. Vérification GET normale : l'opération est réapparue
      const resAfterRestore = await apiClient.transactions.get();
      expect(resAfterRestore.some(t => t.id === tx.id)).toBe(true);
    });

    it('la restauration est idempotente si la transaction est déjà active', () => {
      const tx = saveTransaction(db, {
        label: 'Café',
        amount: 3.5,
        type: 'daily',
        status: 'cleared',
        date: '2026-11-07',
        accountId
      });

      const res = restoreTransaction(db, tx.id!);
      expect(res.id).toBe(tx.id);
      expect(res.deleted_at).toBeNull();
    });

    it('restaure proprement une transaction via POST /api/transactions/:id/restore avec payload de secours si elle a été purgée physiquement', async () => {
      const tx = await apiClient.transactions.save({
        label: 'Abonnement Purge Test',
        amount: 45.0,
        type: 'fixed_expense',
        status: 'planned',
        date: '2026-11-05',
        accountId
      });

      // Simulation d'une purge physique (DELETE réel)
      db.prepare('DELETE FROM transactions WHERE id = ?').run(tx.id!);
      expect(getTransactionById(db, tx.id!)).toBeNull();

      // Restauration via route POST /api/transactions/:id/restore avec fallbackData
      const restoreRes = await apiClient.transactions.restore(tx.id!, tx);
      expect(restoreRes.success).toBe(true);
      expect(restoreRes.transaction.id).toBe(tx.id);
      expect(restoreRes.transaction.amount).toBe(45.0);
      expect(restoreRes.transaction.label).toBe('Abonnement Purge Test');

      const inDb = getTransactionById(db, tx.id!);
      expect(inDb).not.toBeNull();
      expect(inDb?.deleted_at).toBeNull();
    });
  });

  describe('3. Anti-Zombie sur les Récurrences mensuelles', () => {
    it('une échéance supprimée en soft-delete ne ressuscite JAMAIS lors des générations successives', () => {
      const tmpl = saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 750,
        recurrenceDay: 5,
        accountId,
        startDate: '2026-01',
        isActive: true
      });

      // 1. Première génération pour 2026-11
      const count1 = generateMonthlyOccurrences(db, '2026-11');
      expect(count1).toBe(1);

      const txsMonth = getTransactions(db, { month: '2026-11' });
      expect(txsMonth).toHaveLength(1);
      const generatedTxId = txsMonth[0].id!;

      // 2. L'utilisateur supprime l'échéance générée (Soft-Delete)
      deleteTransaction(db, generatedTxId);
      expect(getTransactions(db, { month: '2026-11' })).toHaveLength(0);

      // 3. Nouvelle exécution de la routine de génération automatique
      const count2 = generateMonthlyOccurrences(db, '2026-11');
      expect(count2).toBe(0); // 0 nouvelle création

      // 4. Vérification Anti-Zombie : l'opération ne doit PAS réapparaître
      const txsAfterSecondGen = getTransactions(db, { month: '2026-11' });
      expect(txsAfterSecondGen).toHaveLength(0);

      // 5. En base SQLite, il n'y a toujours qu'une seule ligne (la version supprimée)
      const allRows = db.prepare('SELECT id, deleted_at FROM transactions WHERE templateId = ? AND date LIKE ?').all(tmpl.id, '2026-11%') as any[];
      expect(allRows).toHaveLength(1);
      expect(allRows[0].id).toBe(generatedTxId);
      expect(allRows[0].deleted_at).toBeTypeOf('number');
    });
  });

  describe('4. Synchronisation Crédits (Capital restant dû)', () => {
    it('restaure le capital lors du soft-delete et le redéduit lors du restore au centime près', () => {
      // 1. Création d'un prêt avec 10 000 € de capital restant dû
      const loan = saveLoan(db, {
        name: 'Prêt Personnel Auto',
        lender: 'Banque Populaire',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 250,
        interestRate: 0,
        insurancePart: 0,
        startDate: '2026-01-01',
        durationMonths: 40,
        accountId
      });

      // 2. Enregistrement d'une mensualité réglée (status: 'cleared') avec 200 € d'amortissement
      const paymentTx = saveTransaction(db, {
        label: 'Mensualité 1',
        amount: 250,
        type: 'loan_payment',
        status: 'cleared',
        date: '2026-11-05',
        accountId,
        linkedId: loan.id,
        amortizedCapital: 200
      });

      // Le capital restant a diminué de 200 € -> 9 800 €
      const loanAfterPayment = getLoanById(db, loan.id!)!;
      expect(loanAfterPayment.remainingCapital).toBe(9800);

      // 3. Soft-Delete de la mensualité
      deleteTransaction(db, paymentTx.id!);

      // Le capital restant dû doit être restitué -> 10 000 €
      const loanAfterDelete = getLoanById(db, loan.id!)!;
      expect(loanAfterDelete.remainingCapital).toBe(10000);

      // 4. Restauration de la mensualité (Undo)
      restoreTransaction(db, paymentTx.id!);

      // Le capital restant dû doit être à nouveau déduit -> 9 800 €
      const loanAfterRestore = getLoanById(db, loan.id!)!;
      expect(loanAfterRestore.remainingCapital).toBe(9800);
    });
  });

  describe('5. Unification des Migrations & Sécurité Restauration', () => {
    it('applique les migrations v1.3.0 de manière idempotente sur une base sans colonne deleted_at', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget_mig_test_'));
      const oldDbPath = path.join(tempDir, 'old_v122.db');
      const targetDbPath = path.join(tempDir, 'target.db');

      try {
        // Base v1.2.2 sans deleted_at
        const oldDb = new DatabaseSync(oldDbPath);
        oldDb.exec(`
          CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, initialBalance REAL, isClosed INT DEFAULT 0);
          CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, type TEXT);
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
            isReconstituted INTEGER NOT NULL DEFAULT 0,
            payerId TEXT
          );
          CREATE TABLE loans (id TEXT PRIMARY KEY, name TEXT, lender TEXT, initialAmount REAL, remainingCapital REAL, monthlyPayment REAL, startDate TEXT, durationMonths INT, accountId TEXT);
          CREATE TABLE recurrence_templates (id TEXT PRIMARY KEY, type TEXT, amount REAL, recurrenceDay INT, accountId TEXT);
          CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
          CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT, created_at TEXT);
          CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, salt TEXT);
          INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-old', 'Compte Ancien', 'checking', 500);
          INSERT INTO transactions (id, label, amount, accountId, date, type, status) VALUES ('tx-old', 'Achat Ancien', 30, 'acc-old', '2026-10-01', 'daily', 'cleared');
        `);
        oldDb.close();

        // Base cible active
        const liveDb = initDatabase(targetDbPath);

        // Restauration de l'ancien backup v1.2.2
        const res = restoreSqliteDbFile(liveDb, oldDbPath, { targetDbPath });
        expect(res.success).toBe(true);

        // Vérification que runMigrations a été exécuté à la fin de restoreSqliteDbFile
        const cols = liveDb.prepare("PRAGMA table_info(transactions)").all() as any[];
        const hasDeletedAt = cols.some(c => c.name === 'deleted_at');
        expect(hasDeletedAt).toBe(true);

        // Vérification de l'index partiel
        const indexes = liveDb.prepare("PRAGMA index_list(transactions)").all() as any[];
        const hasActiveIndex = indexes.some(i => i.name === 'idx_transactions_active');
        expect(hasActiveIndex).toBe(true);

        // Opérations normales avec soft-delete
        const txs = getTransactions(liveDb);
        expect(txs).toHaveLength(1);
        expect(txs[0].id).toBe('tx-old');

        deleteTransaction(liveDb, 'tx-old');
        expect(getTransactions(liveDb)).toHaveLength(0);

        if (liveDb && liveDb.isOpen) {
          liveDb.close();
        }
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });

  describe('6. Purge automatique des transactions supprimées depuis plus de 30 jours', () => {
    it('supprime physiquement les transactions > 30 jours et conserve les récentes', () => {
      const now = Date.now();
      const fortyDaysAgo = now - 40 * 86400 * 1000;
      const fiveDaysAgo = now - 5 * 86400 * 1000;

      // 1. Transaction active
      saveTransaction(db, { id: 'tx-active', label: 'Active', amount: 10, type: 'daily', status: 'cleared', date: '2026-11-01', accountId });

      // 2. Transaction soft-deleted il y a 5 jours
      saveTransaction(db, { id: 'tx-recent', label: 'Récente', amount: 20, type: 'daily', status: 'cleared', date: '2026-11-01', accountId });
      db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ?').run(fiveDaysAgo, 'tx-recent');

      // 3. Transaction soft-deleted il y a 40 jours
      saveTransaction(db, { id: 'tx-expired', label: 'Expirée', amount: 30, type: 'daily', status: 'cleared', date: '2026-09-01', accountId });
      db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ?').run(fortyDaysAgo, 'tx-expired');

      // 4. Exécution de la purge (seuil 30 jours)
      const purgedCount = purgeExpiredDeletedTransactions(db, 30);
      expect(purgedCount).toBe(1);

      // tx-expired est supprimée physiquement
      const expiredRow = db.prepare('SELECT id FROM transactions WHERE id = ?').get('tx-expired');
      expect(expiredRow).toBeUndefined();

      // tx-recent est toujours en base avec son soft-delete
      const recentRow = db.prepare('SELECT id, deleted_at FROM transactions WHERE id = ?').get('tx-recent') as any;
      expect(recentRow).toBeDefined();
      expect(recentRow.deleted_at).toBe(fiveDaysAgo);

      // tx-active est intacte
      const activeRow = db.prepare('SELECT id, deleted_at FROM transactions WHERE id = ?').get('tx-active') as any;
      expect(activeRow).toBeDefined();
      expect(activeRow.deleted_at).toBeNull();

      // getMaintenanceStatus compte uniquement les transactions actives
      const status = getMaintenanceStatus(db);
      expect(status.tableCounts.transactions).toBe(1); // tx-active seulement
    });
  });
});
