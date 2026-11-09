import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, runMigrations } from './db.ts';
import {
  saveRecurrenceTemplate,
  getAllRecurrenceTemplates,
  generateMonthlyOccurrences,
  computeEffectiveRecurrenceAmount
} from './services/recurrenceService.ts';
import { saveAccount } from './services/accountService.ts';
import { getTransactions, saveTransaction } from './services/transactionService.ts';
import { exportBackupData, importBackupData } from './services/migrationService.ts';
import { auditCommitmentDeadlines, generateInsights, type InsightsContext } from '../src/engine/insightsEngine.ts';
import { analyzeCharges } from '../src/engine/chargesAnalysisEngine.ts';
import type { RecurrenceTemplate } from '../src/db/database.ts';

describe('Lot 2 : Suivi des Engagements, Bascule Tarifaire Post-Promo & Alertes Préavis', () => {
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

  describe('1. Schéma SQLite, Migrations et Persistance des colonnes d\'engagement', () => {
    it('persiste et restitue fidèlement commitment_end_date, price_after_promo et notice_period_days', () => {
      const created = saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 19.99,
        recurrenceDay: 5,
        accountId,
        label: 'Abonnement Fibre Promo',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-10-31',
        price_after_promo: 39.99,
        notice_period_days: 45
      });

      expect(created.commitment_end_date).toBe('2026-10-31');
      expect(created.price_after_promo).toBe(39.99);
      expect(created.notice_period_days).toBe(45);

      const all = getAllRecurrenceTemplates(db);
      const found = all.find(t => t.id === created.id);
      expect(found).toBeDefined();
      expect(found?.commitment_end_date).toBe('2026-10-31');
      expect(found?.price_after_promo).toBe(39.99);
      expect(found?.notice_period_days).toBe(45);
    });

    it('applique un délai de préavis par défaut de 30 jours si non spécifié', () => {
      const created = saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 9.99,
        recurrenceDay: 10,
        accountId,
        label: 'Forfait Mobile',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-12-31'
      });

      expect(created.notice_period_days).toBe(30);

      const all = getAllRecurrenceTemplates(db);
      const found = all.find(t => t.id === created.id);
      expect(found?.notice_period_days).toBe(30);
    });

    it('les migrations v1.3.0 ajoutent de manière idempotente les 3 colonnes sur une ancienne table recurrence_templates', () => {
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

      // Exécution des migrations centralisées
      runMigrations(oldDb);

      const cols = oldDb.prepare("PRAGMA table_info(recurrence_templates)").all() as any[];
      expect(cols.some(c => c.name === 'commitment_end_date')).toBe(true);
      expect(cols.some(c => c.name === 'price_after_promo')).toBe(true);
      expect(cols.some(c => c.name === 'notice_period_days')).toBe(true);
      oldDb.close();
    });
  });

  describe('2. Bascule Tarifaire Automatique dans le Prévisionnel', () => {
    it('applique le tarif promo avant la fin d\'engagement, puis bascule automatiquement sur price_after_promo après', () => {
      const tmpl = saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 20,
        recurrenceDay: 5,
        accountId,
        label: 'Box Internet Promo 1 an',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-10-31',
        price_after_promo: 45,
        notice_period_days: 30
      });

      // 1. Mois sous promo (Octobre 2026)
      generateMonthlyOccurrences(db, '2026-10');
      const txsOct = getTransactions(db, { month: '2026-10' });
      expect(txsOct).toHaveLength(1);
      expect(txsOct[0].amount).toBe(20);

      // 2. Mois post-promo (Novembre 2026) -> bascule automatique sur price_after_promo (45 €) !
      generateMonthlyOccurrences(db, '2026-11');
      const txsNov = getTransactions(db, { month: '2026-11' });
      expect(txsNov).toHaveLength(1);
      expect(txsNov[0].amount).toBe(45);
    });

    it('supporte le format de date YYYY-MM pour commitment_end_date', () => {
      saveRecurrenceTemplate(db, {
        id: 'tmpl-month-fmt',
        type: 'fixed_expense',
        amount: 15,
        recurrenceDay: 12,
        accountId,
        label: 'Assurance Promo',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-10', // Format mois
        price_after_promo: 25
      });

      generateMonthlyOccurrences(db, '2026-10');
      const txsOct = getTransactions(db, { month: '2026-10' });
      expect(txsOct[0].amount).toBe(15);

      generateMonthlyOccurrences(db, '2026-11');
      const txsNov = getTransactions(db, { month: '2026-11' });
      expect(txsNov[0].amount).toBe(25);
    });

    it('met à jour les occurrences futures non pointées quand on modifie le palier d\'un template', () => {
      const tmpl = saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 30,
        recurrenceDay: 1,
        accountId,
        label: 'Salle de sport',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2026-10-31',
        price_after_promo: 50
      });

      // Génération de novembre (post-promo = 50 €)
      generateMonthlyOccurrences(db, '2026-11');
      const novBefore = getTransactions(db, { month: '2026-11' });
      expect(novBefore[0].amount).toBe(50);

      // Modification du template : tarif post-promo renégocié à 40 €
      saveRecurrenceTemplate(db, {
        id: tmpl.id,
        price_after_promo: 40
      });

      // L'occurrence non pointée de novembre est automatiquement ajustée à 40 € !
      const novAfter = getTransactions(db, { month: '2026-11' });
      expect(novAfter[0].amount).toBe(40);
    });
  });

  describe('3. Sentinelle auditCommitmentDeadlines & insightsEngine', () => {
    it('déclenche une alerte prioritaire dans la fenêtre de préavis avec calcul exact du surcoût annuel', () => {
      // Fin d'engagement : 2026-12-15, Préavis : 30 jours -> Date limite : 2026-11-15
      // Fenêtre critique : [2026-10-31 .. 2026-12-15]
      const templates: RecurrenceTemplate[] = [{
        id: 'tmpl-box',
        type: 'fixed_expense',
        amount: 25,
        recurrenceDay: 5,
        accountId: 'acc-1',
        startDate: '2026-01',
        isActive: true,
        label: 'Abonnement Télécom',
        commitment_end_date: '2026-12-15',
        price_after_promo: 45,
        notice_period_days: 30
      }];

      // Cas A : Date du jour = 2026-11-05 (dans la fenêtre de préavis, 10 jours avant la date limite)
      const insightsWarning = auditCommitmentDeadlines(templates, '2026-11-05');
      expect(insightsWarning).toHaveLength(1);
      expect(insightsWarning[0].severity).toBe('warning');
      expect(insightsWarning[0].title).toContain('Fin d\'engagement proche');
      expect(insightsWarning[0].metadata?.noticeDeadline).toBe('2026-11-15');
      // Surcoût annuel : (45 - 25) * 12 = 240 €
      expect(insightsWarning[0].metadata?.annualIncrease).toBe(240);
      expect(insightsWarning[0].message).toContain('240,00');

      // Cas B : Date du jour = 2026-11-16 (date limite de préavis dépassée) -> sévérité 'critical'
      const insightsCritical = auditCommitmentDeadlines(templates, '2026-11-16');
      expect(insightsCritical).toHaveLength(1);
      expect(insightsCritical[0].severity).toBe('critical');
      expect(insightsCritical[0].title).toContain('Préavis urgent');

      // Cas C : Date du jour = 2026-09-01 (bien avant la fenêtre de préavis) -> aucune alerte
      const insightsNone = auditCommitmentDeadlines(templates, '2026-09-01');
      expect(insightsNone).toHaveLength(0);
    });

    it('s\'intègre dans generateInsights et respecte le tri par sévérité', () => {
      const templates: RecurrenceTemplate[] = [{
        id: 'tmpl-urgent',
        type: 'fixed_expense',
        amount: 20,
        recurrenceDay: 5,
        accountId: 'acc-1',
        startDate: '2026-01',
        isActive: true,
        label: 'Service Streaming',
        commitment_end_date: '2026-11-20',
        price_after_promo: 35,
        notice_period_days: 15 // Limite au 2026-11-05
      }];

      const context: InsightsContext = {
        currentDate: '2026-11-06', // Après le 05 -> critique
        manualBalance: 2000,
        soldePrevisionnel: 1500,
        seuilFondRoulement: 500,
        pendingTransactions: [],
        liquidSavingsTotal: 5000,
        totalObligatoires: 800,
        templates
      };

      const insights = generateInsights(context);
      const commitmentInsight = insights.find(i => i.category === 'commitment_deadline');
      expect(commitmentInsight).toBeDefined();
      expect(commitmentInsight?.severity).toBe('critical');
      // Les alertes critiques doivent se trouver en haut de liste
      expect(insights[0].severity).toBe('critical');
    });
  });

  describe('4. Intégration ChargesAnalysisEngine', () => {
    it('enrichit les contrats fixes avec les métadonnées d\'engagement, le statut et le surcoût post-promo', () => {
      const templates: RecurrenceTemplate[] = [{
        id: 'tpl-gaz',
        type: 'fixed_expense',
        amount: 60,
        recurrenceDay: 10,
        accountId: 'acc-1',
        startDate: '2026-01',
        isActive: true,
        label: 'Contrat Énergie Gaz',
        commitment_end_date: '2026-11-30',
        price_after_promo: 85,
        notice_period_days: 30
      }];

      const txs = [
        {
          id: 'tx-oct',
          date: '2026-10-10',
          amount: 60,
          type: 'fixed_expense' as const,
          status: 'cleared' as const,
          accountId: 'acc-1',
          templateId: 'tpl-gaz',
          label: 'Contrat Énergie Gaz'
        },
        {
          id: 'tx-nov',
          date: '2026-11-10',
          amount: 60,
          type: 'fixed_expense' as const,
          status: 'planned' as const,
          accountId: 'acc-1',
          templateId: 'tpl-gaz',
          label: 'Contrat Énergie Gaz'
        }
      ];

      const res = analyzeCharges({
        transactions: txs as any,
        templates,
        referenceMonth: '2026-11',
        horizon: 6
      });

      const gazContract = res.fixedContracts.find(c => c.name === 'Contrat Énergie Gaz');
      expect(gazContract).toBeDefined();
      expect(gazContract?.commitmentEndDate).toBe('2026-11-30');
      expect(gazContract?.noticeDeadline).toBe('2026-10-31');
      expect(gazContract?.priceAfterPromo).toBe(85);
      // Surcoût annuel : (85 - 60) * 12 = 300 €
      expect(gazContract?.postPromoAnnualCost).toBe(300);
      expect(gazContract?.commitmentStatus).toBeDefined();
    });
  });

  describe('5. Sauvegarde, Export/Import JSON et Rétrocompatibilité', () => {
    it('exporte et réimporte sans perte les données d\'engagement, et accepte les exports v1.2.2 sans ces colonnes', () => {
      saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 29.99,
        recurrenceDay: 1,
        accountId,
        label: 'Antivirus Annuel',
        startDate: '2026-01',
        isActive: true,
        commitment_end_date: '2027-01-15',
        price_after_promo: 59.99,
        notice_period_days: 30
      });

      // 1. Export JSON complet
      const backup = exportBackupData(db);
      const exportedTmpl = backup.tables.recurrenceTemplates?.find((t: any) => t.label === 'Antivirus Annuel');
      expect(exportedTmpl).toBeDefined();
      expect(exportedTmpl.commitment_end_date).toBe('2027-01-15');
      expect(exportedTmpl.price_after_promo).toBe(59.99);
      expect(exportedTmpl.notice_period_days).toBe(30);

      // 2. Réimportation sur une nouvelle base vierge
      const freshDb = initDatabase(':memory:');
      importBackupData(freshDb, backup, { skipSafetyBackup: true });

      const importedTemplates = getAllRecurrenceTemplates(freshDb);
      const reimported = importedTemplates.find(t => t.label === 'Antivirus Annuel');
      expect(reimported).toBeDefined();
      expect(reimported?.commitment_end_date).toBe('2027-01-15');
      expect(reimported?.price_after_promo).toBe(59.99);
      expect(reimported?.notice_period_days).toBe(30);

      // 3. Rétrocompatibilité : importation d'un payload v1.2.2 sans les 3 champs
      const legacyBackup = {
        version: '1.2.2',
        exportDate: '2026-10-01T12:00:00Z',
        appName: 'PersonalBudgetPro',
        tables: {
          accounts: [{ id: 'acc-leg', name: 'Compte Ancien', type: 'checking', initialBalance: 500, referenceDate: '2026-01-01' }],
          categories: [{ id: 'cat-leg', name: 'Fixes', type: 'fixed_expense' }],
          transactions: [],
          loans: [],
          recurrenceTemplates: [{
            id: 'tmpl-leg',
            type: 'fixed_expense',
            amount: 50,
            recurrenceDay: 5,
            accountId: 'acc-leg',
            label: 'Ancien Modèle',
            startDate: '2026-01',
            isActive: 1
          }],
          app_settings: []
        }
      };

      importBackupData(freshDb, legacyBackup, { skipSafetyBackup: true });
      const legacyTmpls = getAllRecurrenceTemplates(freshDb);
      const legacyFound = legacyTmpls.find(t => t.id === 'tmpl-leg');
      expect(legacyFound).toBeDefined();
      expect(legacyFound?.commitment_end_date).toBeNull();
      expect(legacyFound?.price_after_promo).toBeNull();
      expect(legacyFound?.notice_period_days).toBe(30);

      freshDb.close();
    });
  });
});
