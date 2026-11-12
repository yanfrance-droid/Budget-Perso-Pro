import type { RecurrenceTemplate, Transaction } from '../db/database';

export interface IntegrityItem {
  templateId: string;
  label: string;
  amount: number;
  recurrenceDay: number;
  type: 'fixed_expense' | 'variable_expense' | 'income';
  accountId: string;
}

export interface SectionIntegrity {
  type: 'fixed_expense' | 'variable_expense' | 'income';
  title: string;
  totalExpected: number;
  totalFound: number;
  missingCount: number;
  missingAmount: number;
  missingItems: IntegrityItem[];
  acceptedCount: number;
  acceptedItems: IntegrityItem[];
  isFullyCompliant: boolean;
}

export interface ContractIntegrityReport {
  month: string;
  totalExpected: number;
  totalFound: number;
  totalMissing: number;
  totalMissingAmount: number;
  totalAccepted: number;
  isFullyCompliant: boolean;
  sections: {
    fixedExpenses: SectionIntegrity;
    variableExpenses: SectionIntegrity;
    incomes: SectionIntegrity;
  };
}

/**
 * Détermine si un template récurrent est contractuellement actif et applicable à un mois donné (YYYY-MM).
 */
export function isTemplateActiveForMonth(tmpl: RecurrenceTemplate, month: string): boolean {
  if (!tmpl.isActive) return false;

  const start = tmpl.startDate ? tmpl.startDate.slice(0, 7) : '';
  if (start && start > month) return false;

  const end = tmpl.endDate ? tmpl.endDate.slice(0, 7) : '';
  if (end && end < month) return false;

  const contractEnd = (tmpl as any).contract_end_date ? (tmpl as any).contract_end_date.slice(0, 7) : '';
  if (contractEnd && contractEnd < month) return false;

  if (tmpl.disabledFromMonth && tmpl.disabledFromMonth <= month) return false;

  return true;
}

/**
 * Calcule l'audit d'intégrité contractuelle granulaire par rubrique pour un mois donné.
 * Gère les exceptions acceptées par arbitrage utilisateur (clé: `${templateId}_${month}`).
 */
export function computeContractIntegrity(
  templates: RecurrenceTemplate[],
  transactions: Transaction[],
  month: string,
  acceptedExceptions: Record<string, boolean> | Set<string> | string[] = []
): ContractIntegrityReport {
  // Normalisation des exceptions acceptées
  const exceptionsSet = new Set<string>();
  if (Array.isArray(acceptedExceptions)) {
    acceptedExceptions.forEach(k => exceptionsSet.add(k));
  } else if (acceptedExceptions instanceof Set) {
    acceptedExceptions.forEach(k => exceptionsSet.add(k));
  } else if (acceptedExceptions && typeof acceptedExceptions === 'object') {
    Object.entries(acceptedExceptions).forEach(([k, v]) => {
      if (v) exceptionsSet.add(k);
    });
  }

  // Filtrer les transactions valides du mois (non soft-deleted)
  const monthTransactions = transactions.filter(tx => 
    tx.date && tx.date.startsWith(month) && !tx.deleted_at
  );

  const existingTemplateIds = new Set(
    monthTransactions
      .map(tx => tx.templateId)
      .filter((id): id is string => Boolean(id))
  );

  const processSection = (
    type: 'fixed_expense' | 'variable_expense' | 'income',
    title: string
  ): SectionIntegrity => {
    const sectionTemplates = templates.filter(t => t.type === type && isTemplateActiveForMonth(t, month));
    
    let totalFound = 0;
    const missingItems: IntegrityItem[] = [];
    const acceptedItems: IntegrityItem[] = [];

    for (const tmpl of sectionTemplates) {
      // 1. Recherche par templateId direct
      let hasOccurrence = existingTemplateIds.has(tmpl.id);

      // 2. Recherche de secours par correspondance stricte label + recurrenceDay + accountId
      if (!hasOccurrence) {
        hasOccurrence = monthTransactions.some(tx =>
          tx.type === type &&
          tx.accountId === tmpl.accountId &&
          tx.recurrenceDay === tmpl.recurrenceDay &&
          (tx.label || '').trim().toLowerCase() === (tmpl.label || '').trim().toLowerCase()
        );
      }

      if (hasOccurrence) {
        totalFound++;
      } else {
        const item: IntegrityItem = {
          templateId: tmpl.id,
          label: tmpl.label || 'Sans libellé',
          amount: Math.abs(Number(tmpl.amount) || 0),
          recurrenceDay: Number(tmpl.recurrenceDay) || 1,
          type,
          accountId: tmpl.accountId
        };

        const exceptionKey = `${tmpl.id}_${month}`;
        if (exceptionsSet.has(exceptionKey)) {
          acceptedItems.push(item);
        } else {
          missingItems.push(item);
        }
      }
    }

    const missingCount = missingItems.length;
    const missingAmount = missingItems.reduce((sum, item) => sum + item.amount, 0);
    const acceptedCount = acceptedItems.length;
    const totalExpected = sectionTemplates.length;

    return {
      type,
      title,
      totalExpected,
      totalFound,
      missingCount,
      missingAmount,
      missingItems,
      acceptedCount,
      acceptedItems,
      isFullyCompliant: missingCount === 0
    };
  };

  const fixedExpenses = processSection('fixed_expense', 'Charges fixes');
  const variableExpenses = processSection('variable_expense', 'Variables récurrentes');
  const incomes = processSection('income', 'Revenus récurrents');

  const totalExpected = fixedExpenses.totalExpected + variableExpenses.totalExpected + incomes.totalExpected;
  const totalFound = fixedExpenses.totalFound + variableExpenses.totalFound + incomes.totalFound;
  const totalMissing = fixedExpenses.missingCount + variableExpenses.missingCount + incomes.missingCount;
  const totalMissingAmount = fixedExpenses.missingAmount + variableExpenses.missingAmount + incomes.missingAmount;
  const totalAccepted = fixedExpenses.acceptedCount + variableExpenses.acceptedCount + incomes.acceptedCount;

  return {
    month,
    totalExpected,
    totalFound,
    totalMissing,
    totalMissingAmount,
    totalAccepted,
    isFullyCompliant: totalMissing === 0,
    sections: {
      fixedExpenses,
      variableExpenses,
      incomes
    }
  };
}
