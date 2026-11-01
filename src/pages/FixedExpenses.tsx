import React, { useState, useMemo, useEffect } from 'react';
import { generateId } from '../db/database';
import type { Transaction } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect } from '../components/ui/Components';
import { Plus, Edit2, Trash2, Filter, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

const FIXED_EXPENSE_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

import { useServerDataOptional } from '../contexts/ServerDataContext';
import { getCurrentMonth, getCurrentDate } from '../utils/dateUtils';

export default function FixedExpenses() {
  const serverData = useServerDataOptional();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const expenses = (serverData?.transactions || []).filter(t => t.type === 'fixed_expense');
  const categories = (serverData?.categories || []).filter(c => c.type === 'fixed_expense');
  const accounts = serverData?.accounts || [];

  const [deactivateChoiceModal, setDeactivateChoiceModal] = useState<{
    isOpen: boolean;
    source: 'table' | 'form';
    expense?: Transaction;
    pendingFormData?: {
      date: string;
      amount: number;
      recurrenceDay: number;
      formData: Partial<Transaction>;
    };
  }>({ isOpen: false, source: 'table' });

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    expense?: Transaction;
  }>({ isOpen: false });

  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [isAnnual, setIsAnnual] = useState(false); // To handle annual to monthly equivalent

  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonth());
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Génération automatique des échéances pour le mois sélectionné
  useEffect(() => {
    if (selectedMonth && serverData) {
      serverData.generateMonthlyOccurrences(selectedMonth).catch(console.error);
    }
  }, [selectedMonth, serverData]);

  // Charges impayées des mois précédents (non réglées)
  const pastUnpaidExpenses = useMemo(() => {
    if (!expenses) return [];
    const startOfSelectedMonth = `${selectedMonth}-01`;
    return expenses.filter(exp => 
      exp.date < startOfSelectedMonth &&
      exp.status !== 'cleared' &&
      exp.status !== 'disabled'
    ).sort((a, b) => a.date.localeCompare(b.date));
  }, [expenses, selectedMonth]);

  const totalPastUnpaid = useMemo(() => {
    return pastUnpaidExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [pastUnpaidExpenses]);

  const monthExpenses = useMemo(() => {
    if (!expenses) return [];
    
    const [selYear, selMonth] = selectedMonth ? selectedMonth.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    
    return expenses.filter(exp => {
      if (exp.recurrenceDay && !exp.templateId) {
        // Si la charge historique est désactivée, ne jamais la projeter sur un autre mois
        if (exp.status === 'disabled') {
          return exp.date.startsWith(selectedMonth);
        }
        return true;
      }
      return selectedMonth ? exp.date.startsWith(selectedMonth) : true;
    }).map(exp => {
      // Create a computed version for display/logic in this month
      if (exp.recurrenceDay && !exp.templateId) {
        const daysInMonth = new Date(selYear, selMonth, 0).getDate();
        const safeDay = Math.min(exp.recurrenceDay, daysInMonth);
        const computedDate = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        return { ...exp, _computedDate: computedDate };
      }
      return { ...exp, _computedDate: exp.date };
    }).sort((a, b) => a._computedDate.localeCompare(b._computedDate));
  }, [expenses, selectedMonth]);

  const displayedExpenses = useMemo(() => {
    return monthExpenses.filter(exp => {
      const matchCategory = selectedCategory ? exp.categoryId === selectedCategory : true;
      const matchStatus = selectedStatus ? exp.status === selectedStatus : true;
      return matchCategory && matchStatus;
    });
  }, [monthExpenses, selectedCategory, selectedStatus]);

  const { totalMonth, totalPaid, totalPending } = useMemo(() => {
    let totalMonth = 0;
    let totalPaid = 0;
    let totalPending = 0;

    monthExpenses.forEach(exp => {
      if (exp.status !== 'disabled') {
        const amt = Number(exp.amount) || 0;
        totalMonth += amt;
        if (exp.status === 'cleared') totalPaid += amt;
        else if (exp.status === 'pending' || exp.status === 'planned') totalPending += amt;
      }
    });

    return { totalMonth, totalPaid, totalPending };
  }, [monthExpenses]);

  const groupedExpenses = useMemo(() => {
    if (!displayedExpenses) return [];

    const groupsMap = new Map<string, {
      id: string;
      name: string;
      expenses: typeof displayedExpenses;
      total: number;
    }>();

    const knownCatMap = new Map((categories || []).map(c => [c.id, c]));

    displayedExpenses.forEach(exp => {
      const catId = exp.categoryId && knownCatMap.has(exp.categoryId) ? exp.categoryId : '__uncategorized__';
      const cat = exp.categoryId ? knownCatMap.get(exp.categoryId) : undefined;
      const catName = cat?.name || (exp.categoryId ? 'Catégorie inconnue' : 'Sans catégorie');

      if (!groupsMap.has(catId)) {
        groupsMap.set(catId, {
          id: catId,
          name: catName,
          expenses: [],
          total: 0
        });
      }
      const group = groupsMap.get(catId)!;
      group.expenses.push(exp);
      if (exp.status !== 'disabled') {
        group.total += Number(exp.amount) || 0;
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
      if (a.id === '__uncategorized__') return 1;
      if (b.id === '__uncategorized__') return -1;
      const idxA = (categories || []).findIndex(c => c.id === a.id);
      const idxB = (categories || []).findIndex(c => c.id === b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return a.name.localeCompare(b.name, 'fr');
    });
  }, [displayedExpenses, categories]);

  if (expenses === undefined || categories === undefined || accounts === undefined) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement des données...</div>;
  }

  const handleMarkCleared = async (expense: Transaction) => {
    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, 'cleared');
    }
  };

  // Actions du modal à choix de désactivation
  const handleConfirmDeactivateDurable = async () => {
    if (deactivateChoiceModal.source === 'table' && deactivateChoiceModal.expense) {
      const exp = deactivateChoiceModal.expense;
      if (serverData) {
        if (exp.templateId) {
          const tpl = serverData.recurrenceTemplates.find(t => t.id === exp.templateId);
          if (tpl) {
            await serverData.saveRecurrenceTemplate({
              ...tpl,
              disabledFromMonth: selectedMonth,
              isActive: false
            });
          }
        }
        await serverData.updateTransactionStatus(exp.id, 'disabled');
      }
    } else if (deactivateChoiceModal.source === 'form' && editingId && deactivateChoiceModal.pendingFormData) {
      const { formData: pendingData, date, amount, recurrenceDay } = deactivateChoiceModal.pendingFormData;
      if (serverData) {
        if (pendingData.templateId) {
          const tpl = serverData.recurrenceTemplates.find(t => t.id === pendingData.templateId);
          if (tpl) {
            await serverData.saveRecurrenceTemplate({
              ...tpl,
              disabledFromMonth: selectedMonth,
              isActive: false
            });
          }
        }
        await serverData.saveTransaction({
          ...pendingData,
          id: editingId,
          date,
          amount,
          recurrenceDay,
          status: 'disabled',
          isCustomized: true
        });
      }
      setIsModalOpen(false);
    }
    setDeactivateChoiceModal({ isOpen: false, source: 'table' });
  };

  const handleConfirmDeactivateSingle = async () => {
    if (deactivateChoiceModal.source === 'table' && deactivateChoiceModal.expense) {
      const exp = deactivateChoiceModal.expense;
      if (serverData) {
        await serverData.updateTransactionStatus(exp.id, 'disabled');
      }
    } else if (deactivateChoiceModal.source === 'form' && editingId && deactivateChoiceModal.pendingFormData) {
      const { formData: pendingData, date, amount, recurrenceDay } = deactivateChoiceModal.pendingFormData;
      if (serverData) {
        await serverData.saveTransaction({
          ...pendingData,
          id: editingId,
          date,
          amount,
          recurrenceDay,
          status: 'disabled',
          isCustomized: true
        });
      }
      setIsModalOpen(false);
    }
    setDeactivateChoiceModal({ isOpen: false, source: 'table' });
  };

  const handleCancelDeactivate = () => {
    setDeactivateChoiceModal({ isOpen: false, source: 'table' });
  };

  const handleUpdateStatus = async (expense: Transaction, newStatus: string) => {
    if (newStatus === 'disabled') {
      if (expense.templateId || expense.recurrenceDay) {
        setDeactivateChoiceModal({
          isOpen: true,
          source: 'table',
          expense
        });
      } else if (serverData) {
        await serverData.updateTransactionStatus(expense.id, 'disabled');
      }
      return;
    }

    if (expense.status === 'disabled' && newStatus !== 'disabled') {
      if (expense.templateId) {
        const tpl = serverData?.recurrenceTemplates.find(t => t.id === expense.templateId);
        if (tpl && (tpl.disabledFromMonth || !tpl.isActive)) {
          const isDurable = window.confirm(
            "Cette charge fixe était désactivée pour les mois futurs.\n\n" +
            "• Cliquez sur OK pour RÉACTIVER CETTE CHARGE POUR CE MOIS ET TOUS LES MOIS FUTURS.\n" +
            "• Cliquez sur Annuler pour RÉACTIVER UNIQUEMENT POUR CE MOIS (les mois suivants resteront désactivés)."
          );
          if (serverData) {
            if (isDurable) {
              await serverData.saveRecurrenceTemplate({
                ...tpl,
                disabledFromMonth: undefined,
                isActive: true
              });
            }
            await serverData.updateTransactionStatus(expense.id, newStatus as any);
            return;
          }
        }
      }
    }

    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, newStatus as any);
    }
  };

  const handleOpen = (expense?: Transaction) => {
    setIsAnnual(false); // reset
    if (expense) {
      setEditingId(expense.id);
      setFormData(expense);
    } else {
      setEditingId(null);
      setFormData({
        date: getCurrentDate(),
        recurrenceDay: new Date().getDate(),
        amount: 0,
        status: 'cleared',
        label: '',
        notes: '',
        categoryId: categories?.[0]?.id || '',
        accountId: accounts?.[0]?.id || '',
        type: 'fixed_expense'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId || !formData.categoryId || formData.amount === undefined || isNaN(formData.amount)) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    
    const finalAmount = isAnnual ? Number(formData.amount) / 12 : Number(formData.amount);
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(selYear, selMonth, 0).getDate();
    const safeDay = Math.min(Math.max(1, formData.recurrenceDay || 1), daysInMonth);
    const realDate = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

    if (editingId) {
      const existing = serverData?.transactions.find(t => t.id === editingId);
      const targetStatus = formData.status;

      // Cas 1 : Désactivation depuis le formulaire Modifier
      if (targetStatus === 'disabled' && existing?.status !== 'disabled' && (formData.templateId || formData.recurrenceDay)) {
        setDeactivateChoiceModal({
          isOpen: true,
          source: 'form',
          pendingFormData: {
            date: realDate,
            amount: finalAmount,
            recurrenceDay: safeDay,
            formData
          }
        });
        return;
      }

      if (formData.templateId) {
        // Cas 2 : Réactivation depuis le formulaire Modifier
        if (existing?.status === 'disabled' && targetStatus && targetStatus !== 'disabled') {
          const tpl = serverData?.recurrenceTemplates.find(t => t.id === formData.templateId);
          if (tpl && (tpl.disabledFromMonth || !tpl.isActive)) {
            const isDurable = window.confirm(
              "Cette charge fixe était désactivée pour les mois futurs.\n\n" +
              "• Cliquez sur OK pour RÉACTIVER CETTE CHARGE POUR CE MOIS ET TOUS LES MOIS FUTURS.\n" +
              "• Cliquez sur Annuler pour RÉACTIVER UNIQUEMENT POUR CE MOIS (les mois suivants resteront désactivés)."
            );

            if (serverData) {
              if (isDurable) {
                await serverData.saveRecurrenceTemplate({
                  ...tpl,
                  disabledFromMonth: undefined,
                  isActive: true
                });
              }
              await serverData.saveTransaction({
                ...formData,
                id: editingId,
                date: realDate,
                amount: finalAmount,
                recurrenceDay: safeDay,
                isCustomized: true
              });
            }
          } else {
            if (serverData) {
              await serverData.saveTransaction({
                ...formData,
                id: editingId,
                date: realDate,
                amount: finalAmount,
                recurrenceDay: safeDay,
                isCustomized: true
              });
            }
          }
        } else {
          // Modification normale de l'occurrence du mois sélectionné avec protection isCustomized
          if (serverData) {
            await serverData.saveTransaction({
              ...formData,
              id: editingId,
              date: realDate,
              amount: finalAmount,
              recurrenceDay: safeDay,
              isCustomized: true
            });
          }
        }
      } else if (formData.recurrenceDay) {
        if (serverData) {
          const tpl = await serverData.saveRecurrenceTemplate({
            type: 'fixed_expense',
            amount: finalAmount,
            recurrenceDay: safeDay,
            accountId: formData.accountId,
            categoryId: formData.categoryId,
            label: formData.label,
            notes: formData.notes,
            startDate: selectedMonth,
            isActive: true
          });
          await serverData.saveTransaction({
            ...formData,
            id: editingId,
            templateId: tpl.id,
            amount: finalAmount,
            date: realDate,
            status: formData.status
          });
        }
      } else {
        if (serverData) {
          await serverData.saveTransaction({
            ...formData,
            id: editingId,
            date: realDate,
            amount: finalAmount,
            type: 'fixed_expense'
          });
        }
      }
    } else {
      const targetStatus = formData.status || 'planned';
      if (serverData) {
        const tpl = await serverData.saveRecurrenceTemplate({
          type: 'fixed_expense',
          amount: finalAmount,
          recurrenceDay: safeDay,
          accountId: formData.accountId,
          categoryId: formData.categoryId,
          label: formData.label || '',
          notes: formData.notes || '',
          startDate: selectedMonth,
          isActive: true
        });
        const occId = `${tpl.id}_${selectedMonth}`;
        await serverData.saveTransaction({
          id: occId,
          type: 'fixed_expense',
          label: formData.label || '',
          amount: finalAmount,
          accountId: formData.accountId,
          categoryId: formData.categoryId,
          recurrenceDay: safeDay,
          date: realDate,
          expectedDate: realDate,
          status: targetStatus,
          templateId: tpl.id,
          isCustomized: targetStatus !== 'planned',
          notes: formData.notes || ''
        });
        await serverData.generateMonthlyOccurrences(selectedMonth);
        await serverData.refreshAll();
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (expense: Transaction) => {
    // 1. Charge déjà débitée en banque (pointée) : interdiction pour préserver l'historique financier
    if (expense.status === 'cleared') {
      alert(
        "Cette charge fixe a déjà été débitée en banque.\n\n" +
        "Pour préserver la cohérence de vos relevés passés et de vos soldes réels, elle ne peut pas être supprimée.\n\n" +
        "Si nécessaire, vous pouvez la dépointer au préalable (changer son statut en 'Prévu' ou 'En attente') en cas d'erreur de saisie."
      );
      return;
    }

    // 2. Charge ponctuelle (sans templateId) : confirmation puis suppression physique réelle
    if (!expense.templateId) {
      if (window.confirm("Voulez-vous supprimer définitivement cette charge ponctuelle ? Cela affectera vos calculs financiers.")) {
        if (serverData) {
          await serverData.deleteTransaction(expense.id);
        }
      }
      return;
    }

    // 3. Charge récurrente non pointée : ouvrir la boîte de dialogue avec 2 choix explicites
    setDeleteModalState({
      isOpen: true,
      expense
    });
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deleteModalState.expense?.templateId) return;
    try {
      if (serverData) {
        await serverData.deleteRecurrenceTemplate(deleteModalState.expense.templateId);
        await serverData.deleteTransaction(deleteModalState.expense.id);
      }
      setDeleteModalState({ isOpen: false });
    } catch (err: any) {
      console.error("Erreur lors de la suppression définitive :", err);
      alert(err.message || "Erreur lors de la suppression définitive.");
    }
  };

  const handleConfirmDeactivateMonthOnly = async () => {
    if (!deleteModalState.expense) return;
    if (serverData) {
      await serverData.updateTransactionStatus(deleteModalState.expense.id, 'disabled');
    }
    setDeleteModalState({ isOpen: false });
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Nom de la nouvelle catégorie :');
    if (name) {
      const newCat = { id: generateId(), name, type: 'fixed_expense' as const, isArchived: false };
      if (serverData) {
        const saved = await serverData.saveCategory(newCat);
        setFormData({...formData, categoryId: saved.id});
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Charges fixes</h1>
        <Button onClick={() => handleOpen()} icon={<Plus size={16} />}>Ajouter une charge</Button>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Filter size={16}/> Mois</label>
            <input 
              type="month" 
              className="form-control" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Catégorie</label>
            <select 
              className="form-control" 
              value={selectedCategory} 
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="">Toutes les catégories</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.isArchived ? '(Archivée)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Statut</label>
            <select 
              className="form-control" 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {FIXED_EXPENSE_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {(selectedCategory || selectedStatus) && (
            <div style={{ marginBottom: 0 }}>
              <Button 
                variant="outline" 
                onClick={() => { setSelectedCategory(''); setSelectedStatus(''); }}
                icon={<RotateCcw size={14} />}
                style={{ height: '38px', whiteSpace: 'nowrap' }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <Card title="Total mensuel" value={`${totalMonth.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Déjà payé" value={`${totalPaid.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Reste à payer" value={`${totalPending.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
      </div>

      {pastUnpaidExpenses.length > 0 && (
        <div style={{
          marginBottom: '1.5rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '0.5rem',
          padding: '1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 700 }}>
              <AlertTriangle size={18} />
              <span>Charges impayées / En retard des mois précédents ({pastUnpaidExpenses.length})</span>
            </div>
            <span style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}>
              Total dû : -{totalPastUnpaid.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
            </span>
          </div>
          <div className="table-container" style={{ margin: 0, backgroundColor: '#ffffff', borderRadius: '0.375rem' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Date d'origine</th>
                  <th>Libellé</th>
                  <th>Catégorie</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pastUnpaidExpenses.map(exp => {
                  const cat = categories?.find(c => c.id === exp.categoryId);
                  return (
                    <tr key={exp.id}>
                      <td><strong>{exp.date}</strong></td>
                      <td>{exp.label}</td>
                      <td>{cat?.name || 'Inconnue'}</td>
                      <td style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>
                        -{(Number(exp.amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </td>
                      <td>
                        <StatusBadgeSelect
                          status={exp.status}
                          options={FIXED_EXPENSE_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateStatus(exp, newStatus)}
                          size="sm"
                        />
                      </td>
                      <td>
                        <Button 
                          variant="outline"
                          onClick={() => handleMarkCleared(exp)}
                          icon={<CheckCircle size={14} color="#16a34a" />}
                          style={{ color: '#16a34a', borderColor: '#86efac', fontWeight: 600, padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                        >
                          Marquer réglé
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

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date prévue</th>
              <th>Libellé</th>
              <th>Montant (Mensuel)</th>
              <th>Statut</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupedExpenses.map(group => {
              const isCollapsed = !!collapsedCategories[group.id];
              return (
                <React.Fragment key={group.id}>
                  <tr 
                    className="category-header-row"
                    onClick={() => toggleCategoryCollapse(group.id)}
                  >
                    <td colSpan={6}>
                      <div className="category-header-content">
                        <div className="category-header-left">
                          <span className="category-chevron-box">
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </span>
                          <span className="category-header-title">
                            {group.name}
                          </span>
                          <span className="category-count-badge">
                            {group.expenses.length} {group.expenses.length > 1 ? 'opérations' : 'opération'}
                          </span>
                        </div>
                        <div className="category-header-right">
                          <span className="category-subtotal-label">Sous-total :</span>
                          <span className="category-subtotal-value">
                            -{group.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed && group.expenses.map(expense => {
                    // @ts-ignore
                    const displayDate = expense.recurrenceDay ? `Le ${expense.recurrenceDay} de chaque mois (réel: ${expense._computedDate})` : expense.date;
                    return (
                      <tr key={expense.id} style={{ opacity: expense.status === 'disabled' ? 0.5 : 1 }}>
                        <td>{displayDate}</td>
                        <td>{expense.label}</td>
                        <td style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>-{(Number(expense.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</td>
                        <td>
                          <StatusBadgeSelect
                            status={expense.status}
                            options={FIXED_EXPENSE_STATUS_OPTIONS}
                            onChange={newStatus => handleUpdateStatus(expense, newStatus)}
                          />
                        </td>
                        <td>{expense.notes}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button variant="icon" onClick={() => handleOpen(expense)}><Edit2 size={16} /></Button>
                            <Button variant="icon" onClick={() => handleDelete(expense)}><Trash2 size={16} color="var(--danger-color)" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
            {groupedExpenses.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                  {monthExpenses.length === 0 
                    ? `Aucune charge fixe enregistrée pour ce mois.` 
                    : "Aucune charge fixe ne correspond aux filtres sélectionnés."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Modifier la charge' : 'Ajouter une charge'}>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Jour de prélèvement (1-31)</label>
            <input 
              type="number" 
              min="1" 
              max="31" 
              className="form-control" 
              required 
              value={formData.recurrenceDay || ''} 
              onChange={e => setFormData({...formData, recurrenceDay: parseInt(e.target.value, 10)})} 
            />
            <small style={{ color: 'var(--text-light)', display: 'block', marginTop: '0.25rem' }}>
              Ce jour sera appliqué tous les mois. S'il n'existe pas (ex: 31 février), le dernier jour du mois sera utilisé.
            </small>
          </div>
          <div className="form-group">
            <label className="form-label">Libellé</label>
            <input type="text" className="form-control" value={formData.label || ''} onChange={e => setFormData({...formData, label: e.target.value})} />
          </div>
          
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
             <input type="checkbox" id="isAnnual" checked={isAnnual} onChange={e => setIsAnnual(e.target.checked)} />
             <label htmlFor="isAnnual" className="checkbox-label" style={{margin: 0}}>Ceci est un montant annuel (sera divisé par 12)</label>
          </div>

          <div className="form-group">
            <label className="form-label">Montant {isAnnual ? 'Annuel' : 'Mensuel'} (€)</label>
            <input type="number" step="0.01" className="form-control" required value={formData.amount === undefined ? '' : formData.amount} onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} />
          </div>
          
          <div className="form-group">
            <label className="form-label">Catégorie</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="form-control" required value={formData.categoryId || ''} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                <option value="">Sélectionner...</option>
                {categories?.filter(c => !c.isArchived || c.id === formData.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.isArchived ? ' (Archivée)' : ''}</option>)}
              </select>
              <Button variant="outline" onClick={handleAddCategory} type="button" icon={<Plus size={16} />}></Button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Compte</label>
            <AccountSelect
              value={formData.accountId || ''}
              onChange={id => setFormData({ ...formData, accountId: id })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Statut</label>
            <select className="form-control" required value={formData.status || 'cleared'} onChange={e => setFormData({...formData, status: e.target.value as any})}>
              <option value="cleared">Débité</option>
              <option value="pending">En attente</option>
              <option value="planned">Prévu</option>
              <option value="disabled">Désactivé</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input type="text" className="form-control" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* Modal de désactivation récurrente avec 3 choix explicites */}
      <Modal 
        isOpen={deactivateChoiceModal.isOpen} 
        onClose={handleCancelDeactivate} 
        title="Désactivation d'une charge fixe récurrente"
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ marginBottom: '1rem', lineHeight: '1.5', color: 'var(--text-main, #1e293b)' }}>
            Cette charge fixe est associée à une récurrence mensuelle. Quel type de désactivation souhaitez-vous appliquer ?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button 
              type="button"
              variant="danger" 
              onClick={handleConfirmDeactivateDurable}
              style={{ justifyContent: 'center', padding: '0.75rem 1rem', textAlign: 'center' }}
            >
              1. Désactiver définitivement (ce mois et tous les mois futurs)
            </Button>
            
            <Button 
              type="button"
              variant="outline" 
              onClick={handleConfirmDeactivateSingle}
              style={{ justifyContent: 'center', padding: '0.75rem 1rem', textAlign: 'center' }}
            >
              2. Désactiver ce mois uniquement (les mois suivants resteront actifs)
            </Button>

            <Button 
              type="button"
              variant="outline" 
              onClick={handleCancelDeactivate}
              style={{ justifyContent: 'center', padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}
            >
              3. Annuler (conserver l'état actuel)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de suppression d'une charge récurrente */}
      <Modal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState({ isOpen: false })}
        title="Supprimer ou désactiver la charge"
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ marginBottom: '1rem' }}>
            Que souhaitez-vous faire pour la charge <strong>{deleteModalState.expense?.label || 'Charge fixe'}</strong> ({Number(deleteModalState.expense?.amount).toFixed(2)} €) ?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Option 1 : Supprimer définitivement */}
            <div style={{ border: '1px solid #fee2e2', backgroundColor: '#fff5f5', borderRadius: '6px', padding: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--danger-color)', marginBottom: '0.25rem' }}>
                Option 1 — Supprimer définitivement la charge récurrente
              </div>
              <div style={{ fontSize: '0.8rem', color: '#7f1d1d', marginBottom: '0.5rem' }}>
                Supprime définitivement le modèle récurrent ainsi que les échéances courantes et futures non pointées. L'historique passé et les échéances déjà pointées sont intégralement préservés.
              </div>
              <Button
                variant="primary"
                style={{ backgroundColor: 'var(--danger-color)' }}
                onClick={handleConfirmPermanentDelete}
              >
                Supprimer définitivement la récurrence
              </Button>
            </div>

            {/* Option 2 : Désactiver uniquement ce mois */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                Option 2 — Désactiver cette échéance uniquement
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Désactive uniquement l'échéance de {selectedMonth}. La récurrence reste active pour les autres mois.
              </div>
              <Button
                variant="outline"
                onClick={handleConfirmDeactivateMonthOnly}
              >
                Désactiver uniquement ce mois ({selectedMonth})
              </Button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="outline" onClick={() => setDeleteModalState({ isOpen: false })}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
