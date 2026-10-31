import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getAllAccounts, saveAccount } from './accountService.ts';
import { getAllCategories, saveCategory } from './categoryService.ts';
import { getTransactions, saveTransaction } from './transactionService.ts';
import { getAllLoans, saveLoan } from './loanService.ts';
import { getAllRecurrenceTemplates, saveRecurrenceTemplate } from './recurrenceService.ts';
import { getAllIncomePayers, saveIncomePayer } from './incomePayerService.ts';
import { getAllPlannedExpenses, savePlannedExpense, type PlannedExpenseData } from './plannedExpenseService.ts';
import { 
  getAllLoanCapitalHistory, 
  saveLoanCapitalRecord, 
  validateMonthFormat, 
  validateRecordValues,
  type LoanCapitalRecordData 
} from './loanCapitalHistoryService.ts';

export interface BackupDataPayload {
  version: string;
  exportDate: string;
  appName: string;
  tables: {
    accounts: any[];
    categories: any[];
    transactions: any[];
    loans: any[];
    recurrenceTemplates?: any[];
    incomePayers?: any[];
    plannedExpenses?: any[];
    loanCapitalHistory?: any[];
    loanPaymentHistory?: any[];
  };
  localStorage?: {
    manualBalance?: string;
    card1?: string;
    card2?: string;
    [key: string]: any;
  };
}

export interface MigrationResult {
  success: boolean;
  importedAccounts: number;
  importedCategories: number;
  importedTransactions: number;
  importedLoans: number;
  importedRecurrenceTemplates: number;
  importedIncomePayers: number;
  importedPlannedExpenses: number;
  importedLoanCapitalHistory?: number;
  loanCapitalHistoryStatus: 'preserved' | 'replaced' | 'not_provided';
  dashboardSettings: Record<string, string>;
  safetyBackupPath?: string;
  message: string;
}

export interface ImportOptions {
  skipSafetyBackup?: boolean;
  safetyBackupDir?: string;
  simulateFailureInTransaction?: boolean;
  replaceLoanCapitalHistory?: boolean;
}

/**
 * Crée une copie de sécurité SQLite complète de la base avant tout remplacement.
 */
