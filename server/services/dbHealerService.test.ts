import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initDatabase } from '../db.ts';
import { previewHealerPlan, applyHealerPlan } from './dbHealerService.ts';
import { runDoctorAudit } from './dbDoctorService.ts';

describe('dbHealerService - Moteur de réparation sécurisée (DB Healer)', () => {
  let db: DatabaseSync;
  let testAccountId: string;
  const testBackupDir = path.join(os.tmpdir(), `budget_healer_test_${Date.now()}`);

  beforeEach(() => {
    db = initDatabase(':memory:');
    const acc = db.prepare('SELECT id FROM accounts LIMIT 1').get() as { id: string };
    testAccountId = acc.id;
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignorer
    }
  });

  afterAll(() => {
    // Nettoyage impératif du dossier temporaire de test pour zéro pollution
    if (fs.existsSync(testBackupDir)) {
      try {
        fs.rmSync(testBackupDir, { recursive: true, force: true });
      } catch {
        // Ignorer
      }
    }
  });

  it('1. previewHealerPlan (Dry-Run) calcule les diffs exacts sans écrire sur la base', () => {
    // Insérer une anomalie ANOM-01
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_dry_child', '2026-11-05', 'expense', -50, 'cleared', ?, 'ghost_parent')
    `).run(testAccountId);

    const plan = [{
      ruleId: 'ANOM-01',
      targetIds: ['tx_dry_child']
    }];

    const result = previewHealerPlan(db, plan, '2026-11');
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.totalModifications).toBe(1);
    expect(result.diffs[0].field).toBe('linkedId');
    expect(result.diffs[0].oldValue).toBe('ghost_parent');
    expect(result.diffs[0].newValue).toBeNull();
    expect(result.preAudit.totalAnomalies).toBe(1);
    expect(result.postAudit.totalAnomalies).toBe(0);

    // Vérification absolue : la base n'a STRICTEMENT PAS été modifiée
    const row = db.prepare('SELECT linkedId FROM transactions WHERE id = ?').get('tx_dry_child') as any;
    expect(row.linkedId).toBe('ghost_parent');
  });

  it('2. applyHealerPlan applique les détachements propres (ANOM-01, 02, 06, 07, 08, 10, 11)', () => {
    // Insérer des anomalies diverses
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId, categoryId, payerId, templateId)
      VALUES ('tx_multi_anom', '2026-11-05', 'health_reimbursement', 30, 'cleared', ?, 'ghost_care', 'ghost_cat', 'ghost_pyr', 'ghost_tmpl')
    `).run(testAccountId);

    db.prepare(`
      INSERT INTO planned_expenses (id, label, estimatedAmount, categoryId, urgency, createdAt)
      VALUES ('plan_bad', 'Plan test', 50, 'ghost_cat', 'low', '2026-11-01')
    `).run();

    // Insertion pour ANOM-11
    db.exec('PRAGMA foreign_keys = OFF;');
    db.prepare(`
      INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, createdAt)
      VALUES ('lph_bad', 'ghost_loan', '2026-11', 200, '2026-11-01')
    `).run();
    db.exec('PRAGMA foreign_keys = ON;');

    const plans = [
      { ruleId: 'ANOM-02', targetIds: ['tx_multi_anom'] },
      { ruleId: 'ANOM-06', targetIds: ['tx_multi_anom'] },
      { ruleId: 'ANOM-07', targetIds: ['tx_multi_anom'] },
      { ruleId: 'ANOM-08', targetIds: ['tx_multi_anom'] },
      { ruleId: 'ANOM-10', targetIds: ['plan_bad'] },
      { ruleId: 'ANOM-11', targetIds: ['lph_bad'] }
    ];

    const result = applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });
    expect(result.dryRun).toBe(false);
    expect(result.success).toBe(true);

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx_multi_anom') as any;
    expect(tx.linkedId).toBeNull();
    expect(tx.categoryId).toBeNull();
    expect(tx.payerId).toBeNull();
    expect(tx.templateId).toBeNull();

    const planItem = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get('plan_bad') as any;
    expect(planItem.categoryId).toBeNull();

    const lph = db.prepare('SELECT * FROM loan_payment_history WHERE id = ?').get('lph_bad');
    expect(lph).toBeUndefined();
  });

  it('3. ANOM-03 : résout les mensualités de prêt (rattachement explicite ou détachement)', () => {
    // Créer un prêt valide
    db.prepare(`
      INSERT INTO loans (id, name, lender, initialAmount, remainingCapital, monthlyPayment, startDate, durationMonths, accountId)
      VALUES ('loan_valid', 'Prêt Immo', 'Banque', 200000, 180000, 850, '2026-01-01', 240, ?)
    `).run(testAccountId);

    // Mensualité 1 : à rattacher
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_loan_1', '2026-11-05', 'loan_payment', 850, 'cleared', ?, 'ghost_loan')
    `).run(testAccountId);

    // Mensualité 2 : à détacher
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, linkedId)
      VALUES ('tx_loan_2', '2026-11-05', 'loan_payment', 850, 'cleared', ?, 'ghost_loan')
    `).run(testAccountId);

    const plans = [
      { ruleId: 'ANOM-03', targetIds: ['tx_loan_1'], userParameters: { targetLoanId: 'loan_valid' } },
      { ruleId: 'ANOM-03', targetIds: ['tx_loan_2'] } // sans targetLoanId -> linkedId = NULL
    ];

    applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });

    const tx1 = db.prepare('SELECT linkedId FROM transactions WHERE id = ?').get('tx_loan_1') as any;
    expect(tx1.linkedId).toBe('loan_valid');

    const tx2 = db.prepare('SELECT linkedId FROM transactions WHERE id = ?').get('tx_loan_2') as any;
    expect(tx2.linkedId).toBeNull();
  });

  it('4. ANOM-04 & ANOM-05 : bloque strictement toute réparation sans compte cible', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, destinationAccountId)
      VALUES ('tx_virement_bad', '2026-11-05', 'transfer', -100, 'cleared', ?, 'ghost_dest')
    `).run(testAccountId);

    // Appel sans targetAccountId pour ANOM-04 -> Doit lever une exception
    expect(() => {
      applyHealerPlan(db, [{ ruleId: 'ANOM-04', targetIds: ['tx_virement_bad'] }], '2026-11', { backupDir: testBackupDir });
    }).toThrow(/Arbitrage manuel obligatoire/);

    // Vérifier que la transaction est restée intacte (zéro mutation aveugle)
    const tx = db.prepare('SELECT destinationAccountId FROM transactions WHERE id = ?').get('tx_virement_bad') as any;
    expect(tx.destinationAccountId).toBe('ghost_dest');
  });

  it('5. ANOM-04 & ANOM-05 : applique l arbitrage assisté avec compte cible valide', () => {
    // Créer un deuxième compte valide
    db.prepare(`
      INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate)
      VALUES ('acc_dest_ok', 'Livret A', 'savings', 'savings', 1000, '2026-11-01')
    `).run();

    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, destinationAccountId)
      VALUES ('tx_virement_ok', '2026-11-05', 'transfer', -100, 'cleared', ?, 'ghost_dest')
    `).run(testAccountId);

    const plans = [{
      ruleId: 'ANOM-04',
      targetIds: ['tx_virement_ok'],
      userParameters: { targetAccountId: 'acc_dest_ok' }
    }];

    applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });

    const tx = db.prepare('SELECT destinationAccountId FROM transactions WHERE id = ?').get('tx_virement_ok') as any;
    expect(tx.destinationAccountId).toBe('acc_dest_ok');
  });

  it('6. ANOM-09 : arbitrage intelligent et sécurité anti-extinction totale sur les doublons', () => {
    // Créer un template de test
    db.prepare(`
      INSERT INTO recurrence_templates (id, type, amount, recurrenceDay, accountId, label, startDate)
      VALUES ('tmpl_dup_test', 'fixed_expense', -40, 10, ?, 'Fibre Test', '2026-01-01')
    `).run(testAccountId);

    // Cas A : 1 cleared + 1 planned -> La ligne cleared survit impérativement
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_dup_cleared', '2026-11-10', 'fixed_expense', -40, 'cleared', ?, 'tmpl_dup_test')
    `).run(testAccountId);
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_dup_planned', '2026-11-10', 'fixed_expense', -40, 'planned', ?, 'tmpl_dup_test')
    `).run(testAccountId);

    const plansA = [{
      ruleId: 'ANOM-09',
      targetIds: ['tx_dup_cleared', 'tx_dup_planned']
    }];

    applyHealerPlan(db, plansA, '2026-11', { backupDir: testBackupDir });

    const clearedTx = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get('tx_dup_cleared') as any;
    const plannedTx = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get('tx_dup_planned') as any;

    expect(clearedTx.deleted_at).toBeNull(); // SURVIE
    expect(plannedTx.deleted_at).toBeGreaterThan(0); // SOFT-DELETE

    // Cas B : 2 planned (anti-extinction) -> Exactement 1 gagne et survit
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_p1', '2026-12-10', 'fixed_expense', -40, 'planned', ?, 'tmpl_dup_test')
    `).run(testAccountId);
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_p2', '2026-12-10', 'fixed_expense', -40, 'planned', ?, 'tmpl_dup_test')
    `).run(testAccountId);

    const plansB = [{
      ruleId: 'ANOM-09',
      targetIds: ['tx_p1', 'tx_p2']
    }];

    applyHealerPlan(db, plansB, '2026-11', { backupDir: testBackupDir });

    const p1 = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get('tx_p1') as any;
    const p2 = db.prepare('SELECT deleted_at FROM transactions WHERE id = ?').get('tx_p2') as any;

    // L'un des deux a survécu et l'autre est supprimé (anti-extinction)
    const survivedCount = (p1.deleted_at === null ? 1 : 0) + (p2.deleted_at === null ? 1 : 0);
    expect(survivedCount).toBe(1);
  });

  it('7. ANOM-12 : plafonnement mathématique des capitaux négatifs et des amortissements', () => {
    db.prepare(`
      INSERT INTO loans (id, name, lender, initialAmount, remainingCapital, monthlyPayment, startDate, durationMonths, accountId)
      VALUES ('loan_neg_fix', 'Prêt Test', 'Banque', 1000, -300, 100, '2026-01-01', 10, ?)
    `).run(testAccountId);

    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, amortizedCapital)
      VALUES ('tx_amort_fix', '2026-11-15', 'loan_payment', 100, 'cleared', ?, 250)
    `).run(testAccountId);

    const plans = [{
      ruleId: 'ANOM-12',
      targetIds: ['loan_neg_fix', 'tx_amort_fix']
    }];

    applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });

    const loan = db.prepare('SELECT remainingCapital FROM loans WHERE id = ?').get('loan_neg_fix') as any;
    expect(loan.remainingCapital).toBe(0);

    const tx = db.prepare('SELECT amortizedCapital FROM transactions WHERE id = ?').get('tx_amort_fix') as any;
    expect(tx.amortizedCapital).toBe(100);
  });

  it('8. ANOM-13 : résolution explicite clear (pointer) vs trash (corbeille)', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES ('tx_past_1', '2026-09-01', 'expense', -20, 'planned', ?)
    `).run(testAccountId);

    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId)
      VALUES ('tx_past_2', '2026-09-02', 'expense', -30, 'planned', ?)
    `).run(testAccountId);

    const plans = [
      { ruleId: 'ANOM-13', targetIds: ['tx_past_1'], userParameters: { pastPlannedResolution: 'clear' as const } },
      { ruleId: 'ANOM-13', targetIds: ['tx_past_2'], userParameters: { pastPlannedResolution: 'trash' as const } }
    ];

    applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });

    const tx1 = db.prepare('SELECT status, deleted_at FROM transactions WHERE id = ?').get('tx_past_1') as any;
    expect(tx1.status).toBe('cleared');
    expect(tx1.deleted_at).toBeNull();

    const tx2 = db.prepare('SELECT status, deleted_at FROM transactions WHERE id = ?').get('tx_past_2') as any;
    expect(tx2.deleted_at).toBeGreaterThan(0);
  });

  it('9. Règle d or : sanctuarisation absolue des contrats désactivés (Axa scolaire, Axa trotinette)', () => {
    // Insérer un contrat désactivé avec ses échéances futures
    db.prepare(`
      INSERT INTO recurrence_templates (id, type, amount, recurrenceDay, accountId, label, startDate, isActive, disabledFromMonth)
      VALUES ('tmpl_deact', 'variable_expense', 28.32, 5, ?, 'Axa scolaire', '2026-10', 0, '2026-10')
    `).run(testAccountId);

    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, templateId)
      VALUES ('tx_deact_fut', '2027-03-05', 'variable_expense', 28.32, 'planned', ?, 'tmpl_deact')
    `).run(testAccountId);

    // L'audit initial ne doit relever aucune anomalie
    const pre = runDoctorAudit(db, '2026-11');
    expect(pre.totalAnomalies).toBe(0);

    // Une tentative Healer sur ce templateId doit être sans effet
    const plans = [{ ruleId: 'ANOM-08', targetIds: ['tx_deact_fut'] }];
    applyHealerPlan(db, plans, '2026-11', { backupDir: testBackupDir });

    const tx = db.prepare('SELECT templateId, deleted_at FROM transactions WHERE id = ?').get('tx_deact_fut') as any;
    expect(tx.templateId).toBe('tmpl_deact');
    expect(tx.deleted_at).toBeNull();
  });

  it('10. Rollback automatique sur erreur injectée au cours de la transaction', () => {
    db.prepare(`
      INSERT INTO transactions (id, date, type, amount, status, accountId, categoryId)
      VALUES ('tx_atomic_test', '2026-11-05', 'expense', -10, 'cleared', ?, 'ghost_cat')
    `).run(testAccountId);

    const plans = [
      { ruleId: 'ANOM-06', targetIds: ['tx_atomic_test'] },
      { ruleId: 'INVALID_RULE_FOR_ERROR', targetIds: ['tx_atomic_test'] } // Doit provoquer une exception
    ];

    expect(() => {
      applyHealerPlan(db, plans as any, '2026-11', { backupDir: testBackupDir });
    }).toThrow();

    // Vérifier que le rollback a restauré l'état initial : categoryId n'est PAS passé à null
    const tx = db.prepare('SELECT categoryId FROM transactions WHERE id = ?').get('tx_atomic_test') as any;
    expect(tx.categoryId).toBe('ghost_cat');
  });
});
