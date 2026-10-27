import React, { useState, useMemo } from 'react';
import { generateId } from '../db/database';
import type { Transaction } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect } from '../components/ui/Components';
import { Plus, Edit2, Trash2, Filter, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

const CURRENT_EXPENSE_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

export const PAYMENT_METHODS = [
  'Carte bancaire',
  'Virement',
  'Prélèvement automatique',
  'Espèces',
  'Chèque',
  'PayPal',
  'Paiement mobile',
  'Autre'
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

import { useServerDataOptional } from '../contexts/ServerDataContext';

export default function CurrentExpenses() {
  const serverData = useServerDataOptional();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const expenses = serverData ? serverData.transactions.filter(t => t.type === 'daily') : [];
  const categories = serverData ? serverData.categories.filter(c => c.type === 'daily') : [];
  const accounts = serverData ? serverData.accounts : [];

  const [formData, setFormData] = useState<Partial<Transaction>>({});

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
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


  const handleOpen = (expense?: Transaction) => {
    if (expense) {
      setEditingId(expense.id);
      setFormData({
        ...expense,
        paymentMethod: expense.paymentMethod || '',
        checkNumber: expense.checkNumber || ''
      });
    } else {
      setEditingId(null);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        status: 'cleared',
        label: '',
        notes: '',
        paymentMethod: '',
        checkNumber: '',
        categoryId: categories?.[0]?.id || '',
        accountId: accounts?.[0]?.id || '',
        type: 'daily'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId || !formData.categoryId || formData.amount === undefined || isNaN(formData.amount)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    
    // Si le moyen de paiement n'est pas Chèque, le numéro de chèque ne doit pas être conservé
    const cleanPaymentMethod = formData.paymentMethod ? String(formData.paymentMethod).trim() : undefined;
    const cleanCheckNumber = cleanPaymentMethod === 'Chèque' && formData.checkNumber 
      ? String(formData.checkNumber).trim() 
      : undefined;

    const transactionToSave: Transaction = {
      ...formData,
      amount: Number(formData.amount),
      id: editingId || generateId(),
      type: 'daily',
      paymentMethod: cleanPaymentMethod || undefined,
      checkNumber: cleanCheckNumber || undefined
    } as Transaction;

    // Supprimer les clés si undefined pour garder un objet propre
    if (!transactionToSave.paymentMethod) delete transactionToSave.paymentMethod;
    if (!transactionToSave.checkNumber) delete transactionToSave.checkNumber;

    if (serverData) {
      await serverData.saveTransaction(transactionToSave);
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Supprimer cette dépense ?')) {
      if (serverData) {
        await serverData.deleteTransaction(id);
      }
    }
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Nom de la nouvelle catégorie :');
    if (name) {
      const newCat = { id: generateId(), name, type: 'daily' as const, isArchived: false };
      if (serverData) {
        const saved = await serverData.saveCategory(newCat);
        setFormData({ ...formData, categoryId: saved.id });
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Modifier la dépense' : 'Ajouter une dépense'}>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input type="date" className="form-control" required value={formData.date || ''} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Libellé</label>
            <input type="text" className="form-control" required placeholder="Ex: Courses, Restaurant..." value={formData.label || ''} onChange={e => setFormData({...formData, label: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Montant (€)</label>
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
            <label className="form-label">Moyen de paiement</label>
            <select 
              data-testid="payment-method-select"
              className="form-control" 
              value={formData.paymentMethod || ''} 
              onChange={e => {
                const nextMethod = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  paymentMethod: nextMethod,
                  // Si l'utilisateur quitte 'Chèque', effacer immédiatement le numéro de chèque
                  checkNumber: nextMethod === 'Chèque' ? prev.checkNumber : ''
                }));
              }}
            >
              <option value="">Non spécifié</option>
              {PAYMENT_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
          {formData.paymentMethod === 'Chèque' && (
            <div className="form-group" data-testid="check-number-group">
              <label className="form-label">Numéro de chèque</label>
              <input 
                data-testid="check-number-input"
                type="text" 
                className="form-control" 
                placeholder="Ex: 001245" 
                value={formData.checkNumber || ''} 
                onChange={e => setFormData({ ...formData, checkNumber: e.target.value })} 
              />
            </div>
          )}
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
    </div>
  );
}
