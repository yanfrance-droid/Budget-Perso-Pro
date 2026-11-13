import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { runDoctorAudit, type DoctorReport } from './dbDoctorService.ts';

export interface HealerActionPlan {
  ruleId: string;
  targetIds: string[];
  userParameters?: {
    targetAccountId?: string;
    targetLoanId?: string;
    pastPlannedResolution?: 'clear' | 'trash';
    duplicateKeepId?: string;
  };
}

export interface HealerDiffItem {
  table: string;
  recordId: string;
  field: string;
  oldValue: any;
  newValue: any;
  action: 'UPDATE' | 'DELETE' | 'SOFT_DELETE';
}

export interface HealerResult {
  dryRun: boolean;
  success: boolean;
  backupPath?: string;
  totalModifications: number;
  diffs: HealerDiffItem[];
  preAudit: DoctorReport;
  postAudit: DoctorReport;
  errors?: string[];
}

/**
 * Crée une sauvegarde physique SQLite (VACUUM INTO) avant toute application réelle de réparations.
 * Isole les sauvegardes en mémoire dans os.tmpdir() pour ne jamais polluer data/backups pendant les tests.
 */
export function createHealerBackup(db: DatabaseSync, customDir?: string): string {
  const dbList = db.prepare('PRAGMA database_list').all() as { seq: number; name: string; file: string }[];
  const mainFile = dbList.find(d => d.name === 'main')?.file || '';
  const isMemory = !mainFile || mainFile === '';

  let backupDir = customDir;
  if (!backupDir) {
    if (isMemory) {
      backupDir = path.join(os.tmpdir(), 'budget_healer_test_backups');
    } else {
      backupDir = path.join(path.dirname(path.resolve(mainFile)), 'backups');
    }
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `budget_healer_safety_${timestamp}.db`);
  const normalizedPath = backupFilePath.replace(/\\/g, '/');

  db.exec(`VACUUM INTO '${normalizedPath}'`);
  return backupFilePath;
}

/**
 * Exécute les mutations chirurgicales sur les plans demandés et enregistre les diffs exacts.
 */