export function createSafetyBackup(db: DatabaseSync, customDir?: string): string {
  let backupDir = customDir;
  if (!backupDir) {
    const dbPath = process.env.DB_PATH || './data/budget.db';
    if (dbPath === ':memory:') {
      backupDir = path.join(os.tmpdir(), 'budget_safety_backups');
    } else {
      const dbDir = path.dirname(path.resolve(dbPath));
      backupDir = path.join(dbDir, 'backups');
    }
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `budget_safety_restore_${timestamp}.db`;
  const backupFilePath = path.join(backupDir, backupFileName);
  const normalizedPath = backupFilePath.replace(/\\/g, '/');

  db.exec(`VACUUM INTO '${normalizedPath}'`);
  return backupFilePath;
}

/**
 * Valide rigoureusement le fichier de sauvegarde JSON avant toute opération en base.
 */
export function validateBackupPayload(payload: unknown): { isValid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : le payload doit être un objet JSON.' };
  }

  const data = payload as Record<string, any>;

  if (data.appName !== 'PersonalBudgetPro') {
    return {
      isValid: false,
      error: `Format de sauvegarde invalide : application inconnue "${data.appName}". Seules les sauvegardes "PersonalBudgetPro" sont acceptées.`
    };
  }

  const isSupportedVersion = typeof data.version === 'string' && (
    data.version.startsWith('1.') || 
    data.version.startsWith('2.') || 
    data.version === '1.0' || 
    data.version === '1.1' || 
    data.version === '2.0'
  );
  if (!isSupportedVersion) {
    return {
      isValid: false,
      error: `Version de format non prise en charge : "${data.version}". Seules les versions 1.x et 2.x sont supportées.`
    };
  }

  if (!data.exportDate || typeof data.exportDate !== 'string') {
    return { isValid: false, error: 'Date d\'exportation manquante ou invalide.' };
  }

  if (!data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : section "tables" manquante ou invalide.' };
  }

  const tables = data.tables;
  if (!Array.isArray(tables.accounts)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.accounts doit être une liste.' };
  }
  if (!Array.isArray(tables.categories)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.categories doit être une liste.' };
  }
  if (!Array.isArray(tables.transactions)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.transactions doit être une liste.' };
  }
  if (!Array.isArray(tables.loans)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.loans doit être une liste.' };
  }
  if (tables.recurrenceTemplates !== undefined && !Array.isArray(tables.recurrenceTemplates)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.recurrenceTemplates doit être une liste si présente.' };
  }
  if (tables.incomePayers !== undefined && !Array.isArray(tables.incomePayers)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.incomePayers doit être une liste si présente.' };
  }
  if (tables.plannedExpenses !== undefined && !Array.isArray(tables.plannedExpenses)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.plannedExpenses doit être une liste si présente.' };
  }
  if (tables.loanCapitalHistory !== undefined && tables.loanCapitalHistory !== null && !Array.isArray(tables.loanCapitalHistory)) {
    return { isValid: false, error: 'Format de sauvegarde invalide : tables.loanCapitalHistory doit être une liste si présente.' };
  }

  // Vérification de cohérence des comptes
  const accountIds = new Set<string>();
  for (const acc of tables.accounts) {
    if (!acc || typeof acc !== 'object' || !acc.id || !acc.name || !acc.type || !acc.referenceDate) {
      return { isValid: false, error: `Compte invalide dans la sauvegarde : identifiant, nom, type ou date de référence manquant.` };
    }
    if (!['checking', 'savings', 'cash'].includes(acc.type)) {
      return { isValid: false, error: `Type de compte invalide : "${acc.type}" pour le compte "${acc.name}".` };
    }
    accountIds.add(acc.id);
  }

  // Vérification des catégories
  for (const cat of tables.categories) {
    if (!cat || typeof cat !== 'object' || !cat.id || !cat.name || !cat.type) {
      return { isValid: false, error: `Catégorie invalide dans la sauvegarde : identifiant, nom ou type manquant.` };
    }
  }

  // Vérification des crédits et de leur compte associé
  for (const loan of tables.loans) {
    if (!loan || typeof loan !== 'object' || !loan.id || !loan.name || !loan.accountId) {
      return { isValid: false, error: `Crédit/prêt invalide dans la sauvegarde : identifiant, nom ou compte associé manquant.` };
    }
    if (!accountIds.has(loan.accountId)) {
      return { isValid: false, error: `Incohérence de données : le prêt "${loan.name}" (${loan.id}) fait référence à un compte inexistant (${loan.accountId}).` };
    }
  }

  // Vérification des modèles de récurrence
  const recurrenceTemplates = tables.recurrenceTemplates || [];
  for (const tmpl of recurrenceTemplates) {
    if (!tmpl || typeof tmpl !== 'object' || !tmpl.id || !tmpl.type || !tmpl.accountId) {
      return { isValid: false, error: `Modèle de récurrence invalide : identifiant, type ou compte manquant.` };
    }
    if (!accountIds.has(tmpl.accountId)) {
      return { isValid: false, error: `Incohérence de données : le modèle récurrent "${tmpl.label || tmpl.id}" fait référence à un compte inexistant (${tmpl.accountId}).` };
    }
    if (tmpl.destinationAccountId && !accountIds.has(tmpl.destinationAccountId)) {
      return { isValid: false, error: `Incohérence de données : le modèle récurrent "${tmpl.label || tmpl.id}" fait référence à un compte de destination inexistant (${tmpl.destinationAccountId}).` };
    }
  }

  // Vérification des transactions et de l'intégrité référentielle
  for (const tx of tables.transactions) {
    if (!tx || typeof tx !== 'object' || !tx.id || !tx.date || tx.amount === undefined || !tx.status || !tx.accountId) {
      return { isValid: false, error: `Opération invalide dans la sauvegarde : champs obligatoires manquants.` };
    }
    if (!accountIds.has(tx.accountId)) {
      return { isValid: false, error: `Incohérence de données (clé étrangère) : l'opération "${tx.label || tx.id}" (${tx.id}) fait référence à un compte inexistant (${tx.accountId}).` };
    }
    if (tx.destinationAccountId && !accountIds.has(tx.destinationAccountId)) {
      return { isValid: false, error: `Incohérence de données (clé étrangère) : l'opération "${tx.label || tx.id}" fait référence à un compte de destination inexistant (${tx.destinationAccountId}).` };
    }
  }

  // Vérification optionnelle des dépenses prévisionnelles
  if (Array.isArray(tables.plannedExpenses)) {
    for (const pe of tables.plannedExpenses) {
      if (!pe || typeof pe !== 'object' || !pe.id || !pe.label || pe.estimatedAmount === undefined || !pe.urgency) {
        return { isValid: false, error: 'Dépense prévisionnelle invalide dans la sauvegarde : champs obligatoires manquants.' };
      }
    }
  }

  // Vérification optionnelle de l'historique des capitaux de prêts
  if (Array.isArray(tables.loanCapitalHistory)) {
    const seenMonths = new Set<string>();
    for (let i = 0; i < tables.loanCapitalHistory.length; i++) {
      const rec = tables.loanCapitalHistory[i];
      if (!rec || typeof rec !== 'object') {
        return { isValid: false, error: `Historique des capitaux invalide : l'élément #${i + 1} doit être un objet.` };
      }
      try {
        validateMonthFormat(rec.month);
        validateRecordValues(rec);
      } catch (err: any) {
        return { isValid: false, error: `Historique des capitaux invalide pour le mois "${rec?.month || '#' + (i + 1)}" : ${err.message}` };
      }
      if (seenMonths.has(rec.month)) {
        return { isValid: false, error: `Historique des capitaux invalide : doublon détecté pour le mois "${rec.month}".` };
      }
      seenMonths.add(rec.month);
    }
  }

  return { isValid: true };
}

