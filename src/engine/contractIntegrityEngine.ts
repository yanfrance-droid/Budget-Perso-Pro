import type { RecurrenceTemplate, Transaction } from '../db/database';

export interface IntegrityItem {
  templateId: string;
  label: string;
  amount: number;
  recurrenceDay: number;
  type: 'fixed_expense' | 'variable_expense' | 'income';
  accountId: string;
}

export interface DuplicateIntegrityItem {
  templateId?: string;
  label: string;
  amount: number;
  recurrenceDay: number;
  type: 'fixed_expense' | 'variable_expense' | 'income';
  count: number;
  transactionIds: string[];
  dates: string[];
}

export interface SectionIntegrity {
  type: 'fixed_expense' | 'variable_expense' | 'income';
  title: string;
  totalExpected: number;
  totalFound: number;
  totalTransactionsCount: number;
  missingCount: number;
  missingAmount: number;
  missingItems: IntegrityItem[];
  duplicateCount: number;
  duplicateItems: DuplicateIntegrityItem[];
  surplusCount: number;
  acceptedCount: number;
  acceptedItems: IntegrityItem[];
  isFullyCompliant: boolean;
}

export interface ContractIntegrityReport {
  month: string;
  totalExpected: number;
  totalFound: number;
  totalTransactionsCount: number;
  totalMissing: number;
  totalMissingAmount: number;
  totalDuplicates: number;
  totalSurplus: number;
  totalAccepted: number;
  isFullyCompliant: boolean;
  sections: {
    fixedExpenses: SectionIntegrity;
    variableExpenses: SectionIntegrity;
    incomes: SectionIntegrity;
  };
}

/**
 * Normalise un libellé (minuscules, sans espaces superflus, sans ponctuation finale).
 */
export function normalizeContractLabel(label?: string | null): string {
  return (label || '')
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, '');
}

/**
 * Détermine si deux transactions actives constituent un doublon :
 * a) Même templateId non nul, OU
 * b) Même libellé normalisé, même montant absolu et même date ou jour d'échéance.
 */
