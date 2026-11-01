import React, { useState, useMemo } from 'react';
import type { Transaction } from '../db/database';
import { Card, Button } from '../components/ui/Components';
import { 
  CalendarClock, 
  Plus, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight, 
  Filter, 
  RotateCcw, 
  Edit2, 
  Calendar,
  Layers,
  Clock
} from 'lucide-react';
import ExpenseModal from '../components/transactions/ExpenseModal';
import { useServerDataOptional } from '../contexts/ServerDataContext';

/**
 * Prédicat d'identification des dépenses futures éligibles.
 * 
 * Règle fonctionnelle stricte :
 * 1. Transaction ponctuelle uniquement (type === 'daily')
 * 2. Non récurrente (ni templateId ni recurrenceDay)
 * 3. Non soldée (status !== 'cleared' && status !== 'disabled')
 * 4. Soit date future/du jour (date >= todayStr)
 * 5. Soit date passée UNIQUEMENT si planifiée à l'origine dans le futur (expectedDate renseigné)
 * 6. Les dépenses ordinaires passées (expectedDate absent) sont formellement exclues.
 */
export function isFutureExpense(t: Transaction, todayStr: string): boolean {
  if (t.type !== 'daily') return false;
  if (t.templateId || t.recurrenceDay) return false;
  if (t.status === 'cleared' || t.status === 'disabled') return false;

  const currentMonthKey = todayStr.slice(0, 7);

  // 1. Mois strictement futurs (ex: > 2026-11)
  if (t.date.slice(0, 7) > currentMonthKey) return true;

  // 2. Mois passés (antérieurs au mois en cours) : éligibles UNIQUEMENT si planifiées à l'origine dans le futur (en retard)
  if (t.date.slice(0, 7) < currentMonthKey && t.expectedDate && t.expectedDate.trim() !== '') return true;

  // 3. Mois en cours (ex: 2026-11) ou dépenses passées ordinaires : formellement exclues des dépenses futures
  return false;
}

/**
 * Renvoie la date du jour au format local YYYY-MM-DD
 */
export const getLocalTodayString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Formate un mois YYYY-MM en libellé lisible en français (ex: "Novembre 2026")
 */
