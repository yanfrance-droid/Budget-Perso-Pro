import React, { useState, useMemo } from 'react';
import { generateId } from '../db/database';
import type { Transaction } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect } from '../components/ui/Components';
import { Plus, Edit2, Trash2, DollarSign, CheckCircle2, AlertCircle, Filter, RotateCcw } from 'lucide-react';
import { calculateMonthlyHealthSummary } from '../engine/calculations';

const HEALTH_EXPENSE_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

const HEALTH_REIMBURSEMENT_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Reçu (Encaissé)' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

const HEALTH_FILTER_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité (Soin) / Reçu (Remb.)' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

import { useServerDataOptional } from '../contexts/ServerDataContext';

export default function Health() {
  const serverData = useServerDataOptional();
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isReimbursementModalOpen, setIsReimbursementModalOpen] = useState(false);
  
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingReimbursementId, setEditingReimbursementId] = useState<string | null>(null);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const expenses = serverData ? serverData.transactions.filter(t => t.type === 'health_expense') : [];
  const reimbursements = serverData ? serverData.transactions.filter(t => t.type === 'health_reimbursement') : [];
  const categories = serverData ? serverData.categories.filter(c => c.type === 'health_expense') : [];
  const accounts = serverData ? serverData.accounts : [];

  const [expenseForm, setExpenseForm] = useState<Partial<Transaction>>({});
  const [reimbursementForm, setReimbursementForm] = useState<Partial<Transaction>>({});

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // 1. Dépenses dont la date de soin est dans le mois sélectionné
  const monthExpenses = useMemo(() => {
    return expenses?.filter(e => e.date.startsWith(selectedMonth)) || [];
  }, [expenses, selectedMonth]);

  // Dépenses de soins filtrées pour l'affichage
  const displayedExpenses = useMemo(() => {
    return monthExpenses.filter(e => {
      const matchCat = selectedCategory ? e.categoryId === selectedCategory : true;
      const matchStat = selectedStatus ? e.status === selectedStatus : true;
      return matchCat && matchStat;
    });
  }, [monthExpenses, selectedCategory, selectedStatus]);

  // 2. Remboursements dont la propre date d'encaissement/attente est dans le mois sélectionné
  const monthReimbursements = useMemo(() => {
    return reimbursements?.filter(r => r.date.startsWith(selectedMonth)) || [];
  }, [reimbursements, selectedMonth]);

  // 3. Remboursements de ce mois dont la dépense de soin d'origine date d'un mois antérieur (ou externe)
  const pastCareReimbursementsThisMonth = useMemo(() => {
    return monthReimbursements.filter(r => !monthExpenses.some(e => e.id === r.linkedId));
  }, [monthReimbursements, monthExpenses]);

  // Remboursements de soins antérieurs filtrés pour l'affichage
  const displayedPastCareReimbursementsThisMonth = useMemo(() => {
    return pastCareReimbursementsThisMonth.filter(r => {
      const matchStat = selectedStatus ? r.status === selectedStatus : true;
      let matchCat = true;
      if (selectedCategory) {
        const linkedExp = expenses?.find(e => e.id === r.linkedId);
        matchCat = linkedExp?.categoryId === selectedCategory;
      }
      return matchStat && matchCat;
    });
  }, [pastCareReimbursementsThisMonth, selectedStatus, selectedCategory, expenses]);

  // 4. Dépenses de santé antérieures encore impayées (non débitées)
  const pastUnpaidHealthExpenses = useMemo(() => {
    return expenses?.filter(e => e.date < `${selectedMonth}-01` && e.status !== 'cleared' && e.status !== 'disabled') || [];
  }, [expenses, selectedMonth]);

  // 5. Remboursements à recevoir (statuts 'planned' ou 'pending')
  const pendingReimbursements = useMemo(() => {
    return reimbursements
      ?.filter(r => r.status === 'planned' || r.status === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date)) || [];
  }, [reimbursements]);

  // Remboursements en attente filtrés pour l'affichage
  const displayedPendingReimbursements = useMemo(() => {
    return pendingReimbursements.filter(r => {
      const matchStat = selectedStatus ? r.status === selectedStatus : true;
      let matchCat = true;
      if (selectedCategory) {
        const linkedExp = expenses?.find(e => e.id === r.linkedId);
        matchCat = linkedExp?.categoryId === selectedCategory;
      }
      return matchStat && matchCat;
    });
  }, [pendingReimbursements, selectedStatus, selectedCategory, expenses]);

  // 6. Remboursements attendus des mois passés non encore encaissés (retards)
  const pastPendingReimbursements = useMemo(() => {
    return pendingReimbursements.filter(r => r.date < `${selectedMonth}-01`);
  }, [pendingReimbursements, selectedMonth]);

  // 7. Synthèse financière mensuelle rigoureuse
  // Dépenses de soin du mois vs Remboursements reçus/attendus durant ce mois (retards compris)
  const { totalExpense, totalReimbursed, totalExpected, totalRemaining } = useMemo(() => {
    if (!expenses || !reimbursements) return { totalExpense: 0, totalReimbursed: 0, totalExpected: 0, totalRemaining: 0 };
    return calculateMonthlyHealthSummary(monthExpenses, monthReimbursements, pastPendingReimbursements);
  }, [monthExpenses, monthReimbursements, pastPendingReimbursements, expenses, reimbursements]);

  if (expenses === undefined || categories === undefined || accounts === undefined || reimbursements === undefined) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement des données...</div>;
  }

  const handleOpenExpense = (expense?: Transaction) => {
    if (expense) {
      setEditingExpenseId(expense.id);
      setExpenseForm(expense);
    } else {
      setEditingExpenseId(null);
      setExpenseForm({
        date: `${selectedMonth}-${new Date().toISOString().slice(8, 10)}`,
        amount: 0,
        status: 'cleared',
        label: '',
        notes: '',
        categoryId: categories?.[0]?.id || '',
        accountId: accounts?.[0]?.id || '',
        type: 'health_expense'
      });
    }
    setIsExpenseModalOpen(true);
  };

  const handleOpenReimbursement = (expenseId?: string, reimbursement?: Transaction) => {
    const effectiveExpenseId = expenseId || reimbursement?.linkedId || null;
    setSelectedExpenseId(effectiveExpenseId);
    if (reimbursement) {
      setEditingReimbursementId(reimbursement.id);
      setReimbursementForm(reimbursement);
    } else {
      setEditingReimbursementId(null);
      setReimbursementForm({
        date: `${selectedMonth}-${new Date().toISOString().slice(8, 10)}`,
        amount: 0,
        status: 'pending',
        label: 'Sécurité Sociale', // par défaut organisme
        notes: '',
        accountId: accounts?.[0]?.id || '',
        type: 'health_reimbursement',
        linkedId: effectiveExpenseId || undefined
      });
    }
    setIsReimbursementModalOpen(true);
  };

  const handleQuickClearExpense = async (expense: Transaction) => {
    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, 'cleared');
    }
  };

  const handleQuickClearReimbursement = async (reimb: Transaction) => {
    if (reimb.status === 'cleared') return;
    if (serverData) {
      await serverData.updateTransactionStatus(reimb.id, 'cleared');
    }
  };

  const handleUpdateExpenseStatus = async (expense: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateTransactionStatus(expense.id, newStatus as any);
    }
  };

  const handleUpdateReimbursementStatus = async (reimb: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateTransactionStatus(reimb.id, newStatus as any);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.accountId || !expenseForm.categoryId || expenseForm.amount === undefined || isNaN(expenseForm.amount)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    
    const payload: Transaction = {
      ...expenseForm,
      amount: Number(expenseForm.amount),
      id: editingExpenseId || generateId(),
      type: 'health_expense'
    } as Transaction;

    if (serverData) {
      await serverData.saveTransaction(payload);
    }
    setIsExpenseModalOpen(false);
  };

  const handleSaveReimbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reimbursementForm.accountId || reimbursementForm.amount === undefined || isNaN(reimbursementForm.amount)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }
    
    const payload: Transaction = {
      ...reimbursementForm,
      amount: Number(reimbursementForm.amount),
      id: editingReimbursementId || generateId(),
      linkedId: selectedExpenseId || reimbursementForm.linkedId,
      type: 'health_reimbursement'
    } as Transaction;

    if (serverData) {
      await serverData.saveTransaction(payload);
    }
    setIsReimbursementModalOpen(false);
  };

  const handleDeleteExpense = async (id: string) => {
    if (window.confirm('Supprimer cette dépense et tous ses remboursements associés ?')) {
      const relatedReimbs = reimbursements.filter(r => r.linkedId === id);
      const idsToDelete = [id, ...relatedReimbs.map(r => r.id)];
      if (serverData) {
        for (const delId of idsToDelete) {
          await serverData.deleteTransaction(delId);
        }
      }
    }
  };

  const handleDeleteReimbursement = async (id: string) => {
    if (window.confirm('Supprimer ce remboursement ?')) {
      if (serverData) {
        await serverData.deleteTransaction(id);
      }
    }
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Nom de la nouvelle catégorie santé :');
    if (name) {
      const newCat = { id: generateId(), name, type: 'health_expense' as const, isArchived: false };
      if (serverData) {
        const saved = await serverData.saveCategory(newCat);
        setExpenseForm({...expenseForm, categoryId: saved.id});
      }
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Santé et Remboursements</h1>
        <Button onClick={() => handleOpenExpense()} icon={<Plus size={16} />}>Ajouter une dépense médicale</Button>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Filter size={16}/> Mois</label>
            <input 
              type="month" 
              className="form-control" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Catégorie de soins</label>
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
              {HEALTH_FILTER_STATUS_OPTIONS.map(opt => (
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

      {/* Cartes de synthèse du mois sélectionné */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <Card title="Soins du mois" value={`${totalExpense.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Remboursé (reçu ce mois)" value={`${totalReimbursed.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Remboursé (attendu ce mois)" value={`${totalExpected.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card 
          title="Solde net santé du mois" 
          value={`${totalRemaining.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} 
        />
      </div>

      {/* Alerte dépenses de santé antérieures impayées */}
      {pastUnpaidHealthExpenses.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--warning-color, #f59e0b)', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#b45309', fontWeight: 600 }}>
            <AlertCircle size={18} />
            <span>⚠️ {pastUnpaidHealthExpenses.length} dépense(s) médicale(s) antérieure(s) non débitée(s)</span>
          </div>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#92400e' }}>
            Ces dépenses de soins datent de mois précédents mais restent dues (non pointées « Débité »). Elles sont prises en compte dans votre solde prévisionnel global tant qu'elles ne sont pas réglées.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pastUnpaidHealthExpenses.map(pExp => (
              <div key={pExp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #fde68a', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <strong>{pExp.date}</strong> — {pExp.label} ({Number(pExp.amount).toFixed(2)} €) — 
                  <StatusBadgeSelect
                    status={pExp.status}
                    options={HEALTH_EXPENSE_STATUS_OPTIONS}
                    onChange={newStatus => handleUpdateExpenseStatus(pExp, newStatus)}
                    size="sm"
                  />
                </div>
                <Button variant="outline" onClick={() => handleQuickClearExpense(pExp)} icon={<CheckCircle2 size={14} />}>
                  Pointer réglé
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section : Remboursements à recevoir */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DollarSign size={20} color="var(--primary-color)" /> Remboursements à recevoir
          </h2>
          {pendingReimbursements.length > 0 && (
            <span className="badge badge-pending" style={{ fontSize: '0.8rem' }}>
              {pendingReimbursements.length} en attente ({pendingReimbursements.reduce((sum, r) => sum + (Number(r.amount) || 0), 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €)
            </span>
          )}
        </div>

        {displayedPendingReimbursements.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date prévue</th>
                  <th>Soin / Dépense d'origine</th>
                  <th>Organisme / Libellé</th>
                  <th>Montant attendu</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedPendingReimbursements.map(reimb => {
                  const linkedExpense = expenses.find(e => e.id === reimb.linkedId);
                  return (
                    <tr key={reimb.id}>
                      <td style={{ fontWeight: 600 }}>{reimb.date}</td>
                      <td>
                        {linkedExpense ? (
                          <div>
                            <strong>{linkedExpense.label}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                              Soin du {linkedExpense.date} ({Number(linkedExpense.amount).toFixed(2)} €)
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>
                            {reimb.label || 'Dépense de santé non liée'}
                          </span>
                        )}
                      </td>
                      <td>{reimb.label || 'Remboursement'}</td>
                      <td style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>
                        +{Number(reimb.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </td>
                      <td>
                        <StatusBadgeSelect
                          status={reimb.status}
                          options={HEALTH_REIMBURSEMENT_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateReimbursementStatus(reimb, newStatus)}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Button
                            variant="outline"
                            onClick={() => handleQuickClearReimbursement(reimb)}
                            icon={<CheckCircle2 size={14} color="var(--success-color)" />}
                            title="Marquer ce remboursement comme encaissé"
                          >
                            Marquer encaissé
                          </Button>
                          <Button 
                            variant="icon" 
                            onClick={() => handleOpenReimbursement(reimb.linkedId, reimb)} 
                            title="Modifier"
                          >
                            <Edit2 size={16} />
                          </Button>
                          <Button 
                            variant="icon" 
                            onClick={() => handleDeleteReimbursement(reimb.id)} 
                            title="Supprimer"
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
        ) : (
          <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-light)', backgroundColor: 'var(--bg-color, #f9fafb)', borderRadius: '6px' }}>
            Aucun remboursement en attente
          </div>
        )}
      </div>

      {/* Section 1 : Dépenses de santé du mois */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Dépenses de soins du mois ({selectedMonth})</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date de soin</th>
                <th>Libellé</th>
                <th>Catégorie</th>
                <th>Montant</th>
                <th>Remboursements</th>
                <th>Reste à charge</th>
                <th>Statut</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedExpenses.map(expense => {
                const cat = categories.find(c => c.id === expense.categoryId);
                const expReimbs = reimbursements.filter(r => r.linkedId === expense.id);
                
                let clearedR = 0;
                let expectedR = 0;
                expReimbs.forEach(r => {
                  const amt = Number(r.amount) || 0;
                  if (r.status === 'cleared') clearedR += amt;
                  else if (r.status !== 'disabled') expectedR += amt;
                });

                const remaining = Math.max(0, (Number(expense.amount) || 0) - clearedR);

                return (
                  <tr key={expense.id} style={{ opacity: expense.status === 'disabled' ? 0.5 : 1 }}>
                    <td>{expense.date}</td>
                    <td>{expense.label}</td>
                    <td>{cat?.name || 'Inconnue'}</td>
                    <td style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>
                      -{(Number(expense.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
                    </td>
                    <td>
                      {clearedR > 0 && <div style={{ color: 'var(--success-color)' }}>Reçu: +{clearedR.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</div>}
                      {expectedR > 0 && <div style={{ color: 'var(--warning-color)' }}>Attendu: +{expectedR.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</div>}
                      {clearedR === 0 && expectedR === 0 && <span style={{ color: 'var(--text-light)' }}>Aucun</span>}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{remaining.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</td>
                    <td>
                      <StatusBadgeSelect
                        status={expense.status}
                        options={HEALTH_EXPENSE_STATUS_OPTIONS}
                        onChange={newStatus => handleUpdateExpenseStatus(expense, newStatus)}
                      />
                    </td>
                    <td>{expense.notes}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Button variant="outline" onClick={() => handleOpenReimbursement(expense.id)} icon={<DollarSign size={14} />}>+ Remb.</Button>
                        <Button variant="icon" onClick={() => handleOpenExpense(expense)}><Edit2 size={16} /></Button>
                        <Button variant="icon" onClick={() => handleDeleteExpense(expense.id)}><Trash2 size={16} color="var(--danger-color)" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displayedExpenses.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>
                    {monthExpenses.length === 0 
                      ? `Aucune dépense de soins enregistrée pour le mois de ${selectedMonth}.` 
                      : "Aucune dépense de soins ne correspond aux filtres sélectionnés."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2 : Remboursements du mois liés à des soins antérieurs */}
      {displayedPastCareReimbursementsThisMonth.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-color)' }}>
            Remboursements perçus ou attendus en {selectedMonth} (liés à des soins antérieurs)
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
            Ces remboursements ont lieu au cours du mois de {selectedMonth} mais concernent des soins de santé réalisés lors de mois passés.
          </p>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date de versement</th>
                  <th>Organisme / Libellé</th>
                  <th>Dépense de soin liée</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Compte crédité</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedPastCareReimbursementsThisMonth.map(r => {
                  const linkedExp = expenses.find(e => e.id === r.linkedId);
                  const account = accounts.find(a => a.id === r.accountId);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 'bold' }}>{r.date}</td>
                      <td>{r.label}</td>
                      <td>
                        {linkedExp ? (
                          <div>
                            <strong>{linkedExp.label}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                              Soin du {linkedExp.date} ({Number(linkedExp.amount).toFixed(2)} €)
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-light)' }}>Soin antérieur non listé</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>
                        +{Number(r.amount).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
                      </td>
                      <td>
                        <StatusBadgeSelect
                          status={r.status}
                          options={HEALTH_REIMBURSEMENT_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateReimbursementStatus(r, newStatus)}
                        />
                      </td>
                      <td>{account?.name || 'Inconnu'}</td>
                      <td>{r.notes}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {r.status !== 'cleared' && (
                            <Button variant="icon" onClick={() => handleQuickClearReimbursement(r)} title="Marquer reçu"><CheckCircle2 size={16} color="var(--success-color)" /></Button>
                          )}
                          <Button variant="icon" onClick={() => handleOpenReimbursement(r.linkedId, r)}><Edit2 size={16} /></Button>
                          <Button variant="icon" onClick={() => handleDeleteReimbursement(r.id)}><Trash2 size={16} color="var(--danger-color)" /></Button>
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

      {/* Modal Dépense */}
      <Modal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title={editingExpenseId ? 'Modifier la dépense' : 'Ajouter une dépense médicale'}>
        <form onSubmit={handleSaveExpense}>
          <div className="form-group">
            <label className="form-label">Date de soin</label>
            <input type="date" className="form-control" required value={expenseForm.date || ''} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Libellé</label>
            <input type="text" className="form-control" required placeholder="Ex: Consultation médecin, Pharmacie..." value={expenseForm.label || ''} onChange={e => setExpenseForm({...expenseForm, label: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Montant (€)</label>
            <input type="number" step="0.01" className="form-control" required value={expenseForm.amount === undefined ? '' : expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: parseFloat(e.target.value)})} />
          </div>
          <div className="form-group">
            <label className="form-label">Catégorie</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select className="form-control" required value={expenseForm.categoryId || ''} onChange={e => setExpenseForm({...expenseForm, categoryId: e.target.value})}>
                <option value="">Sélectionner...</option>
                {categories?.filter(c => !c.isArchived || c.id === expenseForm.categoryId).map(c => <option key={c.id} value={c.id}>{c.name}{c.isArchived ? ' (Archivée)' : ''}</option>)}
              </select>
              <Button variant="outline" onClick={handleAddCategory} type="button" icon={<Plus size={16} />}></Button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Compte débité</label>
            <AccountSelect
              value={expenseForm.accountId || ''}
              onChange={id => setExpenseForm({ ...expenseForm, accountId: id })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Statut</label>
            <select className="form-control" required value={expenseForm.status || 'cleared'} onChange={e => setExpenseForm({...expenseForm, status: e.target.value as any})}>
              <option value="cleared">Débité</option>
              <option value="pending">En attente</option>
              <option value="planned">Prévu</option>
              <option value="disabled">Désactivé</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input type="text" className="form-control" value={expenseForm.notes || ''} onChange={e => setExpenseForm({...expenseForm, notes: e.target.value})} />
          </div>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsExpenseModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Remboursement */}
      <Modal isOpen={isReimbursementModalOpen} onClose={() => setIsReimbursementModalOpen(false)} title={editingReimbursementId ? 'Modifier le remboursement' : 'Ajouter un remboursement'}>
        <form onSubmit={handleSaveReimbursement}>
          <div className="form-group">
            <label className="form-label">Date (prévue ou réelle de versement)</label>
            <input type="date" className="form-control" required value={reimbursementForm.date || ''} onChange={e => setReimbursementForm({...reimbursementForm, date: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Organisme payeur (Libellé)</label>
            <input type="text" className="form-control" required placeholder="Ex: Sécurité Sociale, Mutuelle..." value={reimbursementForm.label || ''} onChange={e => setReimbursementForm({...reimbursementForm, label: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Montant remboursé (€)</label>
            <input type="number" step="0.01" className="form-control" required value={reimbursementForm.amount === undefined ? '' : reimbursementForm.amount} onChange={e => setReimbursementForm({...reimbursementForm, amount: parseFloat(e.target.value)})} />
          </div>
          <div className="form-group">
            <label className="form-label">Compte crédité</label>
            <AccountSelect
              value={reimbursementForm.accountId || ''}
              onChange={id => setReimbursementForm({ ...reimbursementForm, accountId: id })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Statut</label>
            <select className="form-control" required value={reimbursementForm.status || 'pending'} onChange={e => setReimbursementForm({...reimbursementForm, status: e.target.value as any})}>
              <option value="cleared">Reçu (Encaissé)</option>
              <option value="pending">En attente (Demandé)</option>
              <option value="planned">Prévu (À venir)</option>
              <option value="disabled">Désactivé</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input type="text" className="form-control" value={reimbursementForm.notes || ''} onChange={e => setReimbursementForm({...reimbursementForm, notes: e.target.value})} />
          </div>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsReimbursementModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
