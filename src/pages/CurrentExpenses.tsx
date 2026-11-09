import React, { useState, useMemo } from 'react';
import type { Transaction } from '../db/database';
import { Card, Button, StatusBadgeSelect } from '../components/ui/Components';
import { Plus, Edit2, Trash2, Filter, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import ExpenseModal, { PAYMENT_METHODS, type PaymentMethod } from '../components/transactions/ExpenseModal';
export { PAYMENT_METHODS };
export type { PaymentMethod };

const CURRENT_EXPENSE_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

import { useServerDataOptional } from '../contexts/ServerDataContext';
import { getCurrentMonth } from '../utils/dateUtils';

export default function CurrentExpenses() {
  const serverData = useServerDataOptional();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const expenses = serverData ? serverData.transactions.filter(t => t.type === 'daily') : [];
  const categories = useMemo(() => {
    return serverData ? serverData.categories.filter(c => c.type === 'daily') : [];
  }, [serverData?.categories]);
  const accounts = serverData ? serverData.accounts : [];

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

  // Dépenses courantes impayées des mois précédents (non réglées)
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
    return expenses.filter(exp => {
      return selectedMonth ? exp.date.startsWith(selectedMonth) : true;
    }).sort((a, b) => a.date.localeCompare(b.date));
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

  const handleUpdateStatus = async (expense: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, newStatus as any);
    }
  };


  const editingExpense = useMemo(() => {
    if (!editingId || !expenses) return null;
    return expenses.find(e => e.id === editingId) || null;
  }, [expenses, editingId]);

  const handleOpen = (expense?: Transaction) => {
    setEditingId(expense ? expense.id : null);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (transactionToSave: Transaction) => {
    if (serverData) {
      await serverData.saveTransaction(transactionToSave);
    }
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Supprimer cette dépense ?')) {
      if (serverData) {
        await serverData.deleteTransaction(id);
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Dépenses Courantes</h1>
        <Button onClick={() => handleOpen()} icon={<Plus size={16} />}>Ajouter une dépense</Button>
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
              {CURRENT_EXPENSE_STATUS_OPTIONS.map(opt => (
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
              <span>Dépenses impayées / En retard des mois précédents ({pastUnpaidExpenses.length})</span>
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
                          options={CURRENT_EXPENSE_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateStatus(exp, newStatus)}
                          size="sm"
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Button 
                            variant="outline"
                            onClick={() => handleMarkCleared(exp)}
                            icon={<CheckCircle size={14} color="#16a34a" />}
                            style={{ color: '#16a34a', borderColor: '#86efac', fontWeight: 600, padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            Marquer réglé
                          </Button>
                          <Button 
                            variant="icon" 
                            onClick={() => handleDelete(exp.id)}
                            title="Supprimer cette dépense"
                          >
                            <Trash2 size={16} color="var(--danger-color)" />
                          </Button>
                        </div>
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
              <th>Date</th>
              <th>Libellé</th>
              <th>Montant</th>
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
                  {!isCollapsed && group.expenses.map(expense => (
                    <tr key={expense.id} style={{ opacity: expense.status === 'disabled' ? 0.5 : 1 }}>
                      <td>{expense.date}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{expense.label}</div>
                        {expense.paymentMethod && (
                          <div 
                            data-testid={`payment-method-badge-${expense.id}`}
                            style={{ 
                              fontSize: '0.72rem', 
                              color: 'var(--text-muted)', 
                              marginTop: '0.15rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <span>💳</span>
                            <span>
                              {expense.paymentMethod === 'Chèque' && expense.checkNumber 
                                ? `Chèque n° ${expense.checkNumber}` 
                                : expense.paymentMethod}
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>-{(Number(expense.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</td>
                      <td>
                        <StatusBadgeSelect
                          status={expense.status}
                          options={CURRENT_EXPENSE_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateStatus(expense, newStatus)}
                        />
                      </td>
                      <td>{expense.notes}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button variant="icon" onClick={() => handleOpen(expense)}><Edit2 size={16} /></Button>
                          <Button variant="icon" onClick={() => handleDelete(expense.id)}><Trash2 size={16} color="var(--danger-color)" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {groupedExpenses.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                  {monthExpenses.length === 0 
                    ? `Aucune dépense enregistrée pour ce mois.` 
                    : "Aucune dépense ne correspond aux filtres sélectionnés."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSave={handleSave}
        editingTransaction={editingExpense}
        categories={categories}
        accounts={accounts}
      />
    </div>
  );
}