export const formatMonthTitle = (monthKey: string): string => {
  if (!monthKey || !monthKey.includes('-')) return monthKey;
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const date = new Date(year, month - 1, 1);
  const str = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Formate une date YYYY-MM-DD en DD/MM/YYYY
 */
export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Calcule le mois cible en ajoutant N mois à un mois YYYY-MM
 */
export const addMonthsToKey = (startMonthKey: string, count: number): string => {
  const [yearStr, monthStr] = startMonthKey.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + count - 1;
  while (month > 12) {
    year += 1;
    month -= 12;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Prévu',
  pending: 'En attente',
  cleared: 'Débité',
  disabled: 'Désactivé'
};

export default function FutureExpenses() {
  const serverData = useServerDataOptional();
  const todayStr = useMemo(() => getLocalTodayString(), []);
  const currentMonthKey = todayStr.slice(0, 7);
  const max12MonthsKey = useMemo(() => addMonthsToKey(currentMonthKey, 12), [currentMonthKey]);

  // Données brutes
  const allDailyExpenses = useMemo(() => {
    return serverData ? serverData.transactions.filter(t => t.type === 'daily') : [];
  }, [serverData]);

  const categories = useMemo(() => {
    return serverData ? serverData.categories.filter(c => c.type === 'daily') : [];
  }, [serverData?.categories]);

  const accounts = useMemo(() => {
    return serverData ? serverData.accounts : [];
  }, [serverData?.accounts]);

  const accountsMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const categoriesMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // Filtres
  const [periodFilter, setPeriodFilter] = useState<string>('next-12-months');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // États de repli des groupes de mois
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  // Modale de saisie / modification partagée
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);

  // Bascule du repli d'un mois
  const toggleMonthCollapse = (monthKey: string) => {
    setCollapsedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  // Liste globale de toutes les dépenses futures admissibles (sans filtres utilisateur)
  const allEligibleFutureExpenses = useMemo(() => {
    return allDailyExpenses.filter(t => isFutureExpense(t, todayStr));
  }, [allDailyExpenses, todayStr]);

  // Liste des mois futurs disponibles pour le filtre par mois
  const availableFutureMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(currentMonthKey);
    allEligibleFutureExpenses.forEach(t => {
      if (t.date >= todayStr) {
        monthsSet.add(t.date.slice(0, 7));
      }
    });
    return Array.from(monthsSet).sort();
  }, [allEligibleFutureExpenses, currentMonthKey, todayStr]);

  // Application des filtres utilisateur (Compte & Catégorie)
  const filteredExpenses = useMemo(() => {
    return allEligibleFutureExpenses.filter(t => {
      if (selectedAccount && t.accountId !== selectedAccount) return false;
      if (selectedCategory && t.categoryId !== selectedCategory) return false;
      return true;
    });
  }, [allEligibleFutureExpenses, selectedAccount, selectedCategory]);

  // Séparation en : En retard vs Futures à venir
  const { overdueExpenses, upcomingExpenses } = useMemo(() => {
    const overdue: Transaction[] = [];
    const upcoming: Transaction[] = [];

    filteredExpenses.forEach(t => {
      if (t.date < todayStr) {
        // Pour les dépenses en retard :
        // Si le filtre de période est un mois spécifique, on n'affiche que celles du mois concerné.
        // Sinon (12 mois ou tout l'horizon), on affiche toutes les dépenses en retard pour visibilité immédiate.
        if (periodFilter === 'next-12-months' || periodFilter === 'all') {
          overdue.push(t);
        } else if (t.date.startsWith(periodFilter)) {
          overdue.push(t);
        }
      } else {
        // Dépenses futures ou du jour
        if (periodFilter === 'next-12-months') {
          if (t.date.slice(0, 7) <= max12MonthsKey) {
            upcoming.push(t);
          }
        } else if (periodFilter === 'all') {
          upcoming.push(t);
        } else if (t.date.startsWith(periodFilter)) {
          upcoming.push(t);
        }
      }
    });

    overdue.sort((a, b) => a.date.localeCompare(b.date));
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    return { overdueExpenses: overdue, upcomingExpenses: upcoming };
  }, [filteredExpenses, todayStr, periodFilter, max12MonthsKey]);

  // Regroupement par mois des dépenses à venir
  const monthlyGroups = useMemo(() => {
    const groupsMap = new Map<string, {
      monthKey: string;
      label: string;
      items: Transaction[];
      subtotal: number;
    }>();

    upcomingExpenses.forEach(item => {
      const monthKey = item.date.slice(0, 7);
      if (!groupsMap.has(monthKey)) {
        groupsMap.set(monthKey, {
          monthKey,
          label: formatMonthTitle(monthKey),
          items: [],
          subtotal: 0
        });
      }
      const group = groupsMap.get(monthKey)!;
      group.items.push(item);
      group.subtotal += Number(item.amount) || 0;
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [upcomingExpenses]);

  // Calculs KPI
  const nextMonthKey = useMemo(() => addMonthsToKey(currentMonthKey, 1), [currentMonthKey]);
  const { totalGeneral, totalOverdue, totalNextMonth, totalOperations } = useMemo(() => {
    let general = 0;
    let overdueSum = 0;
    let nextMonthSum = 0;

    overdueExpenses.forEach(t => {
      const amt = Number(t.amount) || 0;
      general += amt;
      overdueSum += amt;
    });

    upcomingExpenses.forEach(t => {
      const amt = Number(t.amount) || 0;
      general += amt;
      if (t.date.startsWith(nextMonthKey)) {
        nextMonthSum += amt;
      }
    });

    return {
      totalGeneral: general,
      totalOverdue: overdueSum,
      totalNextMonth: nextMonthSum,
      totalOperations: overdueExpenses.length + upcomingExpenses.length
    };
  }, [overdueExpenses, upcomingExpenses, nextMonthKey]);

  // Actions
  const handleOpenAdd = () => {
    setEditingExpense(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (expense: Transaction) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleSave = async (transactionToSave: Transaction) => {
    if (serverData) {
      await serverData.saveTransaction(transactionToSave);
    }
    handleCloseModal();
  };

  const isFilterActive = periodFilter !== 'next-12-months' || selectedAccount !== '' || selectedCategory !== '';

  const handleResetFilters = () => {
    setPeriodFilter('next-12-months');
    setSelectedAccount('');
    setSelectedCategory('');
  };

  return (
    <div>
      {/* Bandeau d'en-tête de la page (Structure identique aux bandeaux de référence du tableau de bord) */}
      <div 
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderLeft: '4px solid #2563eb',
          borderRadius: 'var(--radius)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <CalendarClock size={20} color="#2563eb" />
            <span>Dépenses futures</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '0.25rem 0.65rem', borderRadius: '9999px' }}>
              Total prévisionnel : {totalGeneral.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <Button onClick={handleOpenAdd} icon={<Plus size={16} />}>
              Ajouter une dépense future
            </Button>
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0 }}>
          Dépenses ponctuelles programmées et échéances à venir
        </p>
      </div>

      {/* Barre de filtres */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted, #64748b)', fontWeight: 600, fontSize: '0.875rem' }}>
          <Filter size={16} />
          <span>Filtres :</span>
        </div>

        {/* Filtre Période */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="period-filter" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>Période</label>
          <select
            id="period-filter"
            data-testid="period-filter"
            className="form-control"
            style={{ width: 'auto', minWidth: '180px', padding: '0.4rem 0.6rem', fontSize: '0.875rem' }}
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value)}
          >
            <option value="next-12-months">12 prochains mois (par défaut)</option>
            <option value="all">Tout l'horizon</option>
            {availableFutureMonths.length > 0 && (
              <optgroup label="Mois spécifique">
                {availableFutureMonths.map(m => (
                  <option key={m} value={m}>{formatMonthTitle(m)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Filtre Compte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="account-filter" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>Compte</label>
          <select
            id="account-filter"
            data-testid="account-filter"
            className="form-control"
            style={{ width: 'auto', minWidth: '160px', padding: '0.4rem 0.6rem', fontSize: '0.875rem' }}
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
          >
            <option value="">Tous les comptes</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        {/* Filtre Catégorie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="category-filter" style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary, #475569)' }}>Catégorie</label>
          <select
            id="category-filter"
            data-testid="category-filter"
            className="form-control"
            style={{ width: 'auto', minWidth: '160px', padding: '0.4rem 0.6rem', fontSize: '0.875rem' }}
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Bouton Réinitialiser */}
        {isFilterActive && (
          <Button
            variant="outline"
            data-testid="reset-filters-btn"
            onClick={handleResetFilters}
            icon={<RotateCcw size={14} />}
            style={{ marginLeft: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          >
            Réinitialiser les filtres
          </Button>
        )}
      </div>

      {/* Cartes KPI */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <Card 
          title="Total prévisionnel" 
          value={`-${totalGeneral.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} 
        />
        <div className="card" style={{ borderColor: overdueExpenses.length > 0 ? '#f87171' : undefined }}>
          <h3 className="card-title" style={{ color: overdueExpenses.length > 0 ? '#b91c1c' : undefined }}>
            Dépenses en retard
          </h3>
          <div className="kpi-value" style={{ color: overdueExpenses.length > 0 ? '#b91c1c' : undefined }}>
            {overdueExpenses.length > 0 
              ? `-${totalOverdue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
              : '0,00 €'}
          </div>
          <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', color: overdueExpenses.length > 0 ? '#b91c1c' : 'var(--text-muted, #64748b)' }}>
            {overdueExpenses.length === 1 
              ? '1 dépense à régulariser' 
              : `${overdueExpenses.length} dépenses à régulariser`}
          </div>
        </div>
        <Card 
          title="Échéances du mois prochain" 
          value={`-${totalNextMonth.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} 
        />
        <Card 
          title="Total des opérations" 
          value={`${totalOperations}`} 
        />
      </div>

      {/* Bloc des dépenses en retard */}
      {overdueExpenses.length > 0 && (
        <div 
          data-testid="overdue-expenses-block"
          style={{
            marginBottom: '1.5rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: '0.5rem',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 700, fontSize: '1rem' }}>
              <AlertTriangle size={20} />
              <span>Dépenses en retard ({overdueExpenses.length})</span>
              <span style={{
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #f87171',
                padding: '0.15rem 0.5rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                ⚠️ Date dépassée
              </span>
            </div>
            <span style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 700 }}>
              Total dû : -{totalOverdue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
          </div>

          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: '#92400e' }}>
            Ces dépenses avaient été programmées à une date antérieure et n'ont pas encore été pointées ou réglées.
          </p>

          <div className="table-container" style={{ margin: 0, backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #fde68a', overflow: 'hidden' }}>
            <table className="table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Date d'origine</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Libellé</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Compte</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Catégorie</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Montant</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Statut</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #fde68a', background: 'transparent' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {overdueExpenses.map(exp => {
                  const account = exp.accountId ? accountsMap.get(exp.accountId) : undefined;
                  const category = exp.categoryId ? categoriesMap.get(exp.categoryId) : undefined;
                  return (
                    <tr 
                      key={exp.id}
                      onClick={() => handleOpenEdit(exp)}
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: '#ffffff',
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease'
                      }}
                      title="Cliquez pour modifier la dépense"
                    >
                      <td style={{ color: '#b91c1c', fontWeight: 700, padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        {formatDateDisplay(exp.date)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{exp.label}</div>
                        {exp.notes && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>{exp.notes}</div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{account ? account.name : '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{category ? category.name : 'Inconnue'}</td>
                      <td style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 700, padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        -{(Number(exp.amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </td>
                      <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className={`badge badge-${exp.status || 'planned'}`}>
                            {STATUS_LABELS[exp.status] || exp.status}
                          </span>
                          <span style={{
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px'
                          }}>
                            ⚠️ Date dépassée
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9' }}>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(exp);
                          }}
                          icon={<Edit2 size={14} />}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Regroupements chronologiques par mois */}
      {monthlyGroups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {monthlyGroups.map(group => {
            const isCollapsed = Boolean(collapsedMonths[group.monthKey]);
            return (
              <div 
                key={group.monthKey}
                data-testid={`month-group-${group.monthKey}`}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderLeft: '4px solid #2563eb',
                  borderRadius: 'var(--radius)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                }}
              >
                {/* En-tête du groupe de mois (cliquable pour replier/déplier) */}
                <div 
                  onClick={() => toggleMonthCollapse(group.monthKey)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    {isCollapsed ? <ChevronRight size={18} color="#2563eb" /> : <ChevronDown size={18} color="#2563eb" />}
                    <span>{group.label}</span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#1e40af',
                      background: '#dbeafe',
                      border: '1px solid #93c5fd',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '9999px'
                    }}>
                      {group.items.length === 1 ? '1 opération' : `${group.items.length} opérations`}
                    </span>
                  </h3>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1e40af', background: '#dbeafe', border: '1px solid #93c5fd', padding: '0.25rem 0.65rem', borderRadius: '9999px' }}>
                    Sous-total : -{group.subtotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </div>

                {/* Tableau des dépenses du mois (Même conteneur blanc et en-tête que les références) */}
                {!isCollapsed && (
                  <div className="dashboard-table-container" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <table className="dashboard-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#dbeafe' }}>
                          <th style={{ color: '#1e40af', fontWeight: 700 }}>Date</th>
                          <th style={{ color: '#1e40af', fontWeight: 700 }}>Libellé</th>
                          <th style={{ color: '#1e40af', fontWeight: 700 }}>Compte</th>
                          <th style={{ color: '#1e40af', fontWeight: 700 }}>Catégorie</th>
                          <th className="text-right" style={{ color: '#1e40af', fontWeight: 700 }}>Montant</th>
                          <th style={{ textAlign: 'center', color: '#1e40af', fontWeight: 700 }}>Statut</th>
                          <th className="text-right" style={{ color: '#1e40af', fontWeight: 700 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(exp => {
                          const account = exp.accountId ? accountsMap.get(exp.accountId) : undefined;
                          const category = exp.categoryId ? categoriesMap.get(exp.categoryId) : undefined;
                          const isToday = exp.date === todayStr;

                          return (
                            <tr 
                              key={exp.id}
                              onClick={() => handleOpenEdit(exp)}
                              style={{ cursor: 'pointer' }}
                              title="Cliquez pour modifier la dépense"
                            >
                              <td style={{ color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatDateDisplay(exp.date)}</span>
                                  {isToday && (
                                    <span style={{
                                      backgroundColor: '#dbeafe',
                                      color: '#1d4ed8',
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '8px',
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      marginLeft: '0.4rem'
                                    }}>
                                      Aujourd'hui
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{exp.label}</div>
                                {exp.paymentMethod && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)' }}>
                                    {exp.paymentMethod} {exp.checkNumber ? `n° ${exp.checkNumber}` : ''}
                                  </div>
                                )}
                                {exp.notes && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>
                                    {exp.notes}
                                  </div>
                                )}
                              </td>
                              <td style={{ color: '#475569' }}>{account ? account.name : '—'}</td>
                              <td style={{ color: '#475569' }}>{category ? category.name : 'Inconnue'}</td>
                              <td className="text-right" style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 700 }}>
                                -{(Number(exp.amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`badge badge-${exp.status || 'planned'}`}>
                                  {STATUS_LABELS[exp.status] || exp.status}
                                </span>
                              </td>
                              <td className="text-right">
                                <Button
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(exp);
                                  }}
                                  icon={<Edit2 size={14} />}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                >
                                  Modifier
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // État vide si aucune dépense à venir
        overdueExpenses.length === 0 && (
          <div style={{
            backgroundColor: 'var(--card-bg, #ffffff)',
            border: '1px dashed var(--border-color, #cbd5e1)',
            borderRadius: '0.5rem',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            color: 'var(--text-muted, #64748b)'
          }}>
            <CalendarClock size={40} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: 'var(--text-color, #334155)' }}>
              Aucune dépense future programmée
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.875rem' }}>
              {isFilterActive 
                ? 'Aucune dépense ne correspond aux filtres sélectionnés.' 
                : 'Planifiez vos dépenses ponctuelles futures pour anticiper vos échéances sur les mois et années à venir.'}
            </p>
            {isFilterActive ? (
              <Button variant="outline" onClick={handleResetFilters} icon={<RotateCcw size={14} />}>
                Réinitialiser les filtres
              </Button>
            ) : (
              <Button onClick={handleOpenAdd} icon={<Plus size={16} />}>
                Ajouter une dépense future
              </Button>
            )}
          </div>
        )
      )}

      {/* Modale partagée pour ajout / modification */}
      <ExpenseModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        editingTransaction={editingExpense}
        categories={categories}
        accounts={accounts}
        isFutureMode={true}
        defaultStatus="planned"
        defaultDate={todayStr}
        title={editingExpense ? 'Modifier la dépense future' : 'Ajouter une dépense future'}
      />
    </div>
  );
}
