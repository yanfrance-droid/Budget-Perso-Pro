import { DatabaseSync } from 'node:sqlite';

export type AnomalySeverity = 'info' | 'warning' | 'critical' | 'blocker';

export interface DoctorAnomaly {
  id: string;
  name: string;
  severity: AnomalySeverity;
  count: number;
  description: string;
  remediationPolicy: string;
  affectedIds: string[];
}

export interface DoctorReport {
  status: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  sqliteIntegrity: string;
  totalAnomalies: number;
  anomalies: DoctorAnomaly[];
  metrics: {
    totalActiveTransactions: number;
    totalAccounts: number;
    totalLoans: number;
    totalRecurrenceTemplates: number;
    totalPlannedExpenses: number;
    activeFixedTemplates: number;
    activeIncomeTemplates: number;
    activeVariableTemplates: number;
    inactiveTemplates: number;
  };
}

/**
 * Diagnostic exhaustif et 100 % en lecture seule de la base SQLite Personal Budget Pro.
 * N'exécute STRICTEMENT AUCUNE écriture (INSERT, UPDATE, DELETE, REPLACE, ALTER, DROP).
 * 
 * @param db Instance active DatabaseSync
 * @param referenceMonth Optionnel (par défaut: mois civil local courant 'YYYY-MM')
 */
