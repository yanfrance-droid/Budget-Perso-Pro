import type { Account, Category, Transaction, Loan, RecurrenceTemplate, IncomePayer, PlannedExpense } from '../db/database';

export interface BackupTables {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  loans: Loan[];
  recurrenceTemplates?: RecurrenceTemplate[];
  incomePayers?: IncomePayer[];
  plannedExpenses?: PlannedExpense[];
  loanPaymentHistory?: any[];
}

export interface BackupLocalStorage {
  manualBalance?: string;
  card1?: string;
  card2?: string;
}

export interface BackupDataV1 {
  version: '1.0' | '1.1' | '2.0';
  exportDate: string;
  appName: 'PersonalBudgetPro';
  tables: BackupTables;
  localStorage: BackupLocalStorage;
}

export interface BackupSummary {
  version: string;
  exportDate: string;
  accountsCount: number;
  categoriesCount: number;
  transactionsCount: number;
  loansCount: number;
  recurrenceTemplatesCount?: number;
  plannedExpensesCount?: number;
  manualBalance: string;
  card1: string;
  card2: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  summary?: BackupSummary;
  data?: BackupDataV1;
}

export interface StorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Déclenche le téléchargement du fichier JSON dans le navigateur.
 */
export function triggerBackupDownload(backupData: BackupDataV1, filename?: string): void {
  const jsonString = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const actualFilename = filename || `personal_budget_backup_${dateStr}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = actualFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Valide rigoureusement le contenu d'un fichier de sauvegarde JSON.
 */
export function validateBackupData(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, error: 'Le fichier ne contient pas un objet JSON valide.' };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.appName !== 'PersonalBudgetPro') {
    return { 
      isValid: false, 
      error: 'Ce fichier n\'est pas une sauvegarde Personal Budget Pro (appName invalide).' 
    };
  }

  if (obj.version !== '1.0' && obj.version !== '1.1' && obj.version !== '2.0') {
    return { 
      isValid: false, 
      error: `Version de format non prise en charge : "${obj.version}". Seules les versions "1.0", "1.1" et "2.0" sont supportées.` 
    };
  }

  if (!obj.exportDate || typeof obj.exportDate !== 'string') {
    return { isValid: false, error: 'Date d\'exportation manquante ou invalide.' };
  }

  if (!obj.tables || typeof obj.tables !== 'object' || Array.isArray(obj.tables)) {
    return { isValid: false, error: 'La section des tables ("tables") est absente ou invalide.' };
  }

  const tables = obj.tables as Record<string, unknown>;

  if (!Array.isArray(tables.accounts)) {
    return { isValid: false, error: 'La table "accounts" doit être une liste.' };
  }
  if (!Array.isArray(tables.categories)) {
    return { isValid: false, error: 'La table "categories" doit être une liste.' };
  }
  if (!Array.isArray(tables.transactions)) {
    return { isValid: false, error: 'La table "transactions" doit être une liste.' };
  }
  if (!Array.isArray(tables.loans)) {
    return { isValid: false, error: 'La table "loans" doit être une liste.' };
  }

  // Vérification de cohérence minimale sur les identifiants
  for (const acc of tables.accounts as unknown[]) {
    if (!acc || typeof acc !== 'object' || !('id' in acc) || !acc.id) {
      return { isValid: false, error: 'Un ou plusieurs comptes possèdent un identifiant manquant.' };
    }
  }
  for (const cat of tables.categories as unknown[]) {
    if (!cat || typeof cat !== 'object' || !('id' in cat) || !cat.id) {
      return { isValid: false, error: 'Une ou plusieurs catégories possèdent un identifiant manquant.' };
    }
  }
  for (const tx of tables.transactions as unknown[]) {
    if (!tx || typeof tx !== 'object' || !('id' in tx) || !tx.id) {
      return { isValid: false, error: 'Une ou plusieurs opérations possèdent un identifiant manquant.' };
    }
  }
  for (const loan of tables.loans as unknown[]) {
    if (!loan || typeof loan !== 'object' || !('id' in loan) || !loan.id) {
      return { isValid: false, error: 'Un ou plusieurs crédits possèdent un identifiant manquant.' };
    }
  }

  if (tables.recurrenceTemplates !== undefined) {
    if (!Array.isArray(tables.recurrenceTemplates)) {
      return { isValid: false, error: 'La table "recurrenceTemplates" doit être une liste.' };
    }
    for (const tpl of tables.recurrenceTemplates as unknown[]) {
      if (!tpl || typeof tpl !== 'object' || !('id' in tpl) || !tpl.id) {
        return { isValid: false, error: 'Un ou plusieurs modèles récurrents possèdent un identifiant manquant.' };
      }
    }
  }

  if (tables.plannedExpenses !== undefined) {
    if (!Array.isArray(tables.plannedExpenses)) {
      return { isValid: false, error: 'La table "plannedExpenses" doit être une liste.' };
    }
    for (const pe of tables.plannedExpenses as unknown[]) {
      if (!pe || typeof pe !== 'object' || !('id' in pe) || !pe.id) {
        return { isValid: false, error: 'Une ou plusieurs dépenses prévisionnelles possèdent un identifiant manquant.' };
      }
    }
  }

  const local = (obj.localStorage && typeof obj.localStorage === 'object' && !Array.isArray(obj.localStorage))
    ? (obj.localStorage as Record<string, unknown>)
    : {};

  const summary: BackupSummary = {
    version: String(obj.version),
    exportDate: String(obj.exportDate),
    accountsCount: tables.accounts.length,
    categoriesCount: tables.categories.length,
    transactionsCount: tables.transactions.length,
    loansCount: tables.loans.length,
    recurrenceTemplatesCount: Array.isArray(tables.recurrenceTemplates) ? tables.recurrenceTemplates.length : 0,
    plannedExpensesCount: Array.isArray(tables.plannedExpenses) ? tables.plannedExpenses.length : 0,
    manualBalance: String(local.manualBalance ?? '0'),
    card1: String(local.card1 ?? '0'),
    card2: String(local.card2 ?? '0')
  };

  const validatedData: BackupDataV1 = {
    version: obj.version as '1.0' | '1.1' | '2.0',
    exportDate: String(obj.exportDate),
    appName: 'PersonalBudgetPro',
    tables: {
      accounts: tables.accounts as Account[],
      categories: tables.categories as Category[],
      transactions: tables.transactions as Transaction[],
      loans: tables.loans as Loan[],
      recurrenceTemplates: (tables.recurrenceTemplates as RecurrenceTemplate[]) || [],
      incomePayers: (tables.incomePayers as IncomePayer[]) || [],
      plannedExpenses: (tables.plannedExpenses as PlannedExpense[]) || [],
      loanPaymentHistory: Array.isArray(tables.loanPaymentHistory) ? tables.loanPaymentHistory : []
    },
    localStorage: {
      manualBalance: String(local.manualBalance ?? '0'),
      card1: String(local.card1 ?? '0'),
      card2: String(local.card2 ?? '0')
    }
  };

  return {
    isValid: true,
    summary,
    data: validatedData
  };
}