function executePlanMutations(
  db: DatabaseSync,
  plans: HealerActionPlan[],
  diffs: HealerDiffItem[]
): void {
  for (const plan of plans) {
    const { ruleId, targetIds, userParameters } = plan;
    if (!targetIds || targetIds.length === 0) continue;

    switch (ruleId) {
      case 'ANOM-01': {
        // Enfant orphelin hors prêt/santé (uniquement si le parent est réellement absent ou supprimé)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, linkedId FROM transactions 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND linkedId IS NOT NULL 
              AND linkedId != ''
              AND type NOT IN ('loan_payment', 'health_reimbursement')
              AND linkedId NOT IN (SELECT id FROM transactions WHERE deleted_at IS NULL)
          `).get(id) as { id: string; linkedId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'linkedId',
              oldValue: row.linkedId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare(`
              UPDATE transactions SET linkedId = NULL 
              WHERE id = ? AND deleted_at IS NULL AND type NOT IN ('loan_payment', 'health_reimbursement')
            `).run(id);
          }
        }
        break;
      }

      case 'ANOM-02': {
        // Remboursement santé orphelin (uniquement si la dépense de soin est réellement absente ou supprimée)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, linkedId FROM transactions 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND type = 'health_reimbursement'
              AND linkedId IS NOT NULL 
              AND linkedId != ''
              AND linkedId NOT IN (SELECT id FROM transactions WHERE type = 'health_expense' AND deleted_at IS NULL)
          `).get(id) as { id: string; linkedId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'linkedId',
              oldValue: row.linkedId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare(`
              UPDATE transactions SET linkedId = NULL 
              WHERE id = ? AND deleted_at IS NULL AND type = 'health_reimbursement'
            `).run(id);
          }
        }
        break;
      }

      case 'ANOM-03': {
        // Mensualité de prêt orpheline : rattachement explicite ou détachement (uniquement si le prêt est réellement absent)
        const targetLoanId = userParameters?.targetLoanId;
        if (targetLoanId) {
          const loan = db.prepare('SELECT id FROM loans WHERE id = ?').get(targetLoanId) as { id: string } | undefined;
          if (!loan) {
            throw new Error(`Prêt cible introuvable (${targetLoanId}) pour ANOM-03.`);
          }
          for (const id of targetIds) {
            const row = db.prepare(`
              SELECT id, linkedId FROM transactions 
              WHERE id = ? 
                AND deleted_at IS NULL 
                AND type = 'loan_payment'
                AND linkedId IS NOT NULL 
                AND linkedId != ''
                AND linkedId NOT IN (SELECT id FROM loans)
            `).get(id) as { id: string; linkedId: string } | undefined;
            if (row) {
              diffs.push({
                table: 'transactions',
                recordId: id,
                field: 'linkedId',
                oldValue: row.linkedId,
                newValue: targetLoanId,
                action: 'UPDATE'
              });
              db.prepare(`
                UPDATE transactions SET linkedId = ? 
                WHERE id = ? AND deleted_at IS NULL AND type = 'loan_payment'
              `).run(targetLoanId, id);
            }
          }
        } else {
          // Détachement explicite (linkedId = NULL)
          for (const id of targetIds) {
            const row = db.prepare(`
              SELECT id, linkedId FROM transactions 
              WHERE id = ? 
                AND deleted_at IS NULL 
                AND type = 'loan_payment'
                AND linkedId IS NOT NULL 
                AND linkedId != ''
                AND linkedId NOT IN (SELECT id FROM loans)
            `).get(id) as { id: string; linkedId: string } | undefined;
            if (row) {
              diffs.push({
                table: 'transactions',
                recordId: id,
                field: 'linkedId',
                oldValue: row.linkedId,
                newValue: null,
                action: 'UPDATE'
              });
              db.prepare(`
                UPDATE transactions SET linkedId = NULL 
                WHERE id = ? AND deleted_at IS NULL AND type = 'loan_payment'
              `).run(id);
            }
          }
        }
        break;
      }

      case 'ANOM-04': {
        // Virement sans compte destinataire : arbitrage manuel obligatoire
        const targetAccountId = userParameters?.targetAccountId;
        if (!targetAccountId) {
          throw new Error('Arbitrage manuel obligatoire : aucun compte destinataire valide (targetAccountId) spécifié pour ANOM-04.');
        }
        const acc = db.prepare('SELECT id FROM accounts WHERE id = ?').get(targetAccountId) as { id: string } | undefined;
        if (!acc) {
          throw new Error(`Compte destinataire cible introuvable (${targetAccountId}) pour ANOM-04.`);
        }
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, destinationAccountId FROM transactions 
            WHERE id = ? AND deleted_at IS NULL AND type = 'transfer'
          `).get(id) as { id: string; destinationAccountId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'destinationAccountId',
              oldValue: row.destinationAccountId,
              newValue: targetAccountId,
              action: 'UPDATE'
            });
            db.prepare(`
              UPDATE transactions SET destinationAccountId = ? 
              WHERE id = ? AND deleted_at IS NULL AND type = 'transfer'
            `).run(targetAccountId, id);
          }
        }
        break;
      }

      case 'ANOM-05': {
        // Transaction sans compte source : arbitrage manuel obligatoire
        const targetAccountId = userParameters?.targetAccountId;
        if (!targetAccountId) {
          throw new Error('Arbitrage manuel obligatoire : aucun compte bancaire valide (targetAccountId) spécifié pour ANOM-05.');
        }
        const acc = db.prepare('SELECT id FROM accounts WHERE id = ?').get(targetAccountId) as { id: string } | undefined;
        if (!acc) {
          throw new Error(`Compte bancaire cible introuvable (${targetAccountId}) pour ANOM-05.`);
        }
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, accountId FROM transactions 
            WHERE id = ? AND deleted_at IS NULL
          `).get(id) as { id: string; accountId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'accountId',
              oldValue: row.accountId,
              newValue: targetAccountId,
              action: 'UPDATE'
            });
            db.prepare(`
              UPDATE transactions SET accountId = ? 
              WHERE id = ? AND deleted_at IS NULL
            `).run(targetAccountId, id);
          }
        }
        break;
      }

      case 'ANOM-06': {
        // Catégorie supprimée (uniquement si la catégorie est réellement inexistante)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, categoryId FROM transactions 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND categoryId IS NOT NULL 
              AND categoryId != '' 
              AND categoryId NOT IN (SELECT id FROM categories)
          `).get(id) as { id: string; categoryId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'categoryId',
              oldValue: row.categoryId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare('UPDATE transactions SET categoryId = NULL WHERE id = ? AND deleted_at IS NULL').run(id);
          }
        }
        break;
      }

      case 'ANOM-07': {
        // Tiers payeur supprimé (uniquement si l'organisme est réellement inexistant)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, payerId FROM transactions 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND payerId IS NOT NULL 
              AND payerId != '' 
              AND payerId NOT IN (SELECT id FROM income_payers)
          `).get(id) as { id: string; payerId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'payerId',
              oldValue: row.payerId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare('UPDATE transactions SET payerId = NULL WHERE id = ? AND deleted_at IS NULL').run(id);
          }
        }
        break;
      }

      case 'ANOM-08': {
        // Contrat de récurrence supprimé (détachement scellé uniquement si le templateId n'existe réellement pas)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, templateId FROM transactions 
            WHERE id = ? 
              AND deleted_at IS NULL 
              AND templateId IS NOT NULL 
              AND templateId != '' 
              AND templateId NOT IN (SELECT id FROM recurrence_templates)
          `).get(id) as { id: string; templateId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'transactions',
              recordId: id,
              field: 'templateId',
              oldValue: row.templateId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare('UPDATE transactions SET templateId = NULL WHERE id = ? AND deleted_at IS NULL').run(id);
          }
        }
        break;
      }

      case 'ANOM-09': {
        // Doublons de contrats : arbitrage anti-extinction totale
        // Récupérer toutes les transactions actives ciblées
        const placeholders = targetIds.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT id, substr(date, 1, 7) as month, templateId, status, isCustomized
          FROM transactions 
          WHERE id IN (${placeholders}) AND deleted_at IS NULL
        `).all(...targetIds) as { id: string; month: string; templateId: string; status: string; isCustomized: number }[];

        // Regrouper par (month, templateId)
        const groups: Record<string, typeof rows> = {};
        for (const r of rows) {
          const key = `${r.month}_${r.templateId}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(r);
        }

        const now = Date.now();
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length <= 1) continue;

          // Score de pérennité : cleared (1000) > pending (500) > isCustomized (+100) > planned (10)
          const score = (tx: (typeof rows)[0]) => {
            let s = 0;
            if (tx.status === 'cleared') s += 1000;
            else if (tx.status === 'pending') s += 500;
            else if (tx.status === 'planned') s += 10;
            if (tx.isCustomized) s += 100;
            return s;
          };

          group.sort((a, b) => score(b) - score(a));

          // Élection impérative du gagnant unique
          let keepId = group[0].id;
          if (userParameters?.duplicateKeepId && group.some(t => t.id === userParameters.duplicateKeepId)) {
            keepId = userParameters.duplicateKeepId;
          }

          // Soft-delete STRICTEMENT limité aux autres lignes en statut planned
          for (const tx of group) {
            if (tx.id !== keepId && tx.status === 'planned') {
              diffs.push({
                table: 'transactions',
                recordId: tx.id,
                field: 'deleted_at',
                oldValue: null,
                newValue: now,
                action: 'SOFT_DELETE'
              });
              db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL AND status = \'planned\'').run(now, tx.id);
            }
          }
        }
        break;
      }

      case 'ANOM-10': {
        // Dépense prévisionnelle avec catégorie invalide (uniquement si la catégorie est réellement absente)
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, categoryId FROM planned_expenses 
            WHERE id = ? 
              AND categoryId IS NOT NULL 
              AND categoryId != '' 
              AND categoryId NOT IN (SELECT id FROM categories)
          `).get(id) as { id: string; categoryId: string } | undefined;
          if (row) {
            diffs.push({
              table: 'planned_expenses',
              recordId: id,
              field: 'categoryId',
              oldValue: row.categoryId,
              newValue: null,
              action: 'UPDATE'
            });
            db.prepare('UPDATE planned_expenses SET categoryId = NULL WHERE id = ?').run(id);
          }
        }
        break;
      }

      case 'ANOM-11': {
        // Palier de prêt orphelin
        for (const id of targetIds) {
          const row = db.prepare('SELECT id FROM loan_payment_history WHERE id = ?').get(id) as { id: string } | undefined;
          if (row) {
            diffs.push({
              table: 'loan_payment_history',
              recordId: id,
              field: 'id',
              oldValue: id,
              newValue: null,
              action: 'DELETE'
            });
            db.prepare('DELETE FROM loan_payment_history WHERE id = ?').run(id);
          }
        }
        break;
      }

      case 'ANOM-12': {
        // Plafonnement mathématique des prêts (capital < 0 ou amortissement excessif/négatif)
        for (const id of targetIds) {
          // Cas Prêt
          const loan = db.prepare('SELECT id, remainingCapital FROM loans WHERE id = ? AND remainingCapital < 0').get(id) as { id: string; remainingCapital: number } | undefined;
          if (loan) {
            diffs.push({
              table: 'loans',
              recordId: id,
              field: 'remainingCapital',
              oldValue: loan.remainingCapital,
              newValue: 0,
              action: 'UPDATE'
            });
            db.prepare('UPDATE loans SET remainingCapital = 0 WHERE id = ? AND remainingCapital < 0').run(id);
          }

          // Cas Mensualité
          const tx = db.prepare(`
            SELECT id, amount, amortizedCapital FROM transactions 
            WHERE id = ? AND deleted_at IS NULL AND type = 'loan_payment'
          `).get(id) as { id: string; amount: number; amortizedCapital: number | null } | undefined;
          if (tx && tx.amortizedCapital !== null) {
            const maxAmort = Math.abs(tx.amount);
            if (tx.amortizedCapital < 0 || tx.amortizedCapital > maxAmort) {
              const newAmort = tx.amortizedCapital < 0 ? 0 : maxAmort;
              diffs.push({
                table: 'transactions',
                recordId: id,
                field: 'amortizedCapital',
                oldValue: tx.amortizedCapital,
                newValue: newAmort,
                action: 'UPDATE'
              });
              db.prepare('UPDATE transactions SET amortizedCapital = ? WHERE id = ?').run(newAmort, id);
            }
          }
        }
        break;
      }

      case 'ANOM-13': {
        // Dépenses planned dans les mois passés clos
        const resolution = userParameters?.pastPlannedResolution;
        if (!resolution || (resolution !== 'clear' && resolution !== 'trash')) {
          throw new Error('Choix utilisateur obligatoire pour ANOM-13 : "pastPlannedResolution" doit valoir "clear" (pointer) ou "trash" (corbeille).');
        }

        const now = Date.now();
        for (const id of targetIds) {
          const row = db.prepare(`
            SELECT id, status FROM transactions 
            WHERE id = ? AND deleted_at IS NULL AND status = 'planned'
          `).get(id) as { id: string; status: string } | undefined;
          if (row) {
            if (resolution === 'clear') {
              diffs.push({
                table: 'transactions',
                recordId: id,
                field: 'status',
                oldValue: 'planned',
                newValue: 'cleared',
                action: 'UPDATE'
              });
              db.prepare('UPDATE transactions SET status = \'cleared\' WHERE id = ? AND deleted_at IS NULL AND status = \'planned\'').run(id);
            } else {
              diffs.push({
                table: 'transactions',
                recordId: id,
                field: 'deleted_at',
                oldValue: null,
                newValue: now,
                action: 'SOFT_DELETE'
              });
              db.prepare('UPDATE transactions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL AND status = \'planned\'').run(now, id);
            }
          }
        }
        break;
      }

      default:
        throw new Error(`Règle d'anomalie inconnue : ${ruleId}`);
    }
  }
}

