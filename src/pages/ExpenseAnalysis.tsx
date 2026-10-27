import React, { useState, useMemo } from 'react';
import type { Transaction } from '../db/database';
import { Button, StatusBadgeSelect } from '../components/ui/Components';
import { 
  Filter, 
  ChevronDown, 
  ChevronRight, 
  RotateCcw, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  ChevronsDown, 
  ChevronsUp,
  CreditCard,
  Clock,
  CalendarCheck,
  WalletCards,
  CheckCircle2,
  BarChart2,
  TrendingUp,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  Cell 
} from 'recharts';

import { PAYMENT_METHODS } from './CurrentExpenses';

const EXPENSE_ANALYSIS_STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

type SortField = 'date' | 'amount' | 'label';
type SortOrder = 'asc' | 'desc';
type CategorySortField = 'name' | 'amount' | 'count';
type ActiveChartTab = 'category' | 'history12' | 'paymentMethod' | 'categoryHistory12' | 'paymentHistory12';

// Palette de couleurs hautement contrastées et distinctives pour les catégories (sans rouge)
const CATEGORY_CHART_COLORS = [
  '#2563eb', // Bleu roi vif
  '#16a34a', // Vert prairie franc
  '#d97706', // Ambre / Ocre chaud
  '#7c3aed', // Violet profond
  '#06b6d4', // Turquoise / Cyan éclatant
  '#ec4899', // Rose fuchsia
  '#84cc16', // Vert lime acide
  '#8b5cf6', // Indigo lavande
  '#f59e0b', // Jaune doré / Miel
  '#0d9488', // Sarcelle / Vert d'eau foncé
  '#a855f7', // Pourpre magenta
  '#64748b', // Gris ardoise bleuté
  '#0284c7', // Bleu azur
  '#65a30d', // Vert olive vif
  '#c026d3', // Violet fuchsia
  '#3b82f6'  // Bleu cobalt
];

// Palette de couleurs distinctives pour les moyens de paiement
export const PAYMENT_METHOD_COLORS: Record<string, string> = {
  'Carte bancaire': '#2563eb',          // Bleu royal
  'Virement': '#0891b2',                // Cyan / Turquoise
  'Prélèvement automatique': '#4f46e5', // Indigo
  'Espèces': '#16a34a',                 // Vert
  'Chèque': '#d97706',                  // Orange ambré
  'PayPal': '#0284c7',                  // Bleu ciel
  'Paiement mobile': '#9333ea',         // Violet pourpre
  'Autre': '#e11d48',                   // Rouge framboise
  'Non spécifié': '#64748b'             // Gris ardoise
};

export interface HistoryTooltipPayload {
  monthKey: string;
  monthLabel: string;
  isCurrentMonth: boolean;
  cleared: number;
  pending: number;
  planned: number;
  monthTotal: number;
  totalVisible: number;
}

