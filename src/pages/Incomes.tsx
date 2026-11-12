import React, { useState, useMemo } from 'react';
import { generateId } from '../db/database';
import type { Transaction, IncomePayer } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect, IncomePayerSelect, AmountInput } from '../components/ui/Components';
import { Plus, Edit2, Trash2, Filter, Repeat, RotateCcw } from 'lucide-react';
import { roundCurrency } from '../engine/calculations';

const INCOME_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Encaissé' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

import { useServerDataOptional } from '../contexts/ServerDataContext';
import { getCurrentMonth, getCurrentDate } from '../utils/dateUtils';
import { IntegritySectionBadge } from '../components/IntegritySectionBadge';

export default function Incomes() {
  const serverData = useServerDataOptional();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState<number>(1);
  
  const incomes = (serverData?.transactions || []).filter(t => t.type === 'income');
  const allTransactions = serverData?.transactions || [];
  const loans = (serverData?.loans || []).filter(l => !l.isArchived);
  const categories = (serverData?.categories || []).filter(c => c.type === 'income');
  const accounts = serverData?.accounts || [];
  const incomePayers = serverData?.incomePayers || [];

  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const currentMonth = getCurrentMonth();
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Notification du Watchdog universel & génération des échéances uniquement si selectedMonth >= currentMonth (passé 100% lecture seule)
  React.useEffect(() => {
    if (selectedMonth) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pbp-active-month-changed', { detail: { month: selectedMonth } }));
      }
      if (serverData && selectedMonth >= currentMonth) {
        serverData.generateMonthlyOccurrences(selectedMonth).catch(console.error);
      }
    }
  }, [selectedMonth, currentMonth, serverData]);

  const monthIncomes = useMemo(() => {
    if (!incomes) return [];
    const [selYear, selMonth] = selectedMonth ? selectedMonth.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];

    return incomes.filter(inc => {
      // Rétrocompatibilité : ancienne récurrence non migrée
      if (inc.recurrenceDay && !inc.templateId) return true;
      return selectedMonth ? inc.date.startsWith(selectedMonth) : true;
    }).map(inc => {
      if (inc.recurrenceDay && !inc.templateId) {
        const daysInMonth = new Date(selYear, selMonth, 0).getDate();
        const safeDay = Math.min(inc.recurrenceDay, daysInMonth);
        const computedDate = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        return { ...inc, _computedDate: computedDate };
      }
      return { ...inc, _computedDate: inc.date };
    }).sort((a, b) => a._computedDate.localeCompare(b._computedDate));
  }, [incomes, selectedMonth]);

  const displayedIncomes = useMemo(() => {
    return monthIncomes.filter(inc => {
      const matchCategory = selectedCategory ? inc.categoryId === selectedCategory : true;
      const matchStatus = selectedStatus ? inc.status === selectedStatus : true;
      return matchCategory && matchStatus;
    });
  }, [monthIncomes, selectedCategory, selectedStatus]);

  const { totalPlanned, totalCleared, totalPending } = useMemo(() => {
    let totalPlanned = 0;
    let totalCleared = 0;
    let totalPending = 0;

    monthIncomes.forEach(inc => {
      if (inc.status !== 'disabled') {
        const amt = Number(inc.amount) || 0;
        totalPlanned += amt;
        if (inc.status === 'cleared') totalCleared += amt;
        else if (inc.status === 'pending' || inc.status === 'planned') totalPending += amt;
      }
    });

    return { totalPlanned, totalCleared, totalPending };
  }, [monthIncomes]);

  // Total des charges obligatoires du Dashboard pour selectedMonth (fixes, variables, crédit, épargne)
  const totalObligatoires = useMemo(() => {
    if (!allTransactions || !loans) return 0;

    const accountMap = new Map((accounts || []).map(a => [a.id, a]));
    const activeTx = allTransactions.filter(t => t.status !== 'disabled');
    const selectedMonthTx = activeTx.filter(t => {
      if (t.recurrenceDay && !t.templateId) return selectedMonth >= t.date.substring(0, 7);
      return t.date.startsWith(selectedMonth);
    });

    let fixed = 0;
    let variable = 0;
    let transfer = 0;

    selectedMonthTx.forEach(t => {
      const amt = Math.abs(Number(t.amount) || 0);
      if (t.type === 'fixed_expense') fixed += amt;
      else if (t.type === 'variable_expense') variable += amt;
      else if (t.type === 'transfer') {
        const srcAcc = t.accountId ? accountMap.get(t.accountId) : undefined;
        const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : undefined;
        const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
        const isDestSavings = destAcc ? destAcc.type === 'savings' : true;
        if (isDestSavings && !isSrcSavings) {
          transfer += amt;
        }
      }
    });

    let totalLoanPlanned = 0;
    const selectedMonthAllPayments = allTransactions.filter(t => t.type === 'loan_payment' && t.date.startsWith(selectedMonth));
    const selectedMonthPayments = selectedMonthAllPayments.filter(t => t.status !== 'disabled');

    loans.forEach(loan => {
      if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;
      const loanAllMonthPayments = selectedMonthAllPayments.filter(p => p.linkedId === loan.id);
      const disabledPayments = loanAllMonthPayments.filter(p => p.status === 'disabled');
      const activePayments = loanAllMonthPayments.filter(p => p.status !== 'disabled');
      if (disabledPayments.length > 0 && activePayments.length === 0) return;

      const loanStartMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
      const loanEndMonth = loan.endDate ? loan.endDate.substring(0, 7) : null;
      const loanMonthPayments = selectedMonthPayments.filter(p => p.linkedId === loan.id);
      const hasPaymentThisMonth = loanMonthPayments.length > 0;
      const isActive = (!loanStartMonth || selectedMonth >= loanStartMonth) && (!loanEndMonth || selectedMonth <= loanEndMonth);

      if (!isActive && !hasPaymentThisMonth) return;

      const isPaused = Boolean(loan.isPaused);
      const clearedForLoan = loanMonthPayments.filter(p => p.status === 'cleared').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const plannedForLoan = (isActive && !isPaused) ? (Number(loan.monthlyPayment) || 0) : clearedForLoan;

      totalLoanPlanned += plannedForLoan;
    });

    // Prise en compte des paiements effectifs de crédits archivés ce mois-ci
    const activeLoanIds = new Set(loans.map(l => l.id));
    selectedMonthPayments.forEach(p => {
      if (p.linkedId && !activeLoanIds.has(p.linkedId)) {
        if (p.status === 'cleared' || p.status === 'pending') {
          totalLoanPlanned += Number(p.amount) || 0;
        }
      }
    });

    return roundCurrency(fixed + variable + totalLoanPlanned + transfer);
  }, [allTransactions, loans, accounts, selectedMonth]);

  const resteAVivreBrutTheorique = totalPlanned - totalObligatoires;

  if (incomes === undefined || categories === undefined || accounts === undefined || allTransactions === undefined || loans === undefined) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement des données...</div>;
  }

  const handleOpen = (income?: Transaction) => {
    if (income) {
      setEditingId(income.id);
      setFormData(income);
      const isRec = !!(income.templateId || income.recurrenceDay);
      setIsRecurring(isRec);
      setRecurrenceDay(income.recurrenceDay || (income.date ? parseInt(income.date.split('-')[2], 10) : 1));
    } else {
      setEditingId(null);
      setIsRecurring(false);
      setRecurrenceDay(new Date().getDate());
      setFormData({
        date: getCurrentDate(),
        amount: 0,
        status: 'cleared',
        label: '',
        notes: '',
        categoryId: categories?.[0]?.id || '',
        accountId: accounts?.[0]?.id || '',
        payerId: '',
        type: 'income'
      });
    }
    setIsModalOpen(true);
  };

  const handleStopRecurrence = async () => {
    if (!editingId || !formData.templateId) return;

    const confirmed = window.confirm(
      "Arrêter définitivement la récurrence de ce revenu ?\n\n" +
      "• Ce revenu sera conservé comme revenu ponctuel pour ce mois.\n" +
      "• Toutes les occurrences passées ou déjà encaissées restent conservées.\n" +
      "• Les occurrences futures prévues seront supprimées et plus aucune occurrence ne sera générée."
    );
    if (!confirmed) return;

    try {
      if (serverData) {
        // En mode serveur : détache la transaction courante en revenu ponctuel et supprime le modèle récurrent
        const finalAmount = Number(formData.amount) || 0;
        await serverData.deleteRecurrenceTemplate(formData.templateId, `${selectedMonth}-01`);
        await serverData.saveTransaction({
          ...formData,
          id: editingId,
          templateId: undefined,
          recurrenceDay: undefined,
          amount: finalAmount,
          date: formData.date || new Date().toISOString().split('T')[0],
          type: 'income',
          isCustomized: false
        });
      }
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err: any) {
      console.error("Erreur lors de l'arrêt de la récurrence:", err);
      alert(err.message || "Erreur lors de l'arrêt de la récurrence.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId || !formData.categoryId || formData.amount === undefined || isNaN(formData.amount)) {
      alert('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    const finalAmount = Number(formData.amount);
    const [selYear, selMonth] = selectedMonth ? selectedMonth.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];

    if (editingId) {
      if (isRecurring && !formData.templateId) {
        // 1. Conversion d'un revenu ponctuel existant en revenu récurrent
        try {
          const safeDay = Math.min(Math.max(1, recurrenceDay || 1), 31);
          if (serverData) {
            const tmpl = await serverData.saveRecurrenceTemplate({
              type: 'income',
              amount: finalAmount,
              recurrenceDay: safeDay,
              accountId: formData.accountId,
              categoryId: formData.categoryId,
              label: formData.label || '',
              notes: formData.notes || '',
              startDate: selectedMonth || (formData.date ? formData.date.slice(0, 7) : getCurrentMonth()),
              isActive: true,
              payerId: formData.payerId
            });
            await serverData.saveTransaction({
              ...formData,
              id: editingId,
              templateId: tmpl.id,
              isCustomized: true,
              amount: finalAmount,
              type: 'income',
              payerId: formData.payerId
            });
          }
        } catch (err: any) {
          console.error('Erreur lors de la conversion en revenu récurrent:', err);
          alert(err.message || 'Erreur lors de la conversion en revenu récurrent.');
          return;
        }
      } else if (!isRecurring && formData.templateId) {
        // 2. Passage de récurrent à ponctuel : Arrêt sécurisé de la récurrence
        const confirmed = window.confirm(
          "Ce revenu fait actuellement partie d'une récurrence mensuelle.\n\n" +
          "En choisissant « Ponctuel », vous allez ARRÊTER DÉFINITIVEMENT la récurrence pour les mois futurs.\n\n" +
          "• La transaction de ce mois sera conservée comme revenu ponctuel (avec son montant et son statut).\n" +
          "• Les occurrences passées ou déjà encaissées restent intactes.\n" +
          "• Les occurrences futures prévues non encaissées seront supprimées.\n\n" +
          "(Pour ajuster uniquement ce mois-ci sans arrêter les mois futurs, cliquez sur Annuler et conservez « Récurrent »).\n\n" +
          "Confirmez-vous l'arrêt de la récurrence ?"
        );
        if (!confirmed) return;

        try {
          if (serverData) {
            await serverData.deleteRecurrenceTemplate(formData.templateId, `${selectedMonth}-01`);
            await serverData.saveTransaction({
              ...formData,
              id: editingId,
              templateId: undefined,
              amount: finalAmount,
              date: formData.date || new Date().toISOString().split('T')[0],
              type: 'income'
            });
          }
        } catch (err: any) {
          console.error("Erreur lors de l'arrêt de la récurrence:", err);
          alert(err.message || "Erreur lors de l'arrêt de la récurrence.");
          return;
        }
      } else {
        // 3. Modification classique (ponctuel restant ponctuel, ou récurrent avec choix d'application aux mois futurs)
        let realDate = formData.date || new Date().toISOString().split('T')[0];
        const daysInMonth = new Date(selYear, selMonth, 0).getDate();
        const safeDay = Math.min(Math.max(1, recurrenceDay || 1), daysInMonth);
        if (isRecurring && selectedMonth) {
          realDate = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        }

        const existingTx = serverData?.transactions.find(t => t.id === editingId);
        const templateId = formData.templateId || existingTx?.templateId;

        if (isRecurring && templateId) {
          const updateFutureMonths = window.confirm(
            "Souhaitez-vous appliquer ces modifications (montant, libellé, organisme verseur, etc.) également pour TOUS LES MOIS FUTURS ?\n\n" +
            "• Cliquez sur OK pour mettre à jour ce mois et tous les mois suivants.\n" +
            "• Cliquez sur Annuler pour modifier UNIQUEMENT ce mois-ci."
          );

          if (serverData) {
            if (updateFutureMonths) {
              const tpl = serverData.recurrenceTemplates.find(t => t.id === templateId);
              if (tpl) {
                await serverData.saveRecurrenceTemplate({
                  ...tpl,
                  amount: finalAmount,
                  label: formData.label || tpl.label,
                  accountId: formData.accountId || tpl.accountId,
                  categoryId: formData.categoryId || tpl.categoryId,
                  notes: formData.notes !== undefined ? formData.notes : tpl.notes,
                  recurrenceDay: safeDay,
                  payerId: formData.payerId !== undefined ? (formData.payerId || undefined) : tpl.payerId,
                  updateFutureOccurrencesFromDate: realDate
                });
              }
            }

            await serverData.saveTransaction({
              ...formData,
              id: editingId,
              date: realDate,
              amount: finalAmount,
              type: 'income',
              recurrenceDay: safeDay,
              payerId: formData.payerId !== undefined ? (formData.payerId || undefined) : undefined,
              isCustomized: !updateFutureMonths
            });

            if (updateFutureMonths) {
              await serverData.refreshAll();
            }
          }
        } else {
          // Ponctuel ou sans modèle récurrent
          const payload: Transaction = {
            ...formData,
            date: realDate,
            amount: finalAmount,
            id: editingId,
            type: 'income',
            recurrenceDay: isRecurring ? safeDay : undefined,
            isCustomized: false
          } as Transaction;

          if (serverData) {
            await serverData.saveTransaction(payload);
          }
        }
      }
    } else {
      // Création d'un nouveau revenu
      if (isRecurring) {
        const daysInMonth = new Date(selYear, selMonth, 0).getDate();
        const safeDay = Math.min(Math.max(1, recurrenceDay || 1), daysInMonth);
        const occMonth = selectedMonth || getCurrentMonth();
        const realDate = `${selYear}-${String(selMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        const targetStatus = formData.status || 'planned';
        if (serverData) {
          const tpl = await serverData.saveRecurrenceTemplate({
            type: 'income',
            amount: finalAmount,
            recurrenceDay: safeDay,
            accountId: formData.accountId,
            categoryId: formData.categoryId,
            label: formData.label || '',
            notes: formData.notes || '',
            startDate: occMonth,
            isActive: true,
            payerId: formData.payerId
          });
          const occId = `${tpl.id}_${occMonth}`;
          await serverData.saveTransaction({
            id: occId,
            type: 'income',
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
            notes: formData.notes || '',
            payerId: formData.payerId
          });
          await serverData.generateMonthlyOccurrences(occMonth);
          await serverData.refreshAll();
        }
      } else {
        const newTx: Transaction = {
          ...formData,
          id: generateId(),
          amount: finalAmount,
          date: formData.date || getCurrentDate(),
          type: 'income'
        } as Transaction;

        if (serverData) {
          await serverData.saveTransaction(newTx);
        }
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (income: Transaction) => {
    if (income.templateId) {
      if (income.status === 'disabled') {
        alert('Ce revenu récurrent est déjà désactivé pour ce mois.\n\nPour le réactiver, cliquez sur Modifier. Pour arrêter la récurrence pour tous les mois, désactivez le modèle.');
        return;
      }
      const choice = window.confirm(
        'Ce revenu fait partie d\'une récurrence mensuelle.\n\n' +
        'Cliquez sur OK pour DÉSACTIVER ce revenu pour ce mois uniquement.\n' +
        'Il sera exclu des calculs de ce mois sans être recréé automatiquement.\n' +
        '(Pour modifier ou arrêter définitivement la récurrence, utilisez les paramètres).'
      );
      if (choice) {
        if (serverData) {
          await serverData.updateTransactionStatus(income.id, 'disabled');
        }
      }
    } else {
      if (window.confirm('Supprimer ce revenu ? Cela affectera vos calculs financiers.')) {
        if (serverData) {
          await serverData.deleteTransaction(income.id);
        }
      }
    }
  };

  const handleAddCategory = async () => {
    const name = window.prompt('Nom de la nouvelle catégorie :');
    if (name) {
      const newCat = { id: generateId(), name, type: 'income' as const, isArchived: false };
      if (serverData) {
        const saved = await serverData.saveCategory(newCat);
        setFormData({...formData, categoryId: saved.id});
      }
    }
  };

  const handleUpdateStatus = async (income: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateTransactionStatus(income.id, newStatus as any);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Revenus</h1>
          <IntegritySectionBadge type="income" month={selectedMonth} />
        </div>
        <Button onClick={() => handleOpen()} icon={<Plus size={16} />}>Ajouter un revenu</Button>
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
              {INCOME_STATUS_OPTIONS.map(opt => (
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
        <Card title="Total prévu pour le mois" value={`${totalPlanned.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Montant encaissé" value={`${totalCleared.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Restant à percevoir" value={`${totalPending.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
        <Card title="Reste à vivre brut théorique" value={`${resteAVivreBrutTheorique.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Catégorie</th>
              <th>Type</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedIncomes.map(income => {
              const cat = categories?.find(c => c.id === income.categoryId);
              const isRec = !!(income.templateId || income.recurrenceDay);
              return (
                <tr key={income.id} style={{ opacity: income.status === 'disabled' ? 0.5 : 1 }}>
                  <td>{income._computedDate || income.date}</td>
                  <td style={{ fontWeight: 500 }}>
                    <div>{income.label || '-'}</div>
                    {(() => {
                      const payer = incomePayers?.find(p => p.id === income.payerId);
                      const acc = accounts?.find(a => a.id === income.accountId);
                      if (!payer && !acc) return null;
                      return (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                          {payer && <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{payer.name}</span>}
                          {payer && acc && <span> • </span>}
                          {acc && <span>{acc.name}</span>}
                        </div>
                      );
                    })()}
                  </td>
                  <td>{cat?.name || 'Inconnue'}</td>
                  <td>
                    {isRec ? (
                      <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Repeat size={12} /> Récurrent
                      </span>
                    ) : (
                      <span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#475569' }}>
                        Ponctuel
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>
                    +{(Number(income.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
                  </td>
                  <td>
                    <StatusBadgeSelect
                      status={income.status}
                      options={INCOME_STATUS_OPTIONS}
                      onChange={newStatus => handleUpdateStatus(income, newStatus)}
                    />
                  </td>
                  <td style={{ fontSize: '0.875rem', color: '#64748b' }}>{income.notes || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="icon" onClick={() => handleOpen(income)}><Edit2 size={16} /></Button>
                      <Button variant="icon" onClick={() => handleDelete(income)}><Trash2 size={16} color="var(--danger-color)" /></Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {displayedIncomes.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
                  {monthIncomes.length === 0 
                    ? `Aucun revenu enregistré pour le mois de ${selectedMonth}.` 
                    : "Aucun revenu ne correspond aux filtres sélectionnés."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Modifier le revenu' : 'Ajouter un revenu'}>
        <form onSubmit={handleSave}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Nature du revenu</label>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="incomeType" 
                  checked={!isRecurring} 
                  onChange={() => setIsRecurring(false)} 
                />
                <span>Ponctuel (date unique)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="incomeType" 
                  checked={isRecurring} 
                  onChange={() => setIsRecurring(true)} 
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Repeat size={14} /> Récurrent (tous les mois)
                </span>
              </label>
            </div>
            {!isRecurring && formData.templateId && (
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: '#eff6ff', 
                border: '1px solid #bfdbfe', 
                borderRadius: '0.375rem', 
                fontSize: '0.85rem', 
                color: '#1e40af',
                marginTop: '0.75rem',
                lineHeight: 1.4
              }}>
                <strong>Information :</strong> En choisissant « Ponctuel », vous allez <strong>arrêter la récurrence</strong> pour les mois futurs. 
                Ce revenu sera conservé comme revenu ponctuel pour ce mois ({selectedMonth}).
                <br />
                <span style={{ fontStyle: 'italic', display: 'inline-block', marginTop: '0.25rem' }}>
                  (Pour modifier uniquement ce mois sans arrêter la récurrence des mois suivants, conservez « Récurrent »).
                </span>
              </div>
            )}
          </div>

          {isRecurring ? (
            <div className="form-group">
              <label className="form-label">Jour de versement dans le mois (1-31)</label>
              <input 
                type="number" 
                min="1" 
                max="31" 
                className="form-control" 
                required 
                value={recurrenceDay} 
                onChange={e => setRecurrenceDay(parseInt(e.target.value, 10))} 
              />
              <small style={{ color: 'var(--text-light)', display: 'block', marginTop: '0.25rem' }}>
                Ce revenu sera généré automatiquement chaque mois à ce jour (ex: 28 pour le salaire).
              </small>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Date</label>
              <input 
                type="date" 
                className="form-control" 
                required 
                value={formData.date || ''} 
                onChange={e => setFormData({...formData, date: e.target.value})} 
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Libellé</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="ex: Salaire principal, Prime, Allocation..." 
              value={formData.label || ''} 
              onChange={e => setFormData({...formData, label: e.target.value})} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Montant (€)</label>
            <AmountInput 
              className="form-control" 
              required 
              value={formData.amount === undefined ? '' : formData.amount} 
              onValueChange={val => setFormData({...formData, amount: val})} 
            />
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
            <label className="form-label">Compte bancaire de dépôt *</label>
            <AccountSelect
              value={formData.accountId || ''}
              onChange={id => setFormData({ ...formData, accountId: id })}
              required
              placeholder="Sélectionner le compte de dépôt..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Organisme verseur (facultatif)</label>
            <IncomePayerSelect
              value={formData.payerId || ''}
              onChange={id => setFormData({ ...formData, payerId: id })}
              placeholder="Sélectionner ou ajouter un organisme verseur..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Statut</label>
            <select className="form-control" required value={formData.status || 'cleared'} onChange={e => setFormData({...formData, status: e.target.value as any})}>
              <option value="cleared">Encaissé</option>
              <option value="pending">En attente</option>
              <option value="planned">Prévu</option>
              <option value="disabled">Désactivé</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input type="text" className="form-control" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {editingId && formData.templateId ? (
              <Button 
                type="button" 
                variant="outline" 
                style={{ color: 'var(--danger-color)', borderColor: '#fca5a5' }}
                onClick={handleStopRecurrence}
              >
                Arrêter la récurrence
              </Button>
            ) : <div />}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary">Enregistrer</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
