import type { Transaction, RecurrenceTemplate, Category } from '../db/database';
import { roundCurrency } from './calculations';

export type AnalysisHorizon = 6 | 12;

export interface FixedContractAnalysis {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  currentAmount: number; // Mois M
  previousAmount: number; // Mois M-1
  diffMvsM1: number; // currentAmount - previousAmount
  diffPercentageMvsM1: number; // %
  averageAmount: number; // Moyenne sur les mois actifs
  minAmount: number;
  maxAmount: number;
  hasIncreased: boolean; // Hausse tarifaire détectée
  annualizedImpact: number; // diffMvsM1 * 12 si hausse
  monthlyHistory: Array<{ month: string; amount: number }>;
}

export interface FixedChargesMonthlyPoint {
  month: string; // YYYY-MM
  monthLabel: string;
  totalFixed: number;
  realIncomes: number;
  effortRate: number; // % (totalFixed / realIncomes) * 100
  categoriesBreakdown: Record<string, number>;
}

export interface TariffIncreaseAlert {
  contractId: string;
  contractName: string;
  previousAmount: number;
  newAmount: number;
  increaseAmount: number;
  increasePercentage: number;
  month: string;
  annualImpact: number;
}

export interface VariableEnvelopeAnalysis {
  id: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  currentAllocated: number; // M prévu
  currentConsumed: number; // M réel (cleared)
  currentVariance: number; // currentConsumed - currentAllocated
  currentVarianceRate: number; // %
  averageAllocated: number;
  averageConsumed: number;
  averageDrift: number; // averageConsumed - averageAllocated
  isUnderEstimated: boolean; // Dépassement > 15% sur >= 3 mois consécutifs
  underEstimatedMonths: string[];
  recommendedBudget: number; // Budget suggéré
  seasonalPeaks: Array<{ month: string; amount: number; ratioToAverage: number }>;
  monthlyHistory: Array<{
    month: string;
    allocated: number;
    consumed: number;
    variance: number;
    isOverBudget: boolean;
  }>;
}

export interface VariableChargesMonthlyPoint {
  month: string;
  monthLabel: string;
  totalAllocated: number;
  totalConsumed: number;
  variance: number;
}

export interface ChargesAnalysisResult {
  horizon: AnalysisHorizon;
  referenceMonth: string;
  previousMonth: string;

  // Volet Fixes
  fixedMonthlySeries: FixedChargesMonthlyPoint[];
  fixedContracts: FixedContractAnalysis[];
  tariffIncreases: TariffIncreaseAlert[];
  currentTotalFixed: number;
  currentRealIncomes: number;
  currentEffortRate: number;
  averageEffortRate: number;

  // Volet Variables
  variableMonthlySeries: VariableChargesMonthlyPoint[];
  variableEnvelopes: VariableEnvelopeAnalysis[];
  underEstimatedEnvelopesCount: number;
  totalVariableAllocatedCurrent: number;
  totalVariableConsumedCurrent: number;
  totalVariableVarianceCurrent: number;
}

export interface ChargesAnalysisInput {
  transactions: Transaction[];
  templates?: RecurrenceTemplate[];
  categories?: Category[];
  referenceMonth?: string; // YYYY-MM (par défaut mois actuel)
  horizon?: AnalysisHorizon; // 6 ou 12 (par défaut 12)
}

/**
 * Génère la liste ordonnée des N mois civils consécutifs jusqu'au mois de référence inclus.
 */
export function generateMonthHorizon(referenceMonth: string, horizon: AnalysisHorizon): string[] {
  const [yearStr, monthStr] = referenceMonth.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);

  const months: string[] = [];
  for (let i = horizon - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
  }
  return months;
}

/**
 * Libellé court en français (ex: "nov. 26")
 */