/**
 * Restaure les données JSON dans la base SQLite par REMPLACEMENT INTÉGRAL (sans fusion).
 * 1. Valide le payload.
 * 2. Crée une sauvegarde SQLite de sécurité (VACUUM INTO).
 * 3. Supprime les tables existantes de manière ordonnée (transactions -> recurrence_templates -> loans -> accounts -> categories -> app_settings).
 * 4. Insère les nouvelles données dans l'ordre de dépendance.
 * 5. Préserve strictement les tables users et sessions.
 * 6. Exécute le tout dans une transaction atomique avec rollback complet en cas d'erreur.
 */
export function importBackupData(
  db: DatabaseSync,
  payload: BackupDataPayload,
  options: ImportOptions = {}
): MigrationResult {
  // 1. Validation rigoureuse du payload AVANT toute écriture
  const validation = validateBackupPayload(payload);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Format de sauvegarde invalide.');
  }

  // 2. Création de la sauvegarde SQLite de sécurité AVANT le remplacement
  let safetyBackupPath: string | undefined;
  if (!options.skipSafetyBackup) {
    try {
      safetyBackupPath = createSafetyBackup(db, options.safetyBackupDir);
    } catch (err: any) {
      throw new Error(`Impossible de créer la copie de sécurité SQLite préalable : ${err.message}`);
    }
  }

  const {
    accounts = [],
    categories = [],
    transactions = [],
    loans = [],
    recurrenceTemplates = [],
    incomePayers = [],
    plannedExpenses = [],
    loanCapitalHistory,
    loanPaymentHistory = []
  } = payload.tables;

  // Détermination explicite de la gestion de l'historique des capitaux de prêts :
  // - Si loanCapitalHistory est absent, indéfini, null ou vide [] : on le préserve intégralement par défaut.
  // - Si loanCapitalHistory contient des éléments valides :
  //     * Si options.replaceLoanCapitalHistory === true (décision explicite) : on remplace.
  //     * Sinon : on le préserve pour éviter tout écrasement accidentel.
  const hasHistoryInBackup = Array.isArray(loanCapitalHistory) && loanCapitalHistory.length > 0;
  const shouldReplaceHistory = hasHistoryInBackup && options.replaceLoanCapitalHistory === true;
  let historyStatus: 'preserved' | 'replaced' | 'not_provided' = 'not_provided';

  if (!hasHistoryInBackup) {
    historyStatus = 'preserved';
  } else if (shouldReplaceHistory) {
    historyStatus = 'replaced';
  } else {
    historyStatus = 'preserved';
  }

  // 3. Remplacement dans une transaction atomique IMMEDIATE
  db.exec('BEGIN IMMEDIATE;');
  try {
    // 3a. Suppression des données existantes (du bas vers le haut pour respecter les FK)
    db.exec('DELETE FROM transactions;');
    db.exec('DELETE FROM recurrence_templates;');
    try {
      db.exec('DELETE FROM loan_payment_history;');
    } catch {
      // Si la table n'existe pas encore
    }
    db.exec('DELETE FROM loans;');
    db.exec('DELETE FROM accounts;');
    db.exec('DELETE FROM categories;');
    db.exec('DELETE FROM income_payers;');
    db.exec('DELETE FROM planned_expenses;');
    db.exec('DELETE FROM app_settings;');
    // NOTE : users et sessions ne sont intentionnellement PAS supprimés pour préserver le compte d'administration

    // Suppression conditionnelle et explicite de l'historique des capitaux uniquement si demandé
    if (shouldReplaceHistory) {
      db.exec('DELETE FROM loan_capital_history;');
    }

    // Simulation d'erreur pour tester le rollback
    if (options.simulateFailureInTransaction) {
      throw new Error('Erreur simulée au sein de la transaction pour test de rollback.');
    }

    // 3b. Réinsertion ordonnée (du haut vers le bas)
    // 0. Organismes verseurs
    for (const payer of incomePayers) {
      saveIncomePayer(db, payer);
    }

    // 1. Catégories
    for (const cat of categories) {
      saveCategory(db, cat);
    }

    // 2. Comptes
    for (const acc of accounts) {
      saveAccount(db, acc);
    }

    // 3. Crédits et Prêts
    for (const loan of loans) {
      saveLoan(db, loan);
    }

    // 3b. Historique des mensualités de crédits
    if (Array.isArray(loanPaymentHistory) && loanPaymentHistory.length > 0) {
      // Nettoyer les paliers temporaires réinitialisés par saveLoan ci-dessus pour restaurer fidèlement l'historique exporté
      try {
        db.exec('DELETE FROM loan_payment_history;');
      } catch {
        // Ignorer si la table n'existe pas encore
      }
      for (const h of loanPaymentHistory) {
        try {
          db.prepare(`
            INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, previousPayment, notes, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              effectiveMonth = excluded.effectiveMonth,
              monthlyPayment = excluded.monthlyPayment,
              previousPayment = excluded.previousPayment,
              notes = excluded.notes
          `).run(
            h.id || crypto.randomUUID(),
            h.loanId,
            h.effectiveMonth,
            Number(h.monthlyPayment),
            h.previousPayment !== undefined && h.previousPayment !== null ? Number(h.previousPayment) : null,
            h.notes || null,
            h.createdAt || new Date().toISOString()
          );
        } catch {
          // Si table absente
        }
      }
    }

    // 4. Modèles de récurrence
    for (const tmpl of recurrenceTemplates) {
      saveRecurrenceTemplate(db, tmpl);
    }

    // 5. Transactions
    for (const tx of transactions) {
      saveTransaction(db, tx);
    }

    // 5b. Dépenses prévisionnelles
    for (const pe of plannedExpenses) {
      savePlannedExpense(db, pe);
    }

    // 5c. Historique des capitaux de prêts (si remplacement explicitement demandé)
    let importedLoanCapitalHistoryCount = 0;
    if (shouldReplaceHistory && Array.isArray(loanCapitalHistory)) {
      for (const rec of loanCapitalHistory) {
        saveLoanCapitalRecord(db, rec);
        importedLoanCapitalHistoryCount++;
      }
    }

    // 6. Réglages applicatifs & Dashboard
    const settings: Record<string, string> = {};
    const local = payload.localStorage || {};
    const stmt = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

    const manualBalance = local.manualBalance !== undefined ? String(local.manualBalance) : '0';
    const card1 = local.card1 !== undefined ? String(local.card1) : '0';
    const card2 = local.card2 !== undefined ? String(local.card2) : '0';

    stmt.run('manualBalance', manualBalance);
    settings.manualBalance = manualBalance;
    stmt.run('card1', card1);
    settings.card1 = card1;
    stmt.run('card2', card2);
    settings.card2 = card2;

    for (const [k, v] of Object.entries(local)) {
      if (!['manualBalance', 'card1', 'card2'].includes(k) && v !== undefined) {
        stmt.run(k, String(v));
        settings[k] = String(v);
      }
    }

    db.exec('COMMIT;');

    return {
      success: true,
      importedAccounts: accounts.length,
      importedCategories: categories.length,
      importedTransactions: transactions.length,
      importedLoans: loans.length,
      importedRecurrenceTemplates: recurrenceTemplates.length,
      importedIncomePayers: incomePayers.length,
      importedPlannedExpenses: plannedExpenses.length,
      importedLoanCapitalHistory: importedLoanCapitalHistoryCount,
      loanCapitalHistoryStatus: historyStatus,
      dashboardSettings: settings,
      safetyBackupPath,
      message: 'Remplacement intégral et restauration des données effectués avec succès dans la base centrale SQLite.'
    };
  } catch (err: any) {
    db.exec('ROLLBACK;');
    throw new Error(`Échec de la restauration (Rollback complet effectué, données d'origine préservées) : ${err.message}`);
  }
}