export function History12TooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ payload: HistoryTooltipPayload }> }) {
  if (!active || !payload || !payload.length) return null;
  const monthData = payload[0].payload;
  const formatCurrency = (val: number) => {
    return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  };

  return (
    <div 
      data-testid="history12-tooltip"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        padding: '0.65rem 0.85rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        fontSize: '0.785rem',
        minWidth: '200px'
      }}
    >
      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.25rem' }}>
        Mois : {monthData.monthKey} {monthData.isCurrentMonth ? '(Mois en cours *)' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', color: '#1e40af' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#2563eb' }}></span>
            <span>Débité :</span>
          </span>
          <span data-testid="tooltip-cleared-amount" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(monthData.cleared)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', color: '#b45309' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#d97706' }}></span>
            <span>En attente :</span>
          </span>
          <span data-testid="tooltip-pending-amount" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(monthData.pending)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', color: '#7e22ce' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#9333ea' }}></span>
            <span>Prévu :</span>
          </span>
          <span data-testid="tooltip-planned-amount" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(monthData.planned)}
          </span>
        </div>
        <div style={{ 
          marginTop: '0.35rem', 
          paddingTop: '0.35rem', 
          borderTop: '1px solid #e2e8f0', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '1rem', 
          fontWeight: 800, 
          color: '#0f172a' 
        }}>
          <span>TOTAL DU MOIS :</span>
          <span data-testid="tooltip-total-amount" style={{ fontVariantNumeric: 'tabular-nums', color: '#047857', fontSize: '0.85rem' }}>
            {formatCurrency(monthData.monthTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useServerDataOptional } from '../contexts/ServerDataContext';

export default function ExpenseAnalysis() {
  const serverData = useServerDataOptional();
  const expenses = serverData ? serverData.transactions.filter(t => t.type === 'daily') : [];
  const categories = serverData ? serverData.categories.filter(c => c.type === 'daily') : [];
  const accounts = serverData ? serverData.accounts : [];

  // 2. États de filtrage
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [periodMode, setPeriodMode] = useState<'month' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [startDate, setStartDate] = useState<string>(`${currentMonthStr}-01`);
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return `${currentMonthStr}-${String(lastDay).padStart(2, '0')}`;
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 3. États de tri
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [categorySortField, setCategorySortField] = useState<CategorySortField>('name');
  const [categorySortOrder, setCategorySortOrder] = useState<SortOrder>('asc');

  // 4. États de repliement des catégories (repliées par défaut)
  // undefined => repliée par défaut ; true => repliée ; false => dépliée
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // 5. États d'affichage des graphiques
  const [showCharts, setShowCharts] = useState<boolean>(true);
  const [activeChartTab, setActiveChartTab] = useState<ActiveChartTab>('category');
  // Séries d'évolution mensuelle par statut (3 séries affichées par défaut dès l'ouverture, désactivables individuellement)
  const [showClearedInHistory, setShowClearedInHistory] = useState<boolean>(true);
  const [showPendingInHistory, setShowPendingInHistory] = useState<boolean>(true);
  const [showPlannedInHistory, setShowPlannedInHistory] = useState<boolean>(true);

  // Filtre par moyen de paiement ('' = Tous, '__unspecified__' = Non spécifié, ou valeur exacte)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');

  // Séries d'évolution mensuelle par catégorie (visibilité par catégorie)
  const [hiddenCategoriesInHistory, setHiddenCategoriesInHistory] = useState<Record<string, boolean>>({});

  // Séries d'évolution mensuelle par moyen de paiement (visibilité par méthode)
  const [hiddenPaymentMethodsInHistory, setHiddenPaymentMethodsInHistory] = useState<Record<string, boolean>>({});

  // Dictionnaire des comptes pour résolution rapide
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    (accounts || []).forEach(acc => map.set(acc.id, acc.name));
    return map;
  }, [accounts]);

  // Dictionnaire des catégories pour résolution rapide
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    (categories || []).forEach(cat => map.set(cat.id, cat.name));
    return map;
  }, [categories]);

  // 6. Filtrage par période et catégorie (périmètre de base pour les cartes de synthèse)
  // Règle impérative : Les cartes de synthèse affichent Débité, En attente, Prévu et Total budgétaire
  // calculés sur la période et catégorie sélectionnées, sans être réduits par le filtre de statut ni la recherche
  const baseFilteredExpenses = useMemo(() => {
    if (!expenses) return [];

    return expenses.filter(exp => {
      // Filtrage temporel
      if (periodMode === 'month') {
        if (selectedMonth && !exp.date.startsWith(selectedMonth)) return false;
      } else {
        if (startDate && exp.date < startDate) return false;
        if (endDate && exp.date > endDate) return false;
      }

      // Filtrage par catégorie
      if (selectedCategory && exp.categoryId !== selectedCategory) {
        return false;
      }

      return true;
    });
  }, [expenses, periodMode, selectedMonth, startDate, endDate, selectedCategory]);

  // 7. Calcul des 4 indicateurs de synthèse KPIs
  const { kpiCleared, kpiPending, kpiPlanned, kpiBudgetTotal } = useMemo(() => {
    let cleared = 0;
    let pending = 0;
    let planned = 0;

    baseFilteredExpenses.forEach(exp => {
      // Les dépenses désactivées sont exclues du budget
      if (exp.status === 'disabled') return;

      const amt = Number(exp.amount) || 0;
      if (exp.status === 'cleared') {
        cleared += amt;
      } else if (exp.status === 'pending') {
        pending += amt;
      } else if (exp.status === 'planned') {
        planned += amt;
      }
    });

    const budgetTotal = cleared + pending + planned;

    return {
      kpiCleared: cleared,
      kpiPending: pending,
      kpiPlanned: planned,
      kpiBudgetTotal: budgetTotal
    };
  }, [baseFilteredExpenses]);

  // 8. Calcul de répartition par catégorie (Graphique 1)
  // Évalué sur la période sélectionnée, exclusion des opérations disabled, classement décroissant
  const categoryRankings = useMemo(() => {
    if (!expenses) return { items: [], totalNet: 0 };

    // Dépenses de la période sélectionnée (sans le filtre de catégorie pour permettre la comparaison globale)
    const periodExpenses = expenses.filter(exp => {
      if (periodMode === 'month') {
        if (selectedMonth && !exp.date.startsWith(selectedMonth)) return false;
      } else {
        if (startDate && exp.date < startDate) return false;
        if (endDate && exp.date > endDate) return false;
      }
      return exp.status !== 'disabled';
    });

    const totalsMap = new Map<string, { id: string; name: string; amount: number; count: number }>();

    periodExpenses.forEach(exp => {
      const isKnown = Boolean(exp.categoryId && categoryMap.has(exp.categoryId));
      const catId = isKnown ? exp.categoryId! : '__uncategorized__';
      const catName = isKnown ? categoryMap.get(exp.categoryId!)! : 'Sans catégorie';

      if (!totalsMap.has(catId)) {
        totalsMap.set(catId, {
          id: catId,
          name: catName,
          amount: 0,
          count: 0
        });
      }

      const item = totalsMap.get(catId)!;
      item.amount += Number(exp.amount) || 0;
      item.count += 1;
    });

    // Somme totale nette pour le calcul des pourcentages
    const items = Array.from(totalsMap.values());
    const totalNet = items.reduce((sum, item) => sum + item.amount, 0);

    // Tri décroissant strict du montant le plus élevé au plus faible
    items.sort((a, b) => b.amount - a.amount);

    // Calcul du pourcentage : si totalNet <= 0, éviter tout pourcentage trompeur (afficher 0)
    const formattedItems = items.map((item, idx) => {
      const percentage = totalNet > 0 && item.amount > 0 
        ? Math.round((item.amount / totalNet) * 1000) / 10 
        : 0;
      return {
        ...item,
        percentage,
        color: CATEGORY_CHART_COLORS[idx % CATEGORY_CHART_COLORS.length]
      };
    });

    return {
      items: formattedItems,
      totalNet
    };
  }, [expenses, periodMode, selectedMonth, startDate, endDate, categoryMap]);

  // 9. Calcul d'évolution sur 12 mois calendaires (Graphique 2)
  // 12 derniers mois jusqu'au mois courant inclus, mois vides à 0, exclusion des opérations disabled
  const monthlyHistory12 = useMemo(() => {
    if (!expenses) return [];

    // Générer les 12 clés YYYY-MM
    const monthsList: string[] = [];
    const [curYear, curMonth] = currentMonthStr.split('-').map(Number);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsList.push(ym);
    }

    // Préparer la structure initiale avec des 0 pour chaque mois
    const dataMap = new Map<string, {
      monthKey: string;
      monthLabel: string;
      isCurrentMonth: boolean;
      cleared: number;
      pending: number;
      planned: number;
      totalActive: number;
    }>();

    monthsList.forEach(ym => {
      const [y, m] = ym.split('-');
      const label = `${m}/${y.slice(2)}`;
      dataMap.set(ym, {
        monthKey: ym,
        monthLabel: label,
        isCurrentMonth: ym === currentMonthStr,
        cleared: 0,
        pending: 0,
        planned: 0,
        totalActive: 0
      });
    });

    // Agrégation des dépenses quotidiennes (filtre de catégorie appliqué si sélectionnée)
    expenses.forEach(exp => {
      if (exp.status === 'disabled') return;
      if (selectedCategory && exp.categoryId !== selectedCategory) return;

      const expMonth = exp.date ? exp.date.substring(0, 7) : '';
      if (dataMap.has(expMonth)) {
        const item = dataMap.get(expMonth)!;
        const amt = Number(exp.amount) || 0;
        if (exp.status === 'cleared') item.cleared += amt;
        else if (exp.status === 'pending') item.pending += amt;
        else if (exp.status === 'planned') item.planned += amt;
      }
    });

    // Arrondir et calculer les totaux (total budgétaire des 3 séries + total des séries visibles)
    return monthsList.map(ym => {
      const item = dataMap.get(ym)!;
      const clearedRound = Math.round(item.cleared * 100) / 100;
      const pendingRound = Math.round(item.pending * 100) / 100;
      const plannedRound = Math.round(item.planned * 100) / 100;
      const monthTotal = Math.round((clearedRound + pendingRound + plannedRound) * 100) / 100;
      const totalVisible = Math.round((
        (showClearedInHistory ? clearedRound : 0) +
        (showPendingInHistory ? pendingRound : 0) +
        (showPlannedInHistory ? plannedRound : 0)
      ) * 100) / 100;

      return {
        ...item,
        cleared: clearedRound,
        pending: pendingRound,
        planned: plannedRound,
        monthTotal,
        totalVisible
      };
    });
  }, [expenses, currentMonthStr, selectedCategory, showClearedInHistory, showPendingInHistory, showPlannedInHistory]);

  // 10. Calcul de répartition et indicateurs par moyen de paiement (Graphique 3 & Indicateurs)
  // Évalué sur la période sélectionnée (avec filtre catégorie si actif, et statut actif pour cohérence si filtré), exclusion des opérations disabled
  const paymentMethodRankings = useMemo(() => {
    if (!expenses) return { items: [], totalNet: 0, totalOps: 0, globalAverage: 0 };

    // Dépenses de la période sélectionnée (et catégorie si choisie)
    const periodExpenses = expenses.filter(exp => {
      if (periodMode === 'month') {
        if (selectedMonth && !exp.date.startsWith(selectedMonth)) return false;
      } else {
        if (startDate && exp.date < startDate) return false;
        if (endDate && exp.date > endDate) return false;
      }
      if (selectedCategory && exp.categoryId !== selectedCategory) return false;
      if (selectedStatus !== 'all' && exp.status !== selectedStatus) return false;
      return exp.status !== 'disabled';
    });

    const totalsMap = new Map<string, { method: string; amount: number; count: number }>();

    // Initialiser les entrées pour toutes les méthodes existantes pour garantir l'ordre et l'exhaustivité
    PAYMENT_METHODS.forEach(pm => {
      totalsMap.set(pm, { method: pm, amount: 0, count: 0 });
    });
    // Entrée pour opérations non renseignées
    totalsMap.set('Non spécifié', { method: 'Non spécifié', amount: 0, count: 0 });

    periodExpenses.forEach(exp => {
      const pm = exp.paymentMethod && PAYMENT_METHODS.includes(exp.paymentMethod as any)
        ? exp.paymentMethod
        : 'Non spécifié';

      const entry = totalsMap.get(pm)!;
      entry.amount += Number(exp.amount) || 0;
      entry.count += 1;
    });

    // Ne retenir que les méthodes qui ont au moins 1 opération ou un montant non nul (pour le graphique compact)
    // Mais conserver la liste complète pour les indicateurs si besoin
    const allItems = Array.from(totalsMap.values());
    const totalNet = Math.round(allItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const totalOps = allItems.reduce((sum, item) => sum + item.count, 0);
    const globalAverage = totalOps > 0 ? Math.round((totalNet / totalOps) * 100) / 100 : 0;

    // Filtre pour le graphique : méthodes avec count > 0 ou amount !== 0
    const activeItems = allItems.filter(item => item.count > 0 || item.amount !== 0);

    // Tri décroissant strict du montant le plus élevé au plus faible
    activeItems.sort((a, b) => b.amount - a.amount);

    // Calcul du pourcentage et de la moyenne par moyen de paiement
    // Règle financière impérative : si totalNet <= 0 ou item.amount <= 0, pourcentage = 0 (évite répartition trompeuse)
    const formattedItems = activeItems.map(item => {
      const percentage = totalNet > 0 && item.amount > 0
        ? Math.round((item.amount / totalNet) * 1000) / 10
        : 0;
      const avgAmount = item.count > 0 ? Math.round((item.amount / item.count) * 100) / 100 : 0;
      return {
        ...item,
        amount: Math.round(item.amount * 100) / 100,
        avgAmount,
        percentage,
        color: PAYMENT_METHOD_COLORS[item.method] || '#64748b'
      };
    });

    return {
      items: formattedItems,
      totalNet,
      totalOps,
      globalAverage
    };
  }, [expenses, periodMode, selectedMonth, startDate, endDate, selectedCategory, selectedStatus]);

  // 11. Calcul d'évolution sur 12 mois par catégorie de dépense (Graphique 4)
  const monthlyCategoryHistory12 = useMemo(() => {
    if (!expenses) return { monthsData: [], presentCategories: [] };

    // Générer les 12 clés YYYY-MM
    const monthsList: string[] = [];
    const [curYear, curMonth] = currentMonthStr.split('-').map(Number);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsList.push(ym);
    }

    // Structure par mois
    const dataMap = new Map<string, Record<string, any>>();
    const presentCategoriesMap = new Map<string, { id: string; name: string; totalAmount: number }>();

    monthsList.forEach(ym => {
      const [y, m] = ym.split('-');
      const label = `${m}/${y.slice(2)}`;
      const initObj: Record<string, any> = {
        monthKey: ym,
        monthLabel: label,
        isCurrentMonth: ym === currentMonthStr,
        monthTotal: 0
      };
      dataMap.set(ym, initObj);
    });

    // Agrégation des dépenses quotidiennes (filtre statut)
    expenses.forEach(exp => {
      if (exp.status === 'disabled') return;
      if (selectedStatus !== 'all' && exp.status !== selectedStatus) return;

      const expMonth = exp.date ? exp.date.substring(0, 7) : '';
      if (dataMap.has(expMonth)) {
        const item = dataMap.get(expMonth)!;
        const amt = Number(exp.amount) || 0;
        const isKnown = Boolean(exp.categoryId && categoryMap.has(exp.categoryId));
        const catId = isKnown ? exp.categoryId! : '__uncategorized__';
        const catName = isKnown ? categoryMap.get(exp.categoryId!)! : 'Sans catégorie';

        item[catId] = (item[catId] || 0) + amt;
        item.monthTotal = (item.monthTotal || 0) + amt;

        if (amt !== 0) {
          if (!presentCategoriesMap.has(catId)) {
            presentCategoriesMap.set(catId, { id: catId, name: catName, totalAmount: 0 });
          }
          presentCategoriesMap.get(catId)!.totalAmount += amt;
        }
      }
    });

    // Trier les catégories présentes par montant total décroissant sur les 12 mois
    const sortedCategories = Array.from(presentCategoriesMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const presentCategories = sortedCategories.map((cat, idx) => ({
      id: cat.id,
      name: cat.name,
      color: CATEGORY_CHART_COLORS[idx % CATEGORY_CHART_COLORS.length]
    }));

    const monthsData = monthsList.map(ym => {
      const item = dataMap.get(ym)!;
      const roundedItem: Record<string, any> = {
        monthKey: item.monthKey,
        monthLabel: item.monthLabel,
        isCurrentMonth: item.isCurrentMonth,
        monthTotal: Math.round(item.monthTotal * 100) / 100
      };
      presentCategories.forEach(cat => {
        roundedItem[cat.id] = Math.round((item[cat.id] || 0) * 100) / 100;
      });
      return roundedItem;
    });

    return {
      monthsData,
      presentCategories
    };
  }, [expenses, currentMonthStr, categoryMap, selectedStatus]);

  // Calcul d'évolution sur 12 mois par moyen de paiement (conservé pour rétrocompatibilité)
  const monthlyPaymentMethodHistory12 = useMemo(() => {
    if (!expenses) return { monthsData: [], presentMethods: [] };

    // Générer les 12 clés YYYY-MM
    const monthsList: string[] = [];
    const [curYear, curMonth] = currentMonthStr.split('-').map(Number);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsList.push(ym);
    }

    // Structure par mois
    const dataMap = new Map<string, Record<string, any>>();
    const presentMethodsSet = new Set<string>();

    monthsList.forEach(ym => {
      const [y, m] = ym.split('-');
      const label = `${m}/${y.slice(2)}`;
      const initObj: Record<string, any> = {
        monthKey: ym,
        monthLabel: label,
        isCurrentMonth: ym === currentMonthStr,
        monthTotal: 0
      };
      // Initialiser chaque méthode à 0
      PAYMENT_METHODS.forEach(pm => {
        initObj[pm] = 0;
      });
      initObj['Non spécifié'] = 0;
      dataMap.set(ym, initObj);
    });

    // Agrégation des dépenses quotidiennes (filtre catégorie et statut)
    expenses.forEach(exp => {
      if (exp.status === 'disabled') return;
      if (selectedCategory && exp.categoryId !== selectedCategory) return;
      if (selectedStatus !== 'all' && exp.status !== selectedStatus) return;

      const expMonth = exp.date ? exp.date.substring(0, 7) : '';
      if (dataMap.has(expMonth)) {
        const item = dataMap.get(expMonth)!;
        const amt = Number(exp.amount) || 0;
        const pm = exp.paymentMethod && PAYMENT_METHODS.includes(exp.paymentMethod as any)
          ? exp.paymentMethod
          : 'Non spécifié';

        item[pm] = (item[pm] || 0) + amt;
        item.monthTotal = (item.monthTotal || 0) + amt;
        if (amt !== 0) {
          presentMethodsSet.add(pm);
        }
      }
    });

    const monthsData = monthsList.map(ym => {
      const item = dataMap.get(ym)!;
      const roundedItem: Record<string, any> = {
        monthKey: item.monthKey,
        monthLabel: item.monthLabel,
        isCurrentMonth: item.isCurrentMonth,
        monthTotal: Math.round(item.monthTotal * 100) / 100
      };
      PAYMENT_METHODS.forEach(pm => {
        roundedItem[pm] = Math.round((item[pm] || 0) * 100) / 100;
      });
      roundedItem['Non spécifié'] = Math.round((item['Non spécifié'] || 0) * 100) / 100;
      return roundedItem;
    });

    // Liste ordonnée des méthodes présentes sur la période de 12 mois
    const presentMethods = [...PAYMENT_METHODS, 'Non spécifié'].filter(pm => presentMethodsSet.has(pm));

    return {
      monthsData,
      presentMethods: presentMethods.length > 0 ? presentMethods : ['Carte bancaire', 'Virement']
    };
  }, [expenses, currentMonthStr, selectedCategory, selectedStatus]);

  // 12. Filtrage secondaire complet pour le tableau (statut, moyen de paiement et recherche)
  const displayedExpenses = useMemo(() => {
    return baseFilteredExpenses.filter(exp => {
      // Filtre de statut
      if (selectedStatus !== 'all' && exp.status !== selectedStatus) {
        return false;
      }

      // Filtre par moyen de paiement
      if (selectedPaymentMethod) {
        if (selectedPaymentMethod === '__unspecified__') {
          if (exp.paymentMethod && exp.paymentMethod.trim() !== '') {
            return false;
          }
        } else {
          if (exp.paymentMethod !== selectedPaymentMethod) {
            return false;
          }
        }
      }

      // Filtre de recherche textuelle sur libellé ou note
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchLabel = (exp.label || '').toLowerCase().includes(query);
        const matchNote = (exp.notes || '').toLowerCase().includes(query);
        const matchCheck = (exp.checkNumber || '').toLowerCase().includes(query);
        if (!matchLabel && !matchNote && !matchCheck) return false;
      }

      return true;
    });
  }, [baseFilteredExpenses, selectedStatus, selectedPaymentMethod, searchQuery]);

  // 11. Regroupement par catégorie et sous-totaux dynamiques
  const groupedCategories = useMemo(() => {
    const groupsMap = new Map<string, {
      id: string;
      name: string;
      expenses: Transaction[];
      subtotal: number;
    }>();

    displayedExpenses.forEach(exp => {
      const isKnown = Boolean(exp.categoryId && categoryMap.has(exp.categoryId));
      const catId = isKnown ? exp.categoryId! : '__uncategorized__';
      const catName = isKnown ? categoryMap.get(exp.categoryId!)! : 'Sans catégorie';

      if (!groupsMap.has(catId)) {
        groupsMap.set(catId, {
          id: catId,
          name: catName,
          expenses: [],
          subtotal: 0
        });
      }

      const group = groupsMap.get(catId)!;
      group.expenses.push(exp);

      // Si le statut est disabled, on ne l'ajoute pas au sous-total financier actif
      if (exp.status !== 'disabled') {
        group.subtotal += Number(exp.amount) || 0;
      }
    });

    // Tri des dépenses à l'intérieur de chaque catégorie
    groupsMap.forEach(group => {
      group.expenses.sort((a, b) => {
        if (sortField === 'date') {
          const comp = a.date.localeCompare(b.date);
          return sortOrder === 'asc' ? comp : -comp;
        } else if (sortField === 'amount') {
          const comp = (Number(a.amount) || 0) - (Number(b.amount) || 0);
          return sortOrder === 'asc' ? comp : -comp;
        } else if (sortField === 'label') {
          const comp = (a.label || '').localeCompare(b.label || '', 'fr', { sensitivity: 'base' });
          return sortOrder === 'asc' ? comp : -comp;
        }
        return 0;
      });
    });

    // Tri des catégories
    const groups = Array.from(groupsMap.values());
    groups.sort((a, b) => {
      // Les catégories non définies restent en fin de liste
      if (a.id === '__uncategorized__') return 1;
      if (b.id === '__uncategorized__') return -1;

      if (categorySortField === 'amount') {
        const comp = a.subtotal - b.subtotal;
        return categorySortOrder === 'asc' ? comp : -comp;
      } else if (categorySortField === 'count') {
        const comp = a.expenses.length - b.expenses.length;
        return categorySortOrder === 'asc' ? comp : -comp;
      } else {
        const comp = a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
        return categorySortOrder === 'asc' ? comp : -comp;
      }
    });

    return groups;
  }, [displayedExpenses, categoryMap, sortField, sortOrder, categorySortField, categorySortOrder]);

  // 12. Total général du tableau (somme exacte des sous-totaux des catégories affichées)
  const { tableTotalAmount, tableTotalOperations } = useMemo(() => {
    let totalAmt = 0;
    let totalOps = 0;

    groupedCategories.forEach(g => {
      totalAmt += g.subtotal;
      totalOps += g.expenses.length;
    });

    return {
      tableTotalAmount: totalAmt,
      tableTotalOperations: totalOps
    };
  }, [groupedCategories]);

  // Gestion du repliement individuel et global (replié par défaut)
  const isCategoryCollapsed = (catId: string) => {
    return collapsedCategories[catId] !== undefined ? collapsedCategories[catId] : true;
  };

  const toggleCategory = (catId: string) => {
    setCollapsedCategories(prev => {
      const current = prev[catId] !== undefined ? prev[catId] : true;
      return {
        ...prev,
        [catId]: !current
      };
    });
  };

  const collapseAll = () => {
    const newState: Record<string, boolean> = {};
    groupedCategories.forEach(g => {
      newState[g.id] = true;
    });
    setCollapsedCategories(newState);
  };

  const expandAll = () => {
    const newState: Record<string, boolean> = {};
    groupedCategories.forEach(g => {
      newState[g.id] = false;
    });
    setCollapsedCategories(newState);
  };

  // Réinitialisation des filtres
  const handleResetFilters = () => {
    setPeriodMode('month');
    setSelectedMonth(currentMonthStr);
    setSelectedCategory('');
    setSelectedStatus('all');
    setSelectedPaymentMethod('');
    setSearchQuery('');
    setSortField('date');
    setSortOrder('desc');
    setCategorySortField('name');
    setCategorySortOrder('asc');
  };

  const isFiltered = (periodMode === 'custom') || 
    (selectedMonth !== currentMonthStr) || 
    selectedCategory !== '' || 
    selectedStatus !== 'all' || 
    selectedPaymentMethod !== '' || 
    searchQuery.trim() !== '';

  const formatCurrency = (val: number) => {
    return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const handleUpdateStatus = async (expense: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, newStatus as any);
    }
  };

  if (expenses === undefined || categories === undefined || accounts === undefined) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Chargement de l'analyse des dépenses...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* 1. En-tête compact de pilotage */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#0284c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
          }}>
            <WalletCards size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Analyse des dépenses
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Tableau dynamique croisé & répartition par poste budgétaire
            </p>
          </div>
        </div>

        {/* Boutons d'action compacts */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            data-testid="toggle-charts-btn"
            type="button"
            onClick={() => setShowCharts(s => !s)}
            style={{
              fontSize: '0.775rem',
              padding: '0.35rem 0.65rem',
              height: '32px',
              backgroundColor: showCharts ? '#f0f9ff' : 'transparent',
              border: '1px solid',
              borderColor: showCharts ? '#0284c7' : 'var(--border-color)',
              color: showCharts ? '#0369a1' : 'var(--text-main)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 600
            }}
            title={showCharts ? "Masquer les graphiques d'analyse" : "Afficher les graphiques d'analyse"}
          >
            {showCharts ? <EyeOff size={14} /> : <Eye size={14} />}
            {showCharts ? 'Masquer graphiques' : 'Afficher graphiques'}
          </button>
          <Button 
            data-testid="expand-all-btn"
            variant="outline" 
            onClick={expandAll} 
            icon={<ChevronsDown size={14} />}
            style={{ fontSize: '0.775rem', padding: '0.35rem 0.65rem', height: '32px' }}
          >
            Tout déplier
          </Button>
          <Button 
            data-testid="collapse-all-btn"
            variant="outline" 
            onClick={collapseAll} 
            icon={<ChevronsUp size={14} />}
            style={{ fontSize: '0.775rem', padding: '0.35rem 0.65rem', height: '32px' }}
          >
            Tout replier
          </Button>
        </div>
      </div>

      {/* 2. Indicateurs financiers sobres, compacts et horizontaux */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.75rem'
      }}>
        {/* Débité : Bleu */}
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid #2563eb',
          borderRadius: '6px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CheckCircle2 size={13} color="#2563eb" /> Déjà débité
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Pointé en compte
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span 
              data-testid="kpi-debite-amount" 
              style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e3a8a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
            >
              {formatCurrency(kpiCleared)}
            </span>
          </div>
        </div>

        {/* En attente : Orange */}
        <div style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fef3c7',
          borderLeft: '4px solid #d97706',
          borderRadius: '6px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Clock size={13} color="#d97706" /> En attente
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Engagé non débité
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span 
              data-testid="kpi-attente-amount" 
              style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
            >
              {formatCurrency(kpiPending)}
            </span>
          </div>
        </div>

        {/* Prévu : Violet */}
        <div style={{
          backgroundColor: '#faf5ff',
          border: '1px solid #f3e8ff',
          borderLeft: '4px solid #9333ea',
          borderRadius: '6px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: '#7e22ce', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CalendarCheck size={13} color="#9333ea" /> Prévu
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Estimations du mois
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span 
              data-testid="kpi-prevu-amount" 
              style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6b21a8', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
            >
              {formatCurrency(kpiPlanned)}
            </span>
          </div>
        </div>

        {/* Total budgétaire : Vert émeraude soutenu */}
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderLeft: '4px solid #059669',
          borderRadius: '6px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CreditCard size={13} color="#059669" /> Total budgétaire
            </div>
            <div style={{ fontSize: '0.7rem', color: '#065f46', marginTop: '0.1rem' }}>
              Débité + En attente + Prévu
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span 
              data-testid="kpi-total-amount" 
              style={{ fontSize: '1.25rem', fontWeight: 800, color: '#064e3b', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
            >
              {formatCurrency(kpiBudgetTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Zone graphique moderne et compacte avec onglets intégrés */}
      {showCharts && (
        <div 
          data-testid="expense-analysis-charts-panel"
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}
        >
          {/* En-tête des onglets de visualisation */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
            paddingBottom: '0.4rem',
            borderBottom: '1px solid #f1f5f9'
          }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                data-testid="chart-tab-category"
                type="button"
                onClick={() => setActiveChartTab('category')}
                style={{
                  background: activeChartTab === 'category' ? '#eff6ff' : 'transparent',
                  border: '1px solid',
                  borderColor: activeChartTab === 'category' ? '#93c5fd' : 'transparent',
                  color: activeChartTab === 'category' ? '#1d4ed8' : 'var(--text-muted)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: activeChartTab === 'category' ? 700 : 500,
                  fontSize: '0.785rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <BarChart2 size={13} /> Répartition par catégorie
              </button>

              <button
                data-testid="chart-tab-history12"
                type="button"
                onClick={() => setActiveChartTab('history12')}
                style={{
                  background: activeChartTab === 'history12' ? '#eff6ff' : 'transparent',
                  border: '1px solid',
                  borderColor: activeChartTab === 'history12' ? '#93c5fd' : 'transparent',
                  color: activeChartTab === 'history12' ? '#1d4ed8' : 'var(--text-muted)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: activeChartTab === 'history12' ? 700 : 500,
                  fontSize: '0.785rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <TrendingUp size={13} /> Évolution 12 mois
              </button>

              <button
                data-testid="chart-tab-paymentMethod"
                type="button"
                onClick={() => setActiveChartTab('paymentMethod')}
                style={{
                  background: activeChartTab === 'paymentMethod' ? '#eff6ff' : 'transparent',
                  border: '1px solid',
                  borderColor: activeChartTab === 'paymentMethod' ? '#93c5fd' : 'transparent',
                  color: activeChartTab === 'paymentMethod' ? '#1d4ed8' : 'var(--text-muted)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: activeChartTab === 'paymentMethod' ? 700 : 500,
                  fontSize: '0.785rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <CreditCard size={13} /> Moyen de paiement
              </button>

              <button
                data-testid="chart-tab-paymentHistory12"
                type="button"
                onClick={() => setActiveChartTab('paymentHistory12')}
                style={{
                  background: activeChartTab === 'paymentHistory12' ? '#eff6ff' : 'transparent',
                  border: '1px solid',
                  borderColor: activeChartTab === 'paymentHistory12' ? '#93c5fd' : 'transparent',
                  color: activeChartTab === 'paymentHistory12' ? '#1d4ed8' : 'var(--text-muted)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontWeight: activeChartTab === 'paymentHistory12' ? 700 : 500,
                  fontSize: '0.785rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <TrendingUp size={13} /> Évolution 12 mois catégories
              </button>
            </div>

            {/* Contrôles spécifiques au graphique 12 mois statuts */}
            {activeChartTab === 'history12' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Séries :</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#1e40af', fontWeight: 600 }}>
                  <input
                    data-testid="toggle-cleared-history"
                    type="checkbox"
                    checked={showClearedInHistory}
                    onChange={e => setShowClearedInHistory(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }}></span>
                  <span>Débité</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#b45309', fontWeight: 600 }}>
                  <input
                    data-testid="toggle-pending-history"
                    type="checkbox"
                    checked={showPendingInHistory}
                    onChange={e => setShowPendingInHistory(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d97706' }}></span>
                  <span>En attente</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#7e22ce', fontWeight: 600 }}>
                  <input
                    data-testid="toggle-planned-history"
                    type="checkbox"
                    checked={showPlannedInHistory}
                    onChange={e => setShowPlannedInHistory(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#9333ea' }}></span>
                  <span>Prévu</span>
                </label>
              </div>
            )}

            {/* Contrôles spécifiques à l'évolution 12 mois par catégorie de dépense */}
            {activeChartTab === 'paymentHistory12' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Séries :</span>
                {monthlyCategoryHistory12.presentCategories.map(cat => {
                  const isVisible = !hiddenCategoriesInHistory[cat.id];
                  return (
                    <label key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#334155', fontWeight: 600 }}>
                      <input
                        data-testid={`toggle-category-history-${cat.id.replace(/\s+/g, '-').toLowerCase()}`}
                        type="checkbox"
                        checked={isVisible}
                        onChange={e => {
                          setHiddenCategoriesInHistory(prev => ({
                            ...prev,
                            [cat.id]: !e.target.checked
                          }));
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: cat.color }}></span>
                      <span>{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Légende interactive pour le classement par catégorie */}
            {activeChartTab === 'category' && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                💡 Cliquez sur une barre pour filtrer le tableau ci-dessous
              </div>
            )}

            {/* Légende interactive pour le classement par moyen de paiement */}
            {activeChartTab === 'paymentMethod' && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                💡 Cliquez sur une barre pour filtrer le tableau par moyen de paiement
              </div>
            )}
          </div>

          {/* Contenu de l'onglet 1 : Répartition par catégorie */}
          {activeChartTab === 'category' && (
            <div style={{ width: '100%', minHeight: '220px', height: Math.min(320, Math.max(200, categoryRankings.items.length * 28 + 40)) }}>
              {categoryRankings.items.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryRankings.items}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    // Justification: Le typage officiel de Recharts (MouseHandlerDataParam) omet activePayload,
                    // présent uniquement au runtime. L'annotation (e: any) est indispensable pour accéder à e.activePayload.
                    onClick={(e: any) => {
                      if (e && e.activePayload && e.activePayload.length > 0) {
                        const clicked = e.activePayload[0].payload;
                        if (clicked && clicked.id && clicked.id !== '__uncategorized__') {
                          setSelectedCategory(prev => prev === clicked.id ? '' : clicked.id);
                        }
                      }
                    }}
                  >
                    <XAxis 
                      type="number" 
                      tickFormatter={(val) => `${val} €`}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={160}
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <Tooltip 
                      formatter={(val: any, name: any, item: any) => [
                        `${formatCurrency(Number(val) || 0)} (${item.payload.percentage} %)`,
                        'Montant net'
                      ]}
                      labelFormatter={(label) => `Catégorie : ${label}`}
                      contentStyle={{
                        borderRadius: '6px',
                        fontSize: '0.785rem',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]} cursor="pointer">
                      {categoryRankings.items.map((entry, index) => (
                        <Cell 
                          key={`cell-${entry.id}-${index}`} 
                          fill={selectedCategory === entry.id ? '#1e3a8a' : entry.color} 
                          opacity={selectedCategory && selectedCategory !== entry.id ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Aucune dépense enregistrée sur la période sélectionnée pour générer le graphique.
                </div>
              )}
            </div>
          )}

          {/* Contenu de l'onglet 2 : Évolution sur 12 mois */}
          {activeChartTab === 'history12' && (
            <div style={{ width: '100%', height: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyHistory12}
                  margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                  // Justification: Le typage officiel de Recharts omet activePayload au niveau statique.
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      const clicked = e.activePayload[0].payload;
                      if (clicked && clicked.monthKey) {
                        setPeriodMode('month');
                        setSelectedMonth(clicked.monthKey);
                      }
                    }
                  }}
                >
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const monthData = monthlyHistory12.find(m => m.monthLabel === payload.value);
                      const isCurrent = monthData?.isCurrentMonth;
                      return (
                        <text
                          x={x}
                          y={Number(y) + 12}
                          textAnchor="middle"
                          fill={isCurrent ? '#0284c7' : '#64748b'}
                          fontSize={11}
                          fontWeight={isCurrent ? 800 : 500}
                        >
                          {payload.value}{isCurrent ? '*' : ''}
                        </text>
                      );
                    }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    tickFormatter={(val) => `${val} €`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip content={<History12TooltipContent />} />
                  <Legend 
                    formatter={(value) => {
                      if (value === 'cleared') return 'Débité';
                      if (value === 'pending') return 'En attente';
                      if (value === 'planned') return 'Prévu';
                      return value;
                    }}
                    wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }}
                  />
                  {/* Série Débité (affichée par défaut, désactivable) */}
                  {showClearedInHistory && (
                    <Bar dataKey="cleared" fill="#2563eb" radius={[3, 3, 0, 0]} cursor="pointer" stackId="a" />
                  )}
                  {/* Série En attente (affichée par défaut, désactivable) */}
                  {showPendingInHistory && (
                    <Bar dataKey="pending" fill="#d97706" radius={[3, 3, 0, 0]} cursor="pointer" stackId="a" />
                  )}
                  {/* Série Prévu (affichée par défaut, désactivable) */}
                  {showPlannedInHistory && (
                    <Bar dataKey="planned" fill="#9333ea" radius={[3, 3, 0, 0]} cursor="pointer" stackId="a" />
                  )}
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                * Mois courant incomplet. Cliquez sur une barre pour afficher le détail dans le tableau.
              </div>
            </div>
          )}

          {/* Contenu de l'onglet 3 : Répartition et indicateurs par moyen de paiement */}
          {activeChartTab === 'paymentMethod' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Graphique de répartition horizontale par moyen de paiement */}
              <div style={{ width: '100%', minHeight: '180px', height: Math.min(280, Math.max(160, paymentMethodRankings.items.length * 28 + 40)) }}>
                {paymentMethodRankings.items.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={paymentMethodRankings.items}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                      // Justification: Le typage officiel de Recharts omet activePayload au niveau statique.
                      onClick={(e: any) => {
                        if (e && e.activePayload && e.activePayload.length > 0) {
                          const clicked = e.activePayload[0].payload;
                          if (clicked && clicked.method) {
                            const val = clicked.method === 'Non spécifié' ? '__unspecified__' : clicked.method;
                            setSelectedPaymentMethod(prev => prev === val ? '' : val);
                          }
                        }
                      }}
                    >
                      <XAxis 
                        type="number" 
                        tickFormatter={(val) => `${val} €`}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="method" 
                        width={160}
                        tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      <Tooltip 
                        formatter={(val: any, name: any, item: any) => [
                          `${formatCurrency(Number(val) || 0)} (${item.payload.percentage > 0 ? `${item.payload.percentage} %` : (paymentMethodRankings.totalNet <= 0 ? 'Non calculable' : '0 %')})`,
                          'Montant net'
                        ]}
                        labelFormatter={(label) => `Moyen : ${label}`}
                        contentStyle={{
                          borderRadius: '6px',
                          fontSize: '0.785rem',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]} cursor="pointer">
                        {paymentMethodRankings.items.map((entry, index) => {
                          const isSelected = selectedPaymentMethod === (entry.method === 'Non spécifié' ? '__unspecified__' : entry.method);
                          return (
                            <Cell 
                              key={`cell-pm-${entry.method}-${index}`} 
                              fill={isSelected ? '#1e3a8a' : entry.color} 
                              opacity={selectedPaymentMethod && !isSelected ? 0.35 : 1}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Aucune dépense enregistrée sur la période sélectionnée pour générer la répartition par moyen de paiement.
                  </div>
                )}
              </div>

              {/* Tableau / Carte des indicateurs par moyen de paiement */}
              <div 
                data-testid="payment-methods-indicators-panel"
                style={{
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '0.6rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Indicateurs par moyen de paiement ({periodMode === 'month' ? selectedMonth : `${startDate} au ${endDate}`})
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Total net : <strong>{formatCurrency(paymentMethodRankings.totalNet)}</strong> ({paymentMethodRankings.totalOps} op., moy. {formatCurrency(paymentMethodRankings.globalAverage)})
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                        <th style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Moyen de paiement</th>
                        <th style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>Opérations</th>
                        <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>Montant net</th>
                        <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>Moyenne / op.</th>
                        <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>Part relative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMethodRankings.items.map((item) => {
                        const isSelected = selectedPaymentMethod === (item.method === 'Non spécifié' ? '__unspecified__' : item.method);
                        return (
                          <tr 
                            key={`ind-${item.method}`}
                            data-testid={`indicator-row-${item.method.replace(/\s+/g, '-').toLowerCase()}`}
                            onClick={() => {
                              const val = item.method === 'Non spécifié' ? '__unspecified__' : item.method;
                              setSelectedPaymentMethod(prev => prev === val ? '' : val);
                            }}
                            style={{ 
                              borderBottom: '1px solid #f1f5f9',
                              backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                              cursor: 'pointer'
                            }}
                          >
                            <td style={{ padding: '0.3rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: isSelected ? 700 : 500 }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }}></span>
                              <span>{item.method}</span>
                            </td>
                            <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                              {item.count}
                            </td>
                            <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: item.amount > 0 ? '#b91c1c' : '#15803d' }}>
                              {formatCurrency(item.amount)}
                            </td>
                            <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                              {formatCurrency(item.avgAmount)}
                            </td>
                            <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#334155' }}>
                              {paymentMethodRankings.totalNet > 0 && item.amount > 0 ? `${item.percentage} %` : (paymentMethodRankings.totalNet <= 0 ? 'Non calculable' : '0 %')}
                            </td>
                          </tr>
                        );
                      })}
                      {paymentMethodRankings.items.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                            Aucun enregistrement sur cette sélection
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Contenu de l'onglet 4 : Évolution 12 mois par catégorie de dépense */}
          {activeChartTab === 'paymentHistory12' && (
            <div style={{ width: '100%', height: '260px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyCategoryHistory12.monthsData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                  // Justification: Le typage officiel de Recharts omet activePayload au niveau statique.
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload.length > 0) {
                      const clicked = e.activePayload[0].payload;
                      if (clicked && clicked.monthKey) {
                        setPeriodMode('month');
                        setSelectedMonth(clicked.monthKey);
                      }
                    }
                  }}
                >
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const monthData = monthlyCategoryHistory12.monthsData.find(m => m.monthLabel === payload.value);
                      const isCurrent = monthData?.isCurrentMonth;
                      return (
                        <text
                          x={x}
                          y={Number(y) + 12}
                          textAnchor="middle"
                          fill={isCurrent ? '#0284c7' : '#64748b'}
                          fontSize={11}
                          fontWeight={isCurrent ? 800 : 500}
                        >
                          {payload.value}{isCurrent ? '*' : ''}
                        </text>
                      );
                    }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    tickFormatter={(val) => `${val} €`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip 
                    formatter={(val: any, name: any) => {
                      const cat = monthlyCategoryHistory12.presentCategories.find(c => c.id === name);
                      const label = cat ? cat.name : name;
                      return [formatCurrency(Number(val) || 0), label];
                    }}
                    labelFormatter={(label) => `Mois : ${label}`}
                    contentStyle={{
                      borderRadius: '6px',
                      fontSize: '0.785rem',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend 
                    formatter={(value: any) => {
                      const cat = monthlyCategoryHistory12.presentCategories.find(c => c.id === value);
                      return cat ? cat.name : value;
                    }}
                    wrapperStyle={{ fontSize: '0.75rem', paddingTop: '4px' }} 
                  />
                  {monthlyCategoryHistory12.presentCategories.map(cat => {
                    if (hiddenCategoriesInHistory[cat.id]) return null;
                    return (
                      <Bar 
                        key={cat.id} 
                        dataKey={cat.id} 
                        fill={cat.color} 
                        name={cat.name}
                        radius={[2, 2, 0, 0]} 
                        cursor="pointer" 
                        stackId="cat" 
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                * Mois courant incomplet. Cliquez sur une barre pour filtrer le mois dans le tableau.
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Barre de filtres et tris compacte */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Ligne 1 : Filtres principaux */}
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mode de période */}
          <div style={{ minWidth: '115px' }}>
            <select 
              className="form-control" 
              value={periodMode} 
              onChange={e => setPeriodMode(e.target.value as 'month' | 'custom')}
              style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem', fontWeight: 600 }}
            >
              <option value="month">Par mois</option>
              <option value="custom">Personnalisée</option>
            </select>
          </div>

          {/* Mois ou Date Du/Au */}
          {periodMode === 'month' ? (
            <div style={{ minWidth: '135px' }}>
              <input 
                type="month" 
                className="form-control" 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input 
                type="date" 
                className="form-control" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)}
                style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.4rem', width: '125px' }}
                title="Date de début"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>à</span>
              <input 
                type="date" 
                className="form-control" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.4rem', width: '125px' }}
                title="Date de fin"
              />
            </div>
          )}

          {/* Filtre Catégorie */}
          <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
            <select 
              data-testid="category-filter-select"
              className="form-control" 
              value={selectedCategory} 
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
            >
              <option value="">Toutes les catégories</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isArchived ? '(Archivée)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Statut */}
          <div style={{ minWidth: '140px' }}>
            <select 
              data-testid="status-filter-select"
              className="form-control" 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
            >
              {EXPENSE_ANALYSIS_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Filtre Moyen de paiement */}
          <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
            <select 
              data-testid="payment-method-filter-select"
              className="form-control" 
              value={selectedPaymentMethod} 
              onChange={e => setSelectedPaymentMethod(e.target.value)}
              style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
            >
              <option value="">Tous les moyens de paiement</option>
              {PAYMENT_METHODS.map(pm => (
                <option key={pm} value={pm}>{pm}</option>
              ))}
              <option value="__unspecified__">Non spécifié</option>
            </select>
          </div>

          {/* Recherche par libellé */}
          <div style={{ flex: '1 1 170px', minWidth: '160px', position: 'relative' }}>
            <input 
              data-testid="search-input"
              type="text" 
              className="form-control" 
              placeholder="Rechercher par libellé..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)}
              style={{ height: '32px', fontSize: '0.8rem', padding: '0.2rem 0.5rem 0.2rem 1.8rem' }}
            />
            <Search size={13} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          </div>

          {/* Réinitialiser les filtres */}
          {isFiltered && (
            <button
              data-testid="reset-filters-btn"
              type="button"
              onClick={handleResetFilters}
              style={{
                height: '32px',
                padding: '0 0.65rem',
                backgroundColor: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#475569',
                fontSize: '0.775rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap'
              }}
              title="Réinitialiser tous les filtres"
            >
              <RotateCcw size={12} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Ligne 2 : Tri compact du tableau et des catégories */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          paddingTop: '0.5rem', 
          borderTop: '1px dashed var(--border-color)',
          flexWrap: 'wrap',
          gap: '0.6rem',
          fontSize: '0.775rem'
        }}>
          {/* Tri des lignes d'opérations */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ArrowUpDown size={12} /> Trier opérations :
            </span>
            <button
              type="button"
              onClick={() => {
                if (sortField === 'date') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setSortField('date'); setSortOrder('desc'); }
              }}
              style={{
                background: sortField === 'date' ? '#eff6ff' : 'transparent',
                border: '1px solid',
                borderColor: sortField === 'date' ? '#93c5fd' : 'var(--border-color)',
                color: sortField === 'date' ? '#1d4ed8' : 'var(--text-main)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: sortField === 'date' ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              Date {sortField === 'date' && (sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
            </button>
            <button
              type="button"
              onClick={() => {
                if (sortField === 'amount') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setSortField('amount'); setSortOrder('desc'); }
              }}
              style={{
                background: sortField === 'amount' ? '#eff6ff' : 'transparent',
                border: '1px solid',
                borderColor: sortField === 'amount' ? '#93c5fd' : 'var(--border-color)',
                color: sortField === 'amount' ? '#1d4ed8' : 'var(--text-main)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: sortField === 'amount' ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              Montant {sortField === 'amount' && (sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
            </button>
            <button
              type="button"
              onClick={() => {
                if (sortField === 'label') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setSortField('label'); setSortOrder('asc'); }
              }}
              style={{
                background: sortField === 'label' ? '#eff6ff' : 'transparent',
                border: '1px solid',
                borderColor: sortField === 'label' ? '#93c5fd' : 'var(--border-color)',
                color: sortField === 'label' ? '#1d4ed8' : 'var(--text-main)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: sortField === 'label' ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              Libellé {sortField === 'label' && (sortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
            </button>
          </div>

          {/* Tri des catégories */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Trier catégories :</span>
            <select
              value={`${categorySortField}-${categorySortOrder}`}
              onChange={e => {
                const [f, o] = e.target.value.split('-') as [CategorySortField, SortOrder];
                setCategorySortField(f);
                setCategorySortOrder(o);
              }}
              style={{
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                fontSize: '0.75rem',
                background: 'var(--card-bg)',
                color: 'var(--text-main)',
                height: '26px'
              }}
            >
              <option value="name-asc">Nom (A → Z)</option>
              <option value="name-desc">Nom (Z → A)</option>
              <option value="amount-desc">Total décroissant</option>
              <option value="amount-asc">Total croissant</option>
              <option value="count-desc">Nombre d'opérations</option>
            </select>
          </div>
        </div>
      </div>

      {/* Information discrète sur le filtre de statut actif */}
      {selectedStatus !== 'all' && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '6px',
          padding: '0.45rem 0.75rem',
          fontSize: '0.775rem',
          color: '#1e40af',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem'
        }}>
          <span>ℹ️</span>
          <span>
            Filtre actif (<strong>{EXPENSE_ANALYSIS_STATUS_OPTIONS.find(o => o.value === selectedStatus)?.label}</strong>) : 
            le total du tableau reflète les opérations filtrées affichées. Les indicateurs budgétaires en haut conservent le périmètre complet.
          </span>
        </div>
      )}

      {/* 5. Tableau d'analyse financière moderne et compact (TCD Excel) */}
      <div className="table-container" style={{ 
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', 
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        backgroundColor: '#ffffff'
      }}>
        <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ width: '12%', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                Date
              </th>
              <th style={{ width: '42%', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                Libellé de l'opération
              </th>
              <th style={{ width: '14%', padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                Statut
              </th>
              <th style={{ width: '16%', padding: '0.5rem 0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                Compte / Moyen
              </th>
              <th style={{ width: '16%', padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#334155', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                Montant débit
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedCategories.map((group, groupIdx) => {
              const isCollapsed = isCategoryCollapsed(group.id);

              return (
                <React.Fragment key={group.id}>
                  {/* Ligne de synthèse de catégorie compacte et élégante (TCD) */}
                  <tr 
                    data-testid={`category-header-${group.id}`}
                    onClick={() => toggleCategory(group.id)}
                    title={isCollapsed ? "Cliquer pour déplier la catégorie" : "Cliquer pour replier la catégorie"}
                    style={{
                      backgroundColor: isCollapsed ? '#f8fafc' : '#f1f5f9',
                      borderTop: groupIdx > 0 ? '1px solid #cbd5e1' : undefined,
                      borderBottom: isCollapsed ? '1px solid #e2e8f0' : '1px solid #94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color 0.12s ease'
                    }}
                  >
                    <td colSpan={5} style={{ padding: '0.45rem 0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#475569',
                            flexShrink: 0
                          }}>
                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </span>
                          <span style={{ 
                            fontWeight: 700, 
                            fontSize: '0.85rem', 
                            color: '#0f172a',
                            letterSpacing: '-0.01em'
                          }}>
                            {group.name}
                          </span>
                          <span 
                            data-testid={`subtotal-count-${group.id}`}
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              padding: '0.08rem 0.4rem',
                              borderRadius: '9999px',
                              backgroundColor: '#e2e8f0',
                              color: '#334155'
                            }}
                          >
                            {group.expenses.length} op.
                          </span>
                        </div>

                        {/* Sous-total compact de la catégorie */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', fontWeight: 600 }}>
                            Total catégorie :
                          </span>
                          <span 
                            data-testid={`subtotal-amount-${group.id}`}
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 800,
                              color: '#b91c1c',
                              fontVariantNumeric: 'tabular-nums',
                              backgroundColor: '#ffffff',
                              border: '1px solid #fecaca',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px'
                            }}
                          >
                            -{formatCurrency(group.subtotal)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Lignes de détail individuel des opérations (denses et alignées) */}
                  {!isCollapsed && group.expenses.map((expense, idx) => {
                    const accountName = expense.accountId ? (accountMap.get(expense.accountId) || 'Compte') : '—';
                    const isRowDisabled = expense.status === 'disabled';
                    const isEven = idx % 2 === 0;

                    return (
                      <tr 
                        key={expense.id} 
                        style={{ 
                          opacity: isRowDisabled ? 0.45 : 1,
                          backgroundColor: isRowDisabled ? '#fafafa' : (isEven ? '#ffffff' : '#fcfcfc'),
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background-color 0.1s ease'
                        }}
                      >
                        {/* 1. Date */}
                        <td style={{ 
                          padding: '0.35rem 0.75rem', 
                          fontWeight: 500, 
                          color: '#475569', 
                          whiteSpace: 'nowrap',
                          fontSize: '0.785rem',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {formatDate(expense.date)}
                        </td>

                        {/* 2. Libellé et notes éventuelles + Moyen de paiement discret */}
                        <td style={{ padding: '0.35rem 0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.825rem' }}>
                                {expense.label}
                              </span>
                              {expense.notes && (
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  color: 'var(--text-muted)', 
                                  fontStyle: 'italic',
                                  backgroundColor: '#f1f5f9',
                                  padding: '0.05rem 0.35rem',
                                  borderRadius: '3px'
                                }}>
                                  {expense.notes}
                                </span>
                              )}
                            </div>
                            {/* Moyen de paiement discret avec numéro de chèque si disponible */}
                            {expense.paymentMethod && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#64748b' }}>
                                <span 
                                  data-testid={`payment-badge-${expense.id}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.05rem 0.35rem',
                                    borderRadius: '3px',
                                    backgroundColor: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    fontWeight: 500,
                                    fontSize: '0.68rem',
                                    color: '#334155'
                                  }}
                                >
                                  <span>💳</span>
                                  <span>
                                    {expense.paymentMethod === 'Chèque' && expense.checkNumber
                                      ? `Chèque n° ${expense.checkNumber}`
                                      : expense.paymentMethod}
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 3. Statut avec petit badge */}
                        <td style={{ padding: '0.35rem 0.75rem', textAlign: 'center' }}>
                          <StatusBadgeSelect
                            status={expense.status}
                            options={EXPENSE_ANALYSIS_STATUS_OPTIONS.filter(o => o.value !== 'all')}
                            onChange={newStatus => handleUpdateStatus(expense, newStatus)}
                            size="sm"
                          />
                        </td>

                        {/* 4. Compte / Moyen */}
                        <td style={{ 
                          padding: '0.35rem 0.75rem', 
                          color: '#64748b', 
                          fontSize: '0.785rem', 
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          <div>{accountName}</div>
                          {expense.paymentMethod && (
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                              {expense.paymentMethod === 'Chèque' && expense.checkNumber
                                ? `Chèque n° ${expense.checkNumber}`
                                : expense.paymentMethod}
                            </div>
                          )}
                        </td>

                        {/* 5. Montant débit */}
                        <td 
                          style={{ 
                            padding: '0.35rem 0.75rem',
                            textAlign: 'right', 
                            color: isRowDisabled ? 'var(--text-muted)' : '#b91c1c', 
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                            fontSize: '0.825rem'
                          }}
                        >
                          -{formatCurrency(Number(expense.amount) || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* État vide si aucune opération */}
            {groupedCategories.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                    Aucune dépense trouvée
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    Aucune opération ne correspond aux critères ou filtres sélectionnés.
                  </div>
                </td>
              </tr>
            )}
          </tbody>

          {/* 6. Ligne de Total Général consolidé en tfoot */}
          {groupedCategories.length > 0 && (
            <tfoot style={{ 
              backgroundColor: '#0f172a', 
              color: '#ffffff', 
              borderTop: '2px solid #0284c7' 
            }}>
              <tr>
                <td colSpan={3} style={{ padding: '0.65rem 0.9rem', fontWeight: 800, fontSize: '0.875rem' }}>
                  <span data-testid="table-grand-total-label">
                    {selectedStatus !== 'all' || searchQuery.trim() !== '' ? 'Total des opérations affichées' : 'Total général'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8', marginLeft: '0.5rem' }}>
                    ({tableTotalOperations} opération{tableTotalOperations > 1 ? 's' : ''} affichée{tableTotalOperations > 1 ? 's' : ''})
                  </span>
                </td>
                <td style={{ textAlign: 'right', padding: '0.65rem 0.9rem', fontWeight: 600, fontSize: '0.785rem', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Somme débits :
                </td>
                <td 
                  data-testid="table-grand-total-amount"
                  style={{ 
                    textAlign: 'right', 
                    padding: '0.65rem 0.9rem', 
                    fontWeight: 800, 
                    fontSize: '1.05rem', 
                    color: '#fca5a5',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap'
                  }}
                >
                  -{formatCurrency(tableTotalAmount)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