export function formatMonthShortFr(monthStr: string): string {
  const [yearStr, monthNum] = monthStr.split('-');
  const d = new Date(parseInt(yearStr, 10), parseInt(monthNum, 10) - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

/**
 * Libellé long en français (ex: "Novembre 2026")
 */
export function formatMonthLongFr(monthStr: string): string {
  const [yearStr, monthNum] = monthStr.split('-');
  const d = new Date(parseInt(yearStr, 10), parseInt(monthNum, 10) - 1, 1);
  const str = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * MOTEUR PUR D'ANALYSE TEMPORELLE DES CHARGES (FIXES ET VARIABLES)
 * - Calcule le taux d'effort fixe réel sur les rentrées constatées
 * - Détecte les hausses tarifaires ligne par ligne (M vs M-1 vs historique)
 * - Compare prévisionnel vs réel sur les enveloppes variables
 * - Détecte les sous-évaluations structurelles (>15% sur 3 mois) et pics de saisonnalité
 */
export function analyzeCharges({
  transactions = [],
  templates = [],
  categories = [],
  referenceMonth,
  horizon = 12
}: ChargesAnalysisInput): ChargesAnalysisResult {
  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const refMonth = referenceMonth || currentMonthStr;

  const months = generateMonthHorizon(refMonth, horizon);
  const prevMonth = months.length >= 2 ? months[months.length - 2] : refMonth;

  // Map des catégories pour enrichir les noms
  const categoryMap = new Map<string, Category>();
  categories.forEach(c => categoryMap.set(c.id, c));

  // Map des templates par ID
  const templateMap = new Map<string, RecurrenceTemplate>();
  templates.forEach(t => templateMap.set(t.id, t));

  // Filtrer les transactions sur l'horizon
  const startMonth = months[0];
  const endMonth = months[months.length - 1];

  const inHorizonTx = transactions.filter(t => {
    if (!t.date) return false;
    const m = t.date.substring(0, 7);
    return m >= startMonth && m <= endMonth;
  });

  // -------------------------------------------------------------
  // 1. VOLET CHARGES FIXES
  // -------------------------------------------------------------
  const fixedTx = inHorizonTx.filter(t => t.type === 'fixed_expense' && t.status !== 'disabled');
  const clearedIncomesTx = inHorizonTx.filter(t => t.type === 'income' && t.status === 'cleared');

  // Séries mensuelles globales (total fixes, rentrées réelles, taux d'effort)
  const fixedMonthlySeries: FixedChargesMonthlyPoint[] = months.map(m => {
    const mFixed = fixedTx.filter(t => t.date.startsWith(m));
    const mIncomes = clearedIncomesTx.filter(t => t.date.startsWith(m));

    const totalFixed = roundCurrency(mFixed.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));
    const realIncomes = roundCurrency(mIncomes.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));

    const effortRate = realIncomes > 0 
      ? roundCurrency((totalFixed / realIncomes) * 100) 
      : 0;

    const categoriesBreakdown: Record<string, number> = {};
    mFixed.forEach(t => {
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
      const catName = cat?.name || 'Autres';
      categoriesBreakdown[catName] = roundCurrency((categoriesBreakdown[catName] || 0) + (Number(t.amount) || 0));
    });

    return {
      month: m,
      monthLabel: formatMonthShortFr(m),
      totalFixed,
      realIncomes,
      effortRate,
      categoriesBreakdown
    };
  });

  // Analyse contrat par contrat (regroupement par templateId ou label normalisé)
  const fixedContractGroups = new Map<string, {
    id: string;
    name: string;
    categoryId?: string;
    amountsByMonth: Map<string, number>;
  }>();

  fixedTx.forEach(t => {
    const rawName = (t.label || (t as any).description || '').trim();
    const tpl = t.templateId ? templateMap.get(t.templateId) : undefined;
    const resolvedName = rawName || tpl?.label || 'Contrat fixe sans libellé';

    // Clé de regroupement robuste
    const key = t.templateId ? `tpl_${t.templateId}` : resolvedName.toLowerCase();

    if (!fixedContractGroups.has(key)) {
      fixedContractGroups.set(key, {
        id: t.templateId || key,
        name: resolvedName,
        categoryId: t.categoryId || tpl?.categoryId,
        amountsByMonth: new Map<string, number>()
      });
    }

    const group = fixedContractGroups.get(key)!;
    const m = t.date.substring(0, 7);
    const amt = Number(t.amount) || 0;
    group.amountsByMonth.set(m, roundCurrency((group.amountsByMonth.get(m) || 0) + amt));
  });

  const fixedContracts: FixedContractAnalysis[] = [];
  const tariffIncreases: TariffIncreaseAlert[] = [];

  fixedContractGroups.forEach(group => {
    const monthlyHistory = months.map(m => ({
      month: m,
      amount: group.amountsByMonth.get(m) || 0
    }));

    const currentAmount = group.amountsByMonth.get(refMonth) || 0;
    const previousAmount = group.amountsByMonth.get(prevMonth) || 0;

    const diffMvsM1 = roundCurrency(currentAmount - previousAmount);
    const diffPercentageMvsM1 = previousAmount > 0
      ? roundCurrency(((currentAmount - previousAmount) / previousAmount) * 100)
      : (currentAmount > 0 ? 100 : 0);

    const activeAmounts = monthlyHistory.map(h => h.amount).filter(a => a > 0);
    const averageAmount = activeAmounts.length > 0
      ? roundCurrency(activeAmounts.reduce((a, b) => a + b, 0) / activeAmounts.length)
      : 0;

    const minAmount = activeAmounts.length > 0 ? Math.min(...activeAmounts) : 0;
    const maxAmount = activeAmounts.length > 0 ? Math.max(...activeAmounts) : 0;

    // Détection de hausse tarifaire entre M-1 et M :
    // Condition : contrat existait au mois précédent (previousAmount > 0), montant supérieur au mois courant avec seuil significatif >= 0.50 €
    const hasIncreased = previousAmount > 0 && currentAmount > previousAmount && diffMvsM1 >= 0.5;

    const annualizedImpact = hasIncreased ? roundCurrency(diffMvsM1 * 12) : 0;

    if (hasIncreased) {
      tariffIncreases.push({
        contractId: group.id,
        contractName: group.name,
        previousAmount,
        newAmount: currentAmount,
        increaseAmount: diffMvsM1,
        increasePercentage: diffPercentageMvsM1,
        month: refMonth,
        annualImpact: annualizedImpact
      });
    }

    const cat = group.categoryId ? categoryMap.get(group.categoryId) : undefined;

    fixedContracts.push({
      id: group.id,
      name: group.name,
      categoryId: group.categoryId,
      categoryName: cat?.name || 'Sans catégorie',
      currentAmount,
      previousAmount,
      diffMvsM1,
      diffPercentageMvsM1,
      averageAmount,
      minAmount,
      maxAmount,
      hasIncreased,
      annualizedImpact,
      monthlyHistory
    });
  });

  // Tri des contrats : hausses tarifaires en tête, puis par montant courant décroissant
  fixedContracts.sort((a, b) => {
    if (a.hasIncreased !== b.hasIncreased) return a.hasIncreased ? -1 : 1;
    return b.currentAmount - a.currentAmount;
  });

  // Indicateurs de synthèse Fixes
  const currentFixedPoint = fixedMonthlySeries.find(p => p.month === refMonth);
  const currentTotalFixed = currentFixedPoint?.totalFixed || 0;
  const currentRealIncomes = currentFixedPoint?.realIncomes || 0;
  const currentEffortRate = currentFixedPoint?.effortRate || 0;

  const validEffortRates = fixedMonthlySeries.map(p => p.effortRate).filter(r => r > 0);
  const averageEffortRate = validEffortRates.length > 0
    ? roundCurrency(validEffortRates.reduce((a, b) => a + b, 0) / validEffortRates.length)
    : 0;

  // -------------------------------------------------------------
  // 2. VOLET CHARGES VARIABLES (ENVELOPPES)
  // -------------------------------------------------------------
  const variableTx = inHorizonTx.filter(t => t.type === 'variable_expense' && t.status !== 'disabled');

  // Regroupement par enveloppe
  const variableGroups = new Map<string, {
    id: string;
    name: string;
    categoryId?: string;
    templateId?: string;
    templateAmount?: number;
    txByMonth: Map<string, Transaction[]>;
  }>();

  variableTx.forEach(t => {
    const rawName = (t.label || (t as any).description || '').trim();
    const tpl = t.templateId ? templateMap.get(t.templateId) : undefined;
    const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;

    const resolvedName = cat?.name || rawName || tpl?.label || 'Enveloppe variable';
    const key = t.templateId 
      ? `tpl_${t.templateId}` 
      : (t.categoryId ? `cat_${t.categoryId}` : resolvedName.toLowerCase());

    if (!variableGroups.has(key)) {
      variableGroups.set(key, {
        id: key,
        name: resolvedName,
        categoryId: t.categoryId,
        templateId: t.templateId,
        templateAmount: tpl ? Number(tpl.amount) || 0 : undefined,
        txByMonth: new Map<string, Transaction[]>()
      });
    }

    const group = variableGroups.get(key)!;
    const m = t.date.substring(0, 7);
    const arr = group.txByMonth.get(m) || [];
    arr.push(t);
    group.txByMonth.set(m, arr);
  });

  const variableEnvelopes: VariableEnvelopeAnalysis[] = [];

  // Séries mensuelles globales variables (alloué vs consommé)
  const variableMonthlyPointsMap = new Map<string, { totalAllocated: number; totalConsumed: number }>();
  months.forEach(m => variableMonthlyPointsMap.set(m, { totalAllocated: 0, totalConsumed: 0 }));

  variableGroups.forEach(group => {
    const monthlyHistory = months.map(m => {
      const monthTx = group.txByMonth.get(m) || [];

      // Budget alloué :
      // 1. Template amount si disponible
      // 2. Ou somme des transactions de statut 'planned'
      // 3. Ou somme globale du mois si tout a été consommé directement
      let allocated = 0;
      if (group.templateAmount !== undefined && group.templateAmount > 0) {
        allocated = group.templateAmount;
      } else {
        const plannedTx = monthTx.filter(t => t.status === 'planned');
        if (plannedTx.length > 0) {
          allocated = plannedTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        } else {
          // Si aucune transaction planned explicite mais des transactions cleared existent,
          // le budget nominal prévu est déduit de la première transaction ou moyenne
          allocated = monthTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        }
      }
      allocated = roundCurrency(allocated);

      // Réel consommé (transactions pointées / débitées 'cleared')
      const clearedTx = monthTx.filter(t => t.status === 'cleared');
      const consumed = roundCurrency(clearedTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0));

      const variance = roundCurrency(consumed - allocated);
      const isOverBudget = allocated > 0 && consumed > allocated;

      // Cumul pour le graphique global
      const globalPoint = variableMonthlyPointsMap.get(m)!;
      globalPoint.totalAllocated = roundCurrency(globalPoint.totalAllocated + allocated);
      globalPoint.totalConsumed = roundCurrency(globalPoint.totalConsumed + consumed);

      return {
        month: m,
        allocated,
        consumed,
        variance,
        isOverBudget
      };
    });

    const currentPoint = monthlyHistory.find(h => h.month === refMonth) || {
      month: refMonth,
      allocated: 0,
      consumed: 0,
      variance: 0,
      isOverBudget: false
    };

    const currentAllocated = currentPoint.allocated;
    const currentConsumed = currentPoint.consumed;
    const currentVariance = currentPoint.variance;
    const currentVarianceRate = currentAllocated > 0
      ? roundCurrency(((currentConsumed - currentAllocated) / currentAllocated) * 100)
      : 0;

    const activeAllocated = monthlyHistory.map(h => h.allocated).filter(a => a > 0);
    const averageAllocated = activeAllocated.length > 0
      ? roundCurrency(activeAllocated.reduce((a, b) => a + b, 0) / activeAllocated.length)
      : 0;

    const activeConsumed = monthlyHistory.map(h => h.consumed).filter(c => c > 0);
    const averageConsumed = activeConsumed.length > 0
      ? roundCurrency(activeConsumed.reduce((a, b) => a + b, 0) / activeConsumed.length)
      : 0;

    const averageDrift = roundCurrency(averageConsumed - averageAllocated);

    // Détection d'enveloppe structurellement sous-évaluée :
    // Dépassement > 15 % sur 3 mois consécutifs (consumed > 1.15 * allocated)
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let consecutiveMonths: string[] = [];
    let longestConsecutiveMonths: string[] = [];

    monthlyHistory.forEach(h => {
      const isSignificantlyOver = h.allocated > 0 && h.consumed > (1.15 * h.allocated);
      if (isSignificantlyOver) {
        currentConsecutive++;
        consecutiveMonths.push(h.month);
        if (currentConsecutive > maxConsecutive) {
          maxConsecutive = currentConsecutive;
          longestConsecutiveMonths = [...consecutiveMonths];
        }
      } else {
        currentConsecutive = 0;
        consecutiveMonths = [];
      }
    });

    const isUnderEstimated = maxConsecutive >= 3;
    const underEstimatedMonths = isUnderEstimated ? longestConsecutiveMonths : [];

    // Budget suggéré pour absorber la dérive (arrondi au 5 € supérieur)
    const baseTarget = isUnderEstimated && averageConsumed > averageAllocated 
      ? averageConsumed 
      : (currentConsumed > currentAllocated ? currentConsumed : averageConsumed);
    const recommendedBudget = roundCurrency(Math.max(averageAllocated, Math.ceil(baseTarget / 5) * 5));

    // Détection des pics de saisonnalité :
    // Mois où consumed >= 1.4 * averageConsumed ET écart absolu >= 25 €
    const seasonalPeaks: Array<{ month: string; amount: number; ratioToAverage: number }> = [];
    if (averageConsumed > 0) {
      monthlyHistory.forEach(h => {
        if (h.consumed >= 1.4 * averageConsumed && (h.consumed - averageConsumed) >= 25) {
          seasonalPeaks.push({
            month: h.month,
            amount: h.consumed,
            ratioToAverage: roundCurrency(h.consumed / averageConsumed)
          });
        }
      });
    }

    const cat = group.categoryId ? categoryMap.get(group.categoryId) : undefined;

    variableEnvelopes.push({
      id: group.id,
      name: group.name,
      categoryId: group.categoryId,
      categoryName: cat?.name || 'Sans catégorie',
      currentAllocated,
      currentConsumed,
      currentVariance,
      currentVarianceRate,
      averageAllocated,
      averageConsumed,
      averageDrift,
      isUnderEstimated,
      underEstimatedMonths,
      recommendedBudget,
      seasonalPeaks,
      monthlyHistory
    });
  });

  // Tri des enveloppes : sous-évaluées en tête, puis par montant de variance décroissant
  variableEnvelopes.sort((a, b) => {
    if (a.isUnderEstimated !== b.isUnderEstimated) return a.isUnderEstimated ? -1 : 1;
    return b.currentVariance - a.currentVariance;
  });

  // Séries mensuelles globales ordonnées
  const variableMonthlySeries: VariableChargesMonthlyPoint[] = months.map(m => {
    const pt = variableMonthlyPointsMap.get(m)!;
    return {
      month: m,
      monthLabel: formatMonthShortFr(m),
      totalAllocated: pt.totalAllocated,
      totalConsumed: pt.totalConsumed,
      variance: roundCurrency(pt.totalConsumed - pt.totalAllocated)
    };
  });

  const currentVariablePoint = variableMonthlySeries.find(p => p.month === refMonth);
  const totalVariableAllocatedCurrent = currentVariablePoint?.totalAllocated || 0;
  const totalVariableConsumedCurrent = currentVariablePoint?.totalConsumed || 0;
  const totalVariableVarianceCurrent = currentVariablePoint?.variance || 0;
  const underEstimatedEnvelopesCount = variableEnvelopes.filter(e => e.isUnderEstimated).length;

  return {
    horizon,
    referenceMonth: refMonth,
    previousMonth: prevMonth,

    // Fixes
    fixedMonthlySeries,
    fixedContracts,
    tariffIncreases,
    currentTotalFixed,
    currentRealIncomes,
    currentEffortRate,
    averageEffortRate,

    // Variables
    variableMonthlySeries,
    variableEnvelopes,
    underEstimatedEnvelopesCount,
    totalVariableAllocatedCurrent,
    totalVariableConsumedCurrent,
    totalVariableVarianceCurrent,

    // Categories
    categories
  } as any;
}
