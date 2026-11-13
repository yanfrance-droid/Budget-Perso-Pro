import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { runDoctorAudit } from './dbDoctorService.ts';

describe('dbDoctorService - Moteur de diagnostic en lecture seule (DB Doctor)', () => {
  let db: DatabaseSync;
  let testAccountId: string;

  beforeEach(() => {
    // Initialisation hermétique en mémoire avec schéma complet et migrations
    db = initDatabase(':memory:');

    // Récupération du compte par défaut créé au seed
    const acc = db.prepare('SELECT id FROM accounts LIMIT 1').get() as { id: string };
    testAccountId = acc.id;
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignorer si déjà fermé
    }
  });

  it('1. État sain (Clean State) : retourne 0 anomalie et un statut healthy', () => {
    const report = runDoctorAudit(db, '2026-11');
    expect(report.status).toBe('healthy');
    expect(report.totalAnomalies).toBe(0);
    expect(report.sqliteIntegrity).toBe('ok');
    expect(report.anomalies).toHaveLength(0);
    expect(report.metrics.totalAccounts).toBeGreaterThan(0);
  });

  it('2. ANOM-01 : détecte une transaction enfant dont le parent est inexistant ou supprimé', () => {
    // Parent supprimé (soft-delete)
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, deleted_at)
      VALUES ('tx_parent_del', '2026-11-05', 'expense', -100, 'cleared', ?, 123456789)
    `).run(testAccountId);

    // Enfant pointant vers le parent supprimé
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_child_orphan', '2026-11-05', 'expense', -50, 'cleared', ?, 'tx_parent_del')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom01 = report.anomalies.find(a => a.id === 'ANOM-01');
    expect(anom01).toBeDefined();
    expect(anom01?.count).toBe(1);
    expect(anom01?.affectedIds).toContain('tx_child_orphan');
  });

  it('3. ANOM-02 : détecte un remboursement santé pointant vers un soin inexistant ou supprimé', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_health_reimb', '2026-11-06', 'health_reimbursement', 45, 'cleared', ?, 'ghost_care')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom02 = report.anomalies.find(a => a.id === 'ANOM-02');
    expect(anom02).toBeDefined();
    expect(anom02?.count).toBe(1);
    expect(anom02?.affectedIds).toContain('tx_health_reimb');
  });

  it('4. ANOM-03 : détecte une mensualité de crédit liée à un prêt inexistant', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_loan_orph', '2026-11-07', 'loan_payment', 350, 'planned', ?, 'ghost_loan')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom03 = report.anomalies.find(a => a.id === 'ANOM-03');
    expect(anom03).toBeDefined();
    expect(anom03?.count).toBe(1);
    expect(anom03?.affectedIds).toContain('tx_loan_orph');
  });

  it('5. ANOM-04 : détecte un virement interne sans compte destinataire valide', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, destinationAccountId)
      VALUES ('tx_transf_orph', '2026-11-08', 'transfer', -200, 'cleared', ?, 'non_existing_acc')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom04 = report.anomalies.find(a => a.id === 'ANOM-04');
    expect(anom04).toBeDefined();
    expect(anom04?.severity).toBe('blocker');
    expect(anom04?.affectedIds).toContain('tx_transf_orph');
  });

  it('6. ANOM-05 : détecte une transaction sans compte bancaire valide (avec PRAGMA foreign_keys)', () => {
    // Désactivation temporaire des contraintes FK pour simuler une corruption externe
    db.exec('PRAGMA foreign_keys = OFF;');
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES ('tx_no_acc', '2026-11-09', 'expense', -30, 'cleared', 'missing_account_id')
    `).run();
    db.exec('PRAGMA foreign_keys = ON;');

    const report = runDoctorAudit(db, '2026-11');
    const anom05 = report.anomalies.find(a => a.id === 'ANOM-05');
    expect(anom05).toBeDefined();
    expect(anom05?.severity).toBe('blocker');
    expect(anom05?.affectedIds).toContain('tx_no_acc');
  });

  it('7. ANOM-06 & ANOM-07 : détecte les catégories et tiers payeurs inexistants', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, categoryId, payerId)
      VALUES ('tx_missing_fk', '2026-11-10', 'income', 1500, 'cleared', ?, 'deleted_cat', 'deleted_payer')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom06 = report.anomalies.find(a => a.id === 'ANOM-06');
    const anom07 = report.anomalies.find(a => a.id === 'ANOM-07');
    expect(anom06).toBeDefined();
    expect(anom07).toBeDefined();
    expect(anom06?.affectedIds).toContain('tx_missing_fk');
    expect(anom07?.affectedIds).toContain('tx_missing_fk');
  });

  it('8. ANOM-08 & ANOM-09 : détecte les contrats supprimés et les doublons actifs de template', () => {
    // Template inexistant
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_tmpl_ghost', '2026-11-11', 'expense', -40, 'planned', ?, 'ghost_template')
    `).run(testAccountId);

    // Création d'un vrai template pour tester le doublon
    db.prepare(`
      INSERT INTO recurrence_templates (id, type, amount, recurrenceDay, accountId, label, startDate)
      VALUES ('tmpl_valid', 'expense', -50, 15, ?, 'Abonnement Test', '2026-01-01')
    `).run(testAccountId);

    // Deux transactions actives sur le même mois pour ce template
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_dup_1', '2026-11-15', 'expense', -50, 'cleared', ?, 'tmpl_valid')
    `).run(testAccountId);
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_dup_2', '2026-11-15', 'expense', -50, 'planned', ?, 'tmpl_valid')
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom08 = report.anomalies.find(a => a.id === 'ANOM-08');
    const anom09 = report.anomalies.find(a => a.id === 'ANOM-09');

    expect(anom08).toBeDefined();
    expect(anom08?.affectedIds).toContain('tx_tmpl_ghost');

    expect(anom09).toBeDefined();
    expect(anom09?.count).toBe(1);
    expect(anom09?.affectedIds).toContain('tx_dup_1');
    expect(anom09?.affectedIds).toContain('tx_dup_2');
  });

  it('9. ANOM-10 & ANOM-11 : détecte les anomalies sur planned_expenses et loan_payment_history', () => {
    db.prepare(`
      INSERT INTO planned_expenses (id, label, estimatedAmount, categoryId, urgency, createdAt)
      VALUES ('plan_bad_cat', 'Achat PC', 1200, 'ghost_category', 'high', '2026-11-01')
    `).run();

    // Palier d'historique de prêt sans prêt
    db.exec('PRAGMA foreign_keys = OFF;');
    db.prepare(`
      INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, createdAt)
      VALUES ('lph_orphan', 'ghost_loan_id', '2026-11', 450, '2026-11-01')
    `).run();
    db.exec('PRAGMA foreign_keys = ON;');

    const report = runDoctorAudit(db, '2026-11');
    const anom10 = report.anomalies.find(a => a.id === 'ANOM-10');
    const anom11 = report.anomalies.find(a => a.id === 'ANOM-11');

    expect(anom10).toBeDefined();
    expect(anom11).toBeDefined();
    expect(anom10?.affectedIds).toContain('plan_bad_cat');
    expect(anom11?.affectedIds).toContain('lph_orphan');
  });

  it('10. ANOM-12 : détecte les capitaux négatifs et les amortissements incohérents', () => {
    // Prêt avec capital négatif
    db.prepare(`
      INSERT INTO loans (id, name, lender, initialAmount, remainingCapital, monthlyPayment, startDate, durationMonths, accountId)
      VALUES ('loan_neg', 'Prêt Auto', 'Banque', 10000, -150, 250, '2026-01-01', 48, ?)
    `).run(testAccountId);

    // Mensualité avec amortissement supérieur au montant
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, amortizedCapital)
      VALUES ('tx_amort_excess', '2026-11-20', 'loan_payment', 200, 'cleared', ?, 350)
    `).run(testAccountId);

    // Mensualité avec amortissement négatif
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, amortizedCapital)
      VALUES ('tx_amort_neg', '2026-11-20', 'loan_payment', 200, 'cleared', ?, -50)
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom12 = report.anomalies.find(a => a.id === 'ANOM-12');
    expect(anom12).toBeDefined();
    expect(anom12?.count).toBe(3);
    expect(anom12?.affectedIds).toContain('loan_neg');
    expect(anom12?.affectedIds).toContain('tx_amort_excess');
    expect(anom12?.affectedIds).toContain('tx_amort_neg');
  });

  it('11. ANOM-13 : détecte les transactions planned restées non pointées dans un mois passé clos', () => {
    // Transaction prévue dans un mois passé (ex: Octobre 2026 alors que le mois de référence est Novembre 2026)
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES ('tx_past_planned', '2026-10-15', 'expense', -80, 'planned', ?)
    `).run(testAccountId);

    // Transaction prévue dans le mois courant (Novembre 2026) -> Doit être ignorée
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES ('tx_cur_planned', '2026-11-25', 'expense', -80, 'planned', ?)
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    const anom13 = report.anomalies.find(a => a.id === 'ANOM-13');
    expect(anom13).toBeDefined();
    expect(anom13?.count).toBe(1);
    expect(anom13?.affectedIds).toEqual(['tx_past_planned']);
  });

  it('12. Règle d or : Respect absolu du scellage historique des contrats résiliés', () => {
    // Transaction historique d'Octobre détachée (templateId = NULL suite à résiliation ultérieure)
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, recurrenceDay, templateId)
      VALUES ('tx_hist_sealed', '2026-10-05', 'fixed_expense', -45, 'cleared', ?, 5, NULL)
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    // Ne doit lever aucune anomalie (ni ANOM-01, ni ANOM-08, etc.)
    expect(report.anomalies.some(a => a.affectedIds.includes('tx_hist_sealed'))).toBe(false);
  });

  it('13. Règle d or : Respect absolu du soft-delete (les transactions supprimées sont ignorées)', () => {
    // Transaction supprimée avec données incomplètes
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId, deleted_at)
      VALUES ('tx_deleted_ghost', '2026-11-01', 'expense', -25, 'planned', ?, 'ghost_template', 12345678)
    `).run(testAccountId);

    const report = runDoctorAudit(db, '2026-11');
    expect(report.anomalies.some(a => a.affectedIds.includes('tx_deleted_ghost'))).toBe(false);
  });
});