/**
 * Exporte l'intégralité des données présentes dans SQLite au format JSON PersonalBudgetPro.
 */
export function exportBackupData(db: DatabaseSync): BackupDataPayload {
  const accounts = getAllAccounts(db);
  const categories = getAllCategories(db);
  const transactions = getTransactions(db);
  const loans = getAllLoans(db);
  const recurrenceTemplates = getAllRecurrenceTemplates(db);
  const incomePayers = getAllIncomePayers(db);
  const plannedExpenses = getAllPlannedExpenses(db);
  const loanCapitalHistory = getAllLoanCapitalHistory(db);

  let loanPaymentHistory: any[] = [];
  try {
    loanPaymentHistory = db.prepare('SELECT * FROM loan_payment_history ORDER BY loanId, effectiveMonth ASC').all();
  } catch {
    // Si la table n'existe pas encore
  }

  const settingsStmt = db.prepare('SELECT key, value FROM app_settings');
  const settingsRows = settingsStmt.all() as { key: string; value: string }[];
  const settingsMap = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    appName: 'PersonalBudgetPro',
    tables: {
      accounts,
      categories,
      transactions,
      loans,
      recurrenceTemplates,
      incomePayers,
      plannedExpenses,
      loanCapitalHistory,
      loanPaymentHistory
    },
    localStorage: {
      manualBalance: settingsMap.manualBalance || '0',
      card1: settingsMap.card1 || '0',
      card2: settingsMap.card2 || '0',
      ...settingsMap
    }
  };
}