export function runDoctorAudit(db: DatabaseSync, referenceMonth?: string): DoctorReport {
  const anomalies: DoctorAnomaly[] = [];

  // 1. Vérification de bas niveau de l'intégrité SQLite (PRAGMA quick_check en lecture seule)
  let sqliteIntegrity = 'ok';
  try {
    const quickCheckRow = db.prepare('PRAGMA quick_check(1)').get() as { quick_check?: string } | undefined;
    sqliteIntegrity = quickCheckRow?.quick_check || 'ok';
  } catch (err: any) {
    sqliteIntegrity = `error: ${err.message}`;
  }

  // 2. Détermination du mois de référence (injection paramétrique)
  const currentMonth = referenceMonth || (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  })();

  // ANOM-01 : Split parent orphelin (linkedId introuvable hors prêt/santé)
  const anom01Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND linkedId IS NOT NULL 
      AND linkedId != ''
      AND type NOT IN ('loan_payment', 'health_reimbursement')
      AND linkedId NOT IN (SELECT id FROM transactions WHERE deleted_at IS NULL)
  `).all() as { id: string }[];
  if (anom01Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-01',
      name: 'Transaction enfant/split orpheline',
      severity: 'critical',
      count: anom01Rows.length,
      description: 'Transaction active dont le linkedId pointe vers une transaction parent inexistante ou supprimée.',
      remediationPolicy: 'Dissociation assistée (linkedId = NULL) après sauvegarde transactionnelle.',
      affectedIds: anom01Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-02 : Remboursement santé orphelin
  const anom02Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'health_reimbursement'
      AND linkedId IS NOT NULL 
      AND linkedId != ''
      AND linkedId NOT IN (SELECT id FROM transactions WHERE type = 'health_expense' AND deleted_at IS NULL)
  `).all() as { id: string }[];
  if (anom02Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-02',
      name: 'Remboursement santé orphelin',
      severity: 'warning',
      count: anom02Rows.length,
      description: 'Remboursement santé actif lié à un acte de soin inexistant ou supprimé.',
      remediationPolicy: 'Alerte utilisateur : proposition de dissociation du lien de remboursement.',
      affectedIds: anom02Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-03 : Mensualité de prêt orpheline
  const anom03Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'loan_payment'
      AND linkedId IS NOT NULL 
      AND linkedId != ''
      AND linkedId NOT IN (SELECT id FROM loans)
  `).all() as { id: string }[];
  if (anom03Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-03',
      name: 'Mensualité de crédit orpheline',
      severity: 'critical',
      count: anom03Rows.length,
      description: 'Mensualité de prêt active liée à un prêt inexistant dans la table loans.',
      remediationPolicy: 'Alerte utilisateur : proposition de rattachement à un prêt existant ou conversion en charge simple.',
      affectedIds: anom03Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-04 : Virement interne sans compte destinataire valide
  const anom04Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'transfer'
      AND (destinationAccountId IS NULL OR destinationAccountId = '' OR destinationAccountId NOT IN (SELECT id FROM accounts))
  `).all() as { id: string }[];
  if (anom04Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-04',
      name: 'Virement interne sans compte destinataire valide',
      severity: 'blocker',
      count: anom04Rows.length,
      description: 'Virement interne sans compte destinataire existant. Zéro auto-réparation.',
      remediationPolicy: 'Arbitrage manuel obligatoire de l\'utilisateur (sélection du compte cible).',
      affectedIds: anom04Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-05 : Transaction active sans compte valide
  const anom05Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND accountId NOT IN (SELECT id FROM accounts)
  `).all() as { id: string }[];
  if (anom05Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-05',
      name: 'Transaction orpheline de compte bancaire',
      severity: 'blocker',
      count: anom05Rows.length,
      description: 'Transaction active dont le compte bancaire est inexistant. Zéro réassignation automatique.',
      remediationPolicy: 'Arbitrage manuel obligatoire de l\'utilisateur (sélection du compte cible).',
      affectedIds: anom05Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-06 : Transaction active liée à une catégorie supprimée
  const anom06Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND categoryId IS NOT NULL 
      AND categoryId != ''
      AND categoryId NOT IN (SELECT id FROM categories)
  `).all() as { id: string }[];
  if (anom06Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-06',
      name: 'Transaction liée à une catégorie supprimée',
      severity: 'info',
      count: anom06Rows.length,
      description: 'Transaction active liée à une catégorie qui a été supprimée.',
      remediationPolicy: 'Dissociation assistée (categoryId = NULL) ou réaffectation de catégorie.',
      affectedIds: anom06Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-07 : Transaction active liée à un organisme verseur supprimé
  const anom07Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND payerId IS NOT NULL 
      AND payerId != ''
      AND payerId NOT IN (SELECT id FROM income_payers)
  `).all() as { id: string }[];
  if (anom07Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-07',
      name: 'Transaction liée à un organisme verseur supprimé',
      severity: 'info',
      count: anom07Rows.length,
      description: 'Transaction active liée à un organisme verseur (tiers payeur) supprimé.',
      remediationPolicy: 'Dissociation assistée (payerId = NULL).',
      affectedIds: anom07Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-08 : Transaction active liée à un contrat de récurrence supprimé
  const anom08Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND templateId IS NOT NULL 
      AND templateId != ''
      AND templateId NOT IN (SELECT id FROM recurrence_templates)
  `).all() as { id: string }[];
  if (anom08Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-08',
      name: 'Transaction liée à un modèle de récurrence supprimé',
      severity: 'warning',
      count: anom08Rows.length,
      description: 'Transaction active liée à un contrat inexistant dans recurrence_templates.',
      remediationPolicy: 'Détachement propre (templateId = NULL) pour sceller la transaction.',
      affectedIds: anom08Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-09 : Doublons actifs d'un même contrat dans un même mois
  const anom09Rows = db.prepare(`
    SELECT substr(date, 1, 7) as m, templateId, COUNT(*) as c, GROUP_CONCAT(id) as txIds
    FROM transactions
    WHERE deleted_at IS NULL
      AND templateId IS NOT NULL 
      AND templateId != ''
    GROUP BY m, templateId
    HAVING COUNT(*) > 1
  `).all() as { m: string; templateId: string; c: number; txIds: string }[];
  if (anom09Rows.length > 0) {
    const duplicateTxIds: string[] = [];
    let totalDuplicates = 0;
    for (const row of anom09Rows) {
      totalDuplicates += (row.c - 1);
      if (row.txIds) {
        duplicateTxIds.push(...row.txIds.split(','));
      }
    }
    anomalies.push({
      id: 'ANOM-09',
      name: 'Doublon actif d\'échéance récurrente',
      severity: 'warning',
      count: totalDuplicates,
      description: `${anom09Rows.length} groupe(s) de doublons détecté(s) (plusieurs transactions actives pour le même templateId dans le même mois).`,
      remediationPolicy: 'Proposition de dédoublonnage assisté (conservation de l\'échéance pointée/récente).',
      affectedIds: duplicateTxIds.slice(0, 50)
    });
  }

  // ANOM-10 : Dépense prévisionnelle avec catégorie invalide
  const anom10Rows = db.prepare(`
    SELECT id FROM planned_expenses
    WHERE categoryId IS NOT NULL 
      AND categoryId != ''
      AND categoryId NOT IN (SELECT id FROM categories)
  `).all() as { id: string }[];
  if (anom10Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-10',
      name: 'Dépense prévisionnelle avec catégorie invalide',
      severity: 'info',
      count: anom10Rows.length,
      description: 'Dépense de la wishlist/pense-bête rattachée à une catégorie inexistante.',
      remediationPolicy: 'Dissociation assistée (categoryId = NULL).',
      affectedIds: anom10Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-11 : Palier d'historique de mensualité rattaché à un prêt inexistant
  const anom11Rows = db.prepare(`
    SELECT id FROM loan_payment_history
    WHERE loanId NOT IN (SELECT id FROM loans)
  `).all() as { id: string }[];
  if (anom11Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-11',
      name: 'Palier d\'historique de prêt orphelin',
      severity: 'warning',
      count: anom11Rows.length,
      description: 'Enregistrement d\'historique de mensualité dans loan_payment_history rattaché à un prêt inexistant.',
      remediationPolicy: 'Purge des paliers orphelins sans impact financier.',
      affectedIds: anom11Rows.slice(0, 50).map(r => r.id)
    });
  }

  // ANOM-12 : Capital de prêt négatif ou amortissement excessif
  const anom12Loans = db.prepare(`
    SELECT id FROM loans WHERE remainingCapital < 0
  `).all() as { id: string }[];

  const anom12Amort = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND type = 'loan_payment'
      AND amortizedCapital IS NOT NULL 
      AND (amortizedCapital > ABS(amount) OR amortizedCapital < 0)
  `).all() as { id: string }[];

  const totalAnom12 = anom12Loans.length + anom12Amort.length;
  if (totalAnom12 > 0) {
    const ids = [...anom12Loans.map(l => l.id), ...anom12Amort.map(t => t.id)];
    anomalies.push({
      id: 'ANOM-12',
      name: 'Anomalie de capital ou d\'amortissement de prêt',
      severity: 'critical',
      count: totalAnom12,
      description: `${anom12Loans.length} prêt(s) avec capital négatif et ${anom12Amort.length} mensualité(s) avec amortissement incohérent (négatif ou supérieur au montant).`,
      remediationPolicy: 'Alerte financière et réajustement manuel du tableau d\'amortissement.',
      affectedIds: ids.slice(0, 50)
    });
  }

  // ANOM-13 : Dépense active non pointée dans un mois passé clos
  const anom13Rows = db.prepare(`
    SELECT id FROM transactions
    WHERE deleted_at IS NULL
      AND substr(date, 1, 7) < ?
      AND status = 'planned'
  `).all(currentMonth) as { id: string }[];
  if (anom13Rows.length > 0) {
    anomalies.push({
      id: 'ANOM-13',
      name: 'Dépense active restée au statut prévu dans un mois passé clos',
      severity: 'warning',
      count: anom13Rows.length,
      description: `${anom13Rows.length} transaction(s) active(s) restée(s) 'planned' avant le mois courant (${currentMonth}).`,
      remediationPolicy: 'Alerte temporelle : choix utilisateur assisté (pointer en payé ou purger si caduque).',
      affectedIds: anom13Rows.slice(0, 50).map(r => r.id)
    });
  }

  // Métriques globales de la base
  const countActiveTx = (db.prepare('SELECT COUNT(*) as c FROM transactions WHERE deleted_at IS NULL').get() as { c: number })?.c || 0;
  const countAccounts = (db.prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number })?.c || 0;
  const countLoans = (db.prepare('SELECT COUNT(*) as c FROM loans').get() as { c: number })?.c || 0;
  const countRecurrences = (db.prepare('SELECT COUNT(*) as c FROM recurrence_templates').get() as { c: number })?.c || 0;
  const countPlanned = (db.prepare('SELECT COUNT(*) as c FROM planned_expenses').get() as { c: number })?.c || 0;

  // Ventilation dynamique des contrats récurrents (calcul SQL temps réel)
  const countActiveFixed = (db.prepare("SELECT COUNT(*) as c FROM recurrence_templates WHERE type = 'fixed_expense' AND isActive = 1").get() as { c: number })?.c || 0;
  const countActiveIncome = (db.prepare("SELECT COUNT(*) as c FROM recurrence_templates WHERE type = 'income' AND isActive = 1").get() as { c: number })?.c || 0;
  const countActiveVariable = (db.prepare("SELECT COUNT(*) as c FROM recurrence_templates WHERE type = 'variable_expense' AND isActive = 1").get() as { c: number })?.c || 0;
  const countInactive = (db.prepare("SELECT COUNT(*) as c FROM recurrence_templates WHERE isActive = 0").get() as { c: number })?.c || 0;

  // Calcul du statut global
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  const hasBlockerOrCritical = anomalies.some(a => a.severity === 'blocker' || a.severity === 'critical');
  const hasWarning = anomalies.some(a => a.severity === 'warning');

  if (hasBlockerOrCritical || sqliteIntegrity !== 'ok') {
    status = 'critical';
  } else if (hasWarning) {
    status = 'warning';
  }

  const totalAnomalies = anomalies.reduce((acc, a) => acc + a.count, 0);

  return {
    status,
    timestamp: new Date().toISOString(),
    sqliteIntegrity,
    totalAnomalies,
    anomalies,
    metrics: {
      totalActiveTransactions: countActiveTx,
      totalAccounts: countAccounts,
      totalLoans: countLoans,
      totalRecurrenceTemplates: countRecurrences,
      totalPlannedExpenses: countPlanned,
      activeFixedTemplates: countActiveFixed,
      activeIncomeTemplates: countActiveIncome,
      activeVariableTemplates: countActiveVariable,
      inactiveTemplates: countInactive
    }
  };
}
