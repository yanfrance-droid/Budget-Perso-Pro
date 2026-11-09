import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';

import { initDatabase, runMigrations } from './db.ts';
import { saveAccount } from './services/accountService.ts';
import { saveCategory } from './services/categoryService.ts';
import { 
  saveTransaction, 
  deleteTransaction, 
  getTransactions, 
  restoreTransaction 
} from './services/transactionService.ts';
import { 
  saveRecurrenceTemplate, 
  getAllRecurrenceTemplates, 
  generateMonthlyOccurrences 
} from './services/recurrenceService.ts';
import { 
  exportBackupData, 
  importBackupData 
} from './services/migrationService.ts';
import { 
  restoreSqliteDbFile, 
  getMaintenanceStatus 
} from './services/maintenanceService.ts';
import { 
  generateFullExportExcelWorkbook 
} from './services/excelExportService.ts';

describe('Crash-Test de validation finale v1.3.0 (Sauvegarde SQLite, Export/Import JSON et Génération Excel)', () => {
  let db: DatabaseSync;
  let accountId: string;
  let categoryId: string;

  beforeEach(() => {
    db = initDatabase(':memory:');
    const acc = saveAccount(db, {
      id: 'acc-crash-1',
      name: 'Compte Principal Test',
      type: 'checking',
      initialBalance: 2500,
      referenceDate: '2026-01-01'
    });
    accountId = acc.id!;

    const cat = saveCategory(db, {
      id: 'cat-crash-1',
      name: 'Services & Abonnements',
      type: 'fixed_expense'
    });
    categoryId = cat.id!;
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  describe('1. Test de la chaîne Sauvegarde / Restauration SQLite & JSON', () => {
    it('exporte et réimporte en JSON avec conservation exacte au bit près des 4 nouvelles colonnes v1.3.0', () => {
      // 1. Transaction active standard
      const txActive = saveTransaction(db, {
        id: 'tx-crash-active',
        date: '2026-10-10',
        type: 'fixed_expense',
        amount: 29.99,
        status: 'cleared',
        accountId,
        categoryId,
        label: 'Abonnement Cloud Actif'
      });
      expect(txActive.deleted_at).toBeNull();

      // 2. Transaction soft-delete avec timestamp précis
      const txSoft = saveTransaction(db, {
        id: 'tx-crash-soft',
        date: '2026-10-15',
        type: 'variable_expense',
        amount: 149.50,
        status: 'cleared',
        accountId,
        categoryId,
        label: 'Dépense Supprimée en Soft-Delete'
      });
      // Soft-delete
      deleteTransaction(db, txSoft.id);
      const softDeletedRaw = (db.prepare('SELECT * FROM transactions WHERE id = ?').get(txSoft.id)) as any;
      expect(softDeletedRaw.deleted_at).toBeTypeOf('number');
      expect(softDeletedRaw.deleted_at).toBeGreaterThan(0);
      const expectedDeletedAt = softDeletedRaw.deleted_at;

      // 3. Contrat récurrent avec engagements et préavis
      const tmpl = saveRecurrenceTemplate(db, {
        id: 'tmpl-crash-contract',
        type: 'fixed_expense',
        amount: 19.99,
        recurrenceDay: 8,
        accountId,
        categoryId,
        label: 'Forfait Mobile Promo 1 an',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-12-31',
        price_after_promo: 34.99,
        notice_period_days: 45
      });
      expect(tmpl.commitment_end_date).toBe('2026-12-31');
      expect(tmpl.price_after_promo).toBe(34.99);
      expect(tmpl.notice_period_days).toBe(45);

      // 4. Export JSON complet
      const backup = exportBackupData(db);
      expect(backup.tables.transactions).toBeDefined();
      expect(backup.tables.recurrenceTemplates).toBeDefined();

      const exportedActive = backup.tables.transactions?.find((t: any) => t.id === 'tx-crash-active');
      const exportedSoft = backup.tables.transactions?.find((t: any) => t.id === 'tx-crash-soft');
      const exportedTmpl = backup.tables.recurrenceTemplates?.find((t: any) => t.id === 'tmpl-crash-contract');

      expect(exportedActive?.deleted_at).toBeNull();
      expect(exportedSoft?.deleted_at).toBe(expectedDeletedAt);
      expect(exportedTmpl?.commitment_end_date).toBe('2026-12-31');
      expect(exportedTmpl?.price_after_promo).toBe(34.99);
      expect(exportedTmpl?.notice_period_days).toBe(45);

      // 5. Réimportation sur une base complètement neuve
      const freshDb = initDatabase(':memory:');
      const importResult = importBackupData(freshDb, backup, { skipSafetyBackup: true });
      expect(importResult.success).toBe(true);

      // 6. Vérification exhaustive post-import
      const restoredActive = (freshDb.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-crash-active')) as any;
      const restoredSoft = (freshDb.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-crash-soft')) as any;
      const restoredTmpl = (freshDb.prepare('SELECT * FROM recurrence_templates WHERE id = ?').get('tmpl-crash-contract')) as any;

      // Colonne 1 : transactions.deleted_at (null)
      expect(restoredActive.deleted_at).toBeNull();
      // Colonne 1 : transactions.deleted_at (valeur numérique identique)
      expect(restoredSoft.deleted_at).toBe(expectedDeletedAt);

      // Colonne 2 : recurrence_templates.commitment_end_date
      expect(restoredTmpl.commitment_end_date).toBe('2026-12-31');
      // Colonne 3 : recurrence_templates.price_after_promo
      expect(restoredTmpl.price_after_promo).toBe(34.99);
      // Colonne 4 : recurrence_templates.notice_period_days
      expect(restoredTmpl.notice_period_days).toBe(45);

      // Vérifier que getTransactions sans option exclut bien la ligne supprimée
      const activeList = getTransactions(freshDb);
      expect(activeList.some(t => t.id === 'tx-crash-active')).toBe(true);
      expect(activeList.some(t => t.id === 'tx-crash-soft')).toBe(false);

      // Vérifier que restoreTransaction restaure proprement
      restoreTransaction(freshDb, 'tx-crash-soft');
      const afterRestoreList = getTransactions(freshDb);
      expect(afterRestoreList.some(t => t.id === 'tx-crash-soft')).toBe(true);

      freshDb.close();
    });

    it('simule la restauration physique d une base v1.2.2 via restoreSqliteDbFile et applique automatiquement runMigrations avec intégrité SQLite 100% OK', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-crash-test-'));
      const legacyV122Path = path.join(tempDir, 'legacy_v122.db');
      const targetAppPath = path.join(tempDir, 'running_app.db');

      try {
        // A. Créer une base SQLite physique purement v1.2.2 (SANS les colonnes v1.3.0)
        const legacyDb = new DatabaseSync(legacyV122Path);
        legacyDb.exec(`
          PRAGMA foreign_keys = ON;
          CREATE TABLE users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            salt TEXT NOT NULL,
            is_locked INTEGER NOT NULL DEFAULT 0,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_active_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
          CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            initialBalance REAL NOT NULL DEFAULT 0,
            isClosed INTEGER NOT NULL DEFAULT 0,
            referenceDate TEXT,
            color TEXT,
            creditLimit REAL,
            icon TEXT,
            notes TEXT,
            position INTEGER,
            bank TEXT
          );
          CREATE TABLE categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            isCustom INTEGER NOT NULL DEFAULT 0,
            budgetCap REAL,
            isHidden INTEGER NOT NULL DEFAULT 0
          );
          -- Structure v1.2.2 SANS deleted_at
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
            label TEXT NOT NULL,
            notes TEXT,
            paymentMethod TEXT,
            checkNumber TEXT,
            amortizedCapital REAL,
            templateId TEXT,
            isCustomized INTEGER NOT NULL DEFAULT 0,
            isReconstituted INTEGER NOT NULL DEFAULT 0,
            payerId TEXT,
            FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
          );
          CREATE TABLE loans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            initialCapital REAL NOT NULL,
            remainingCapital REAL NOT NULL,
            interestRate REAL NOT NULL,
            insuranceRate REAL NOT NULL,
            durationMonths INTEGER NOT NULL,
            monthlyPayment REAL NOT NULL,
            startDate TEXT NOT NULL,
            endDate TEXT NOT NULL,
            lender TEXT,
            insuranceMonthly REAL,
            totalCost REAL,
            categoryId TEXT,
            accountId TEXT NOT NULL DEFAULT 'acc-prod',
            notes TEXT,
            isPaused INTEGER NOT NULL DEFAULT 0,
            isArchived INTEGER NOT NULL DEFAULT 0
          );
          -- Structure v1.2.2 SANS commitment_end_date, price_after_promo, notice_period_days
          CREATE TABLE recurrence_templates (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            recurrenceDay INTEGER NOT NULL,
            accountId TEXT NOT NULL,
            categoryId TEXT,
            destinationAccountId TEXT,
            label TEXT,
            notes TEXT,
            paymentMethod TEXT,
            startDate TEXT NOT NULL,
            endDate TEXT,
            isActive INTEGER NOT NULL DEFAULT 1,
            customAmounts TEXT,
            payerId TEXT,
            FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE,
            FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE SET NULL
          );
          CREATE TABLE app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );

          -- Insertion de données représentatives d'une installation v1.2.2 en production
          INSERT INTO accounts (id, name, type, initialBalance) VALUES ('acc-prod', 'Compte Courant BNP', 'checking', 3500);
          INSERT INTO categories (id, name, type) VALUES ('cat-loyer', 'Loyer Appartement', 'fixed_expense');
          INSERT INTO transactions (id, date, type, amount, status, accountId, categoryId, label)
          VALUES ('tx-legacy-1', '2026-09-05', 'fixed_expense', 850, 'cleared', 'acc-prod', 'cat-loyer', 'Loyer Septembre');
          INSERT INTO recurrence_templates (id, type, amount, recurrenceDay, accountId, categoryId, label, startDate)
          VALUES ('rec-legacy-1', 'fixed_expense', 850, 5, 'acc-prod', 'cat-loyer', 'Loyer Récurrent', '2026-01');
        `);

        // S'assurer que les colonnes v1.3.0 ne sont PAS présentes dans le fichier source
        const txColsOld = legacyDb.prepare("PRAGMA table_info(transactions)").all() as any[];
        expect(txColsOld.some(c => c.name === 'deleted_at')).toBe(false);

        const recColsOld = legacyDb.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
        expect(recColsOld.some(c => c.name === 'commitment_end_date')).toBe(false);
        expect(recColsOld.some(c => c.name === 'price_after_promo')).toBe(false);
        expect(recColsOld.some(c => c.name === 'notice_period_days')).toBe(false);

        legacyDb.close();

        // B. Initialiser l'application cible sur fichier physique
        const targetDb = initDatabase(targetAppPath);

        // C. Déclencher la restauration physique via restoreSqliteDbFile
        const restoreRes = restoreSqliteDbFile(targetDb, legacyV122Path, {
          targetDbPath: targetAppPath
        });
        expect(restoreRes.success).toBe(true);
        expect(fs.existsSync(restoreRes.safetyBackupPath)).toBe(true);

        // D. Vérifications de conformité et intégrité SQLite après restauration
        // 1. PRAGMA integrity_check
        const integrityRows = targetDb.prepare('PRAGMA integrity_check;').all() as any[];
        expect(integrityRows).toHaveLength(1);
        expect(integrityRows[0].integrity_check).toBe('ok');

        // 2. PRAGMA foreign_key_check
        const fkCheckRows = targetDb.prepare('PRAGMA foreign_key_check;').all() as any[];
        expect(fkCheckRows).toHaveLength(0);

        // 3. Présence confirmée des 4 colonnes v1.3.0 ajoutées par runMigrations
        const txColsNew = targetDb.prepare("PRAGMA table_info(transactions)").all() as any[];
        expect(txColsNew.some(c => c.name === 'deleted_at')).toBe(true);

        const recColsNew = targetDb.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
        expect(recColsNew.some(c => c.name === 'commitment_end_date')).toBe(true);
        expect(recColsNew.some(c => c.name === 'price_after_promo')).toBe(true);
        expect(recColsNew.some(c => c.name === 'notice_period_days')).toBe(true);

        // 4. Index partiel idx_transactions_active présent
        const indexRows = targetDb.prepare("PRAGMA index_list('transactions')").all() as any[];
        expect(indexRows.some(idx => idx.name === 'idx_transactions_active')).toBe(true);

        // 5. Intégrité des données métier héritées de la v1.2.2
        const restoredTx = targetDb.prepare("SELECT * FROM transactions WHERE id = 'tx-legacy-1'").get() as any;
        expect(restoredTx).toBeDefined();
        expect(restoredTx.amount).toBe(850);
        expect(restoredTx.deleted_at).toBeNull();

        const restoredRec = targetDb.prepare("SELECT * FROM recurrence_templates WHERE id = 'rec-legacy-1'").get() as any;
        expect(restoredRec).toBeDefined();
        expect(restoredRec.amount).toBe(850);
        expect(restoredRec.commitment_end_date).toBeNull();
        expect(restoredRec.price_after_promo).toBeNull();
        expect(restoredRec.notice_period_days).toBe(30); // Default 30 appliqué par la migration

        // 6. getMaintenanceStatus rapporte une base saine
        const maintStatus = getMaintenanceStatus(targetDb);
        expect(maintStatus.integrity).toBe('ok');

        targetDb.close();
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });

  describe('2. Test du Générateur Excel (excelExportService.ts)', () => {
    it('génère un classeur Excel complet excluant rigoureusement le soft-delete et intégrant la bascule post-promo et le donut', async () => {
      // 1. Création d'un jeu de données riche
      // Transaction normale active
      saveTransaction(db, {
        id: 'tx-excel-active-1',
        date: '2026-10-12',
        type: 'fixed_expense',
        amount: 80,
        status: 'cleared',
        accountId,
        categoryId,
        label: 'Assurance Habitation'
      });

      // Transaction en soft-delete avec montant élevé (ex: 9999 €)
      const txSoftDelete = saveTransaction(db, {
        id: 'tx-excel-deleted',
        date: '2026-10-18',
        type: 'fixed_expense',
        amount: 9999,
        status: 'cleared',
        accountId,
        categoryId,
        label: 'Erreur Facturation Supprimee'
      });
      deleteTransaction(db, txSoftDelete.id); // deleted_at != null

      // Contrat récurrent avec bascule post-promo au 2026-10-31
      saveRecurrenceTemplate(db, {
        id: 'tmpl-excel-box',
        type: 'fixed_expense',
        amount: 25, // Promo
        recurrenceDay: 5,
        accountId,
        categoryId,
        label: 'Abonnement Fibre Optique',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-10-31',
        price_after_promo: 55, // Post-promo
        notice_period_days: 30
      });

      // Génération des échéances
      generateMonthlyOccurrences(db, '2026-10'); // Octobre (promo 25 €)
      generateMonthlyOccurrences(db, '2026-11'); // Novembre (post-promo 55 €)

      // 2. Génération du classeur Excel en mémoire
      const buffer = await generateFullExportExcelWorkbook(db);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(5000);

      // 3. Chargement et inspection fine avec ExcelJS
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);

      // A. Vérification de l'exclusion stricte de la transaction en soft-delete
      let softDeleteFoundInAnyCell = false;
      let totalSoftDeleteAmountFound = false;

      workbook.eachSheet((ws) => {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            const strVal = String(cell.value || '');
            if (strVal.includes('Erreur Facturation Supprimee') || strVal.includes('tx-excel-deleted')) {
              softDeleteFoundInAnyCell = true;
            }
            if (typeof cell.value === 'number' && cell.value === 9999) {
              totalSoftDeleteAmountFound = true;
            }
          });
        });
      });

      expect(softDeleteFoundInAnyCell).toBe(false);
      expect(totalSoftDeleteAmountFound).toBe(false);

      // B. Vérification de la feuille "Charges fixes"
      const wsFixed = workbook.getWorksheet('Charges fixes');
      expect(wsFixed).toBeDefined();

      const fixedRows: { date: any; label: any; amount: any; status: any }[] = [];
      wsFixed!.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip headers
          fixedRows.push({
            date: row.getCell(1).value,
            status: row.getCell(3).value,
            label: row.getCell(4).value,
            amount: row.getCell(5).value
          });
        }
      });

      // Vérifier la présence de l'occurrence promo d'octobre (25 €)
      const octOccurrence = fixedRows.find(r => r.label === 'Abonnement Fibre Optique' && String(r.date).startsWith('2026-10'));
      expect(octOccurrence).toBeDefined();
      expect(octOccurrence?.amount).toBe(25);

      // Vérifier la présence de l'occurrence post-promo de novembre (55 €)
      const novOccurrence = fixedRows.find(r => r.label === 'Abonnement Fibre Optique' && String(r.date).startsWith('2026-11'));
      expect(novOccurrence).toBeDefined();
      expect(novOccurrence?.amount).toBe(55);

      // Vérifier que la transaction active d'assurance (80 €) est bien présente
      const assuranceRow = fixedRows.find(r => r.label === 'Assurance Habitation');
      expect(assuranceRow).toBeDefined();
      expect(assuranceRow?.amount).toBe(80);

      // C. Vérification de l'onglet Tableau de bord et du Donut Chart
      const wsDash = workbook.getWorksheet('Tableau de bord');
      expect(wsDash).toBeDefined();

      // Vérifier l'insertion de l'image du Donut
      const images = wsDash!.getImages();
      expect(images.length).toBeGreaterThanOrEqual(1);

      const chartImageId = images[0].imageId;
      const chartMedia = workbook.model.media?.find((m: any) => m.index === chartImageId || (m as any).name === chartImageId);
      expect(chartMedia).toBeDefined();
      expect((chartMedia as any).buffer).toBeInstanceOf(Buffer);
      // Signature PNG valide : 89 50 4E 47
      const pngHeader = (chartMedia as any).buffer.subarray(0, 4);
      expect(pngHeader[0]).toBe(0x89);
      expect(pngHeader[1]).toBe(0x50);
      expect(pngHeader[2]).toBe(0x4E);
      expect(pngHeader[3]).toBe(0x47);

      // D. Vérification de l'absence de valeurs aberrantes (NaN / undefined) dans le tableau récapitulatif
      let foundNanInDashboard = false;
      wsDash!.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string' && (cell.value.includes('NaN') || cell.value.includes('undefined'))) {
            foundNanInDashboard = true;
          }
        });
      });
      expect(foundNanInDashboard).toBe(false);
    });
  });
});