export function isDuplicateTransactionPair(a: Transaction, b: Transaction): boolean {
  if (a.id === b.id) return false;

  // Règle a : même templateId non nul
  if (a.templateId && b.templateId && a.templateId === b.templateId) {
    return true;
  }

  // Règle b : même libellé normalisé, même montant absolu et même date/jour
  const normA = normalizeContractLabel(a.label);
  const normB = normalizeContractLabel(b.label);
  if (normA && normB && normA === normB) {
    const amountA = Math.abs(Number(a.amount) || 0);
    const amountB = Math.abs(Number(b.amount) || 0);
    if (Math.abs(amountA - amountB) < 0.005) {
      const sameDate = Boolean(a.date && b.date && a.date === b.date);
      const dayA = Number(a.recurrenceDay) || (a.date ? Number(a.date.split('-')[2]) : null);
      const dayB = Number(b.recurrenceDay) || (b.date ? Number(b.date.split('-')[2]) : null);
      const sameDay = dayA !== null && dayB !== null && dayA === dayB;
      if (sameDate || sameDay) {
        return true;
      }
    }
  }

  return false;
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
 * Gère la fidélité historique (23/23) et la détection hybride des doublons (templateId ou libellé+montant+date).
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

  const processSection = (
    type: 'fixed_expense' | 'variable_expense' | 'income',
    title: string
  ): SectionIntegrity => {
    const sectionTemplates = templates.filter(t => t.type === type && isTemplateActiveForMonth(t, month));

    // Filtrer les transactions contractuelles pertinentes :
    // - Pour fixed_expense : toute transaction active de type fixed_expense est contractuelle.
    // - Pour variable_expense et income : seules les transactions ayant un templateId OU un recurrenceDay non nul sont contractuelles.
    //   Les débits purement ponctuels (ex: Gazoil 32,76 €) ou rentrées exceptionnelles (ex: Rentrée d'épargne 1 860,58 €) sans recurrenceDay sont exclus.
    const contractualTxs = monthTransactions.filter(tx => {
      if (tx.type !== type || tx.status === 'disabled') return false;
      if (type === 'fixed_expense') return true;
      return Boolean(tx.templateId || tx.recurrenceDay);
    });

    // 1. Détection universelle des doublons par composantes connexes
    const duplicateGroups: Transaction[][] = [];
    const visited = new Set<string>();

    for (let i = 0; i < contractualTxs.length; i++) {
      const txA = contractualTxs[i];
      if (visited.has(txA.id)) continue;

      const group: Transaction[] = [txA];
      visited.add(txA.id);

      for (let j = i + 1; j < contractualTxs.length; j++) {
        const txB = contractualTxs[j];
        if (visited.has(txB.id)) continue;

        if (isDuplicateTransactionPair(txA, txB)) {
          group.push(txB);
          visited.add(txB.id);
        }
      }

      if (group.length > 1) {
        duplicateGroups.push(group);
      }
    }

    const extraneousDuplicateIds = new Set<string>();
    const duplicateItems: DuplicateIntegrityItem[] = [];
    let duplicateCount = 0;

    for (const group of duplicateGroups) {
      const extras = group.length - 1;
      duplicateCount += extras;

      for (let k = 1; k < group.length; k++) {
        extraneousDuplicateIds.add(group[k].id);
      }

      duplicateItems.push({
        templateId: group.find(t => t.templateId)?.templateId,
        label: group[0].label || 'Sans libellé',
        amount: Math.abs(Number(group[0].amount) || 0),
        recurrenceDay: Number(group[0].recurrenceDay) || (group[0].date ? Number(group[0].date.split('-')[2]) : 1),
        type,
        count: group.length,
        transactionIds: group.map(t => t.id),
        dates: Array.from(new Set(group.map(t => t.date).filter(Boolean))) as string[]
      });
    }

    // 2. Appairage des contrats actifs attendus
    let totalExpected = sectionTemplates.length;
    let totalFound = 0;
    const missingItems: IntegrityItem[] = [];
    const acceptedItems: IntegrityItem[] = [];
    const matchedTxIds = new Set<string>();

    for (const tmpl of sectionTemplates) {
      // Chercher une transaction correspondante parmi les candidates non superflues
      const candidate = contractualTxs.find(tx => {
        if (extraneousDuplicateIds.has(tx.id) || matchedTxIds.has(tx.id)) return false;

        // a) Correspondance directe par templateId
        if (tx.templateId && tx.templateId === tmpl.id) return true;

        // b) Correspondance de secours pour transaction détachée (templateId = null)
        if (!tx.templateId) {
          const normTx = normalizeContractLabel(tx.label);
          const normTmpl = normalizeContractLabel(tmpl.label);
          if (normTx && normTmpl && normTx === normTmpl) {
            const amountTx = Math.abs(Number(tx.amount) || 0);
            const amountTmpl = Math.abs(Number(tmpl.amount) || 0);
            if (Math.abs(amountTx - amountTmpl) < 0.005) {
              const dayTx = Number(tx.recurrenceDay) || (tx.date ? Number(tx.date.split('-')[2]) : null);
              const dayTmpl = Number(tmpl.recurrenceDay);
              if (dayTx === null || dayTx === dayTmpl || tx.accountId === tmpl.accountId) {
                return true;
              }
            }
          }
        }
        return false;
      });

      if (candidate) {
        totalFound++;
        matchedTxIds.add(candidate.id);
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

    // 3. Fidélité historique : toute transaction contractuelle active qui n'a pas été appairée
    // à un contrat actif (parce que ce contrat a été résilié sur un mois ultérieur) représente une
    // échéance contractuelle historique légitime. On incrémente totalExpected et totalFound (sauf doublon).
    for (const tx of contractualTxs) {
      if (!matchedTxIds.has(tx.id) && !extraneousDuplicateIds.has(tx.id)) {
        totalExpected++;
        totalFound++;
        matchedTxIds.add(tx.id);
      }
    }

    const totalTransactionsCount = totalFound + duplicateCount;
    const surplusCount = 0; // Les opérations légitimes passées ne sont jamais des surnombres
    const missingCount = missingItems.length;
    const missingAmount = missingItems.reduce((sum, item) => sum + item.amount, 0);
    const acceptedCount = acceptedItems.length;
    const isFullyCompliant = missingCount === 0 && duplicateCount === 0;

    return {
      type,
      title,
      totalExpected,
      totalFound,
      totalTransactionsCount,
      missingCount,
      missingAmount,
      missingItems,
      duplicateCount,
      duplicateItems,
      surplusCount,
      acceptedCount,
      acceptedItems,
      isFullyCompliant
    };
  };

  const fixedExpenses = processSection('fixed_expense', 'Charges fixes');
  const variableExpenses = processSection('variable_expense', 'Variables récurrentes');
  const incomes = processSection('income', 'Revenus récurrents');

  const totalExpected = fixedExpenses.totalExpected + variableExpenses.totalExpected + incomes.totalExpected;
  const totalFound = fixedExpenses.totalFound + variableExpenses.totalFound + incomes.totalFound;
  const totalTransactionsCount = fixedExpenses.totalTransactionsCount + variableExpenses.totalTransactionsCount + incomes.totalTransactionsCount;
  const totalMissing = fixedExpenses.missingCount + variableExpenses.missingCount + incomes.missingCount;
  const totalMissingAmount = fixedExpenses.missingAmount + variableExpenses.missingAmount + incomes.missingAmount;
  const totalDuplicates = fixedExpenses.duplicateCount + variableExpenses.duplicateCount + incomes.duplicateCount;
  const totalSurplus = 0;
  const totalAccepted = fixedExpenses.acceptedCount + variableExpenses.acceptedCount + incomes.acceptedCount;

  return {
    month,
    totalExpected,
    totalFound,
    totalTransactionsCount,
    totalMissing,
    totalMissingAmount,
    totalDuplicates,
    totalSurplus,
    totalAccepted,
    isFullyCompliant: totalMissing === 0 && totalDuplicates === 0,
    sections: {
      fixedExpenses,
      variableExpenses,
      incomes
    }
  };
}