/**
 * Mode Simulation (Dry-Run) : Calcule le diff exact et simule le post-audit
 * via un SAVEPOINT annulé. ZÉRO octet persisté en base de données.
 */
export function previewHealerPlan(
  db: DatabaseSync,
  plans: HealerActionPlan[],
  referenceMonth?: string
): HealerResult {
  const preAudit = runDoctorAudit(db, referenceMonth);
  const spName = `sp_healer_preview_${crypto.randomUUID().replace(/-/g, '_')}`;
  db.exec(`SAVEPOINT ${spName};`);

  try {
    const diffs: HealerDiffItem[] = [];
    executePlanMutations(db, plans, diffs);
    const postAudit = runDoctorAudit(db, referenceMonth);

    return {
      dryRun: true,
      success: true,
      totalModifications: diffs.length,
      diffs,
      preAudit,
      postAudit
    };
  } finally {
    try {
      db.exec(`ROLLBACK TO ${spName}; RELEASE ${spName};`);
    } catch {
      // Ignorer si libéré
    }
  }
}

/**
 * Mode Application : Exécute les réparations ciblées sous haute sécurité transactionnelle.
 * (Sauvegarde préalable, SAVEPOINT, contre-audit d'intégrité et ROLLBACK automatique).
 */
export function applyHealerPlan(
  db: DatabaseSync,
  plans: HealerActionPlan[],
  referenceMonth?: string,
  options?: { backupDir?: string }
): HealerResult {
  const preAudit = runDoctorAudit(db, referenceMonth);

  // 1. Sauvegarde physique de sécurité préalable
  const backupPath = createHealerBackup(db, options?.backupDir);

  // 2. Transaction sécurisée par SAVEPOINT
  const spName = `sp_healer_apply_${crypto.randomUUID().replace(/-/g, '_')}`;
  db.exec(`SAVEPOINT ${spName};`);

  try {
    const diffs: HealerDiffItem[] = [];
    executePlanMutations(db, plans, diffs);

    // 3. Contre-audit d'intégrité 1 : clés étrangères physiques
    const fkErrors = db.prepare('PRAGMA foreign_key_check').all() as any[];
    if (fkErrors.length > 0) {
      throw new Error(`Contre-audit échoué : ${fkErrors.length} violation(s) de clés étrangères détectée(s) après réparation.`);
    }

    // 4. Contre-audit d'intégrité 2 : runDoctorAudit (zéro nouvelle anomalie bloquante)
    const postAudit = runDoctorAudit(db, referenceMonth);
    const newBlockers = postAudit.anomalies.filter(a => a.severity === 'blocker');
    if (newBlockers.length > 0) {
      throw new Error(`Contre-audit échoué : de nouvelles anomalies bloquantes sont apparues (${newBlockers.map(b => b.id).join(', ')}).`);
    }
    if (postAudit.sqliteIntegrity !== 'ok') {
      throw new Error(`Contre-audit échoué : SQLite quick_check a retourné : ${postAudit.sqliteIntegrity}`);
    }

    // 5. Validation finale et libération de la transaction
    db.exec(`RELEASE ${spName};`);

    return {
      dryRun: false,
      success: true,
      backupPath,
      totalModifications: diffs.length,
      diffs,
      preAudit,
      postAudit
    };
  } catch (err: any) {
    db.exec(`ROLLBACK TO ${spName}; RELEASE ${spName};`);
    throw err;
  }
}
