import React, { useState, useMemo, useEffect } from 'react';
import { generateId } from '../db/database';
import type { Loan, Transaction, LoanPaymentHistory } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect } from '../components/ui/Components';
import { 
  Plus, Edit2, Trash2, Filter, Pause, Play, 
  Archive, ArchiveRestore, History, CreditCard, Info, AlertCircle, CheckCircle 
} from 'lucide-react';

import { useServerDataOptional } from '../contexts/ServerDataContext';
import { apiClient } from '../services/apiClient';
import { estimateLoanPayoffClient } from '../engine/calculations';

const LOAN_PAYMENT_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

export default function Loans() {
  const serverData = useServerDataOptional();

  const accounts = serverData?.accounts || [];
  const allLoans = serverData?.loans || [];
  const activeLoans = allLoans.filter(l => !l.isArchived);
  const archivedLoans = allLoans.filter(l => Boolean(l.isArchived));
  const loans = activeLoans; // Rétrocompatibilité avec les calculs de synthèse du mois
  const loanPayments = (serverData?.transactions || []).filter(t => t.type === 'loan_payment');
  const incomeTransactions = (serverData?.transactions || []).filter(t => t.type === 'income');

  // Navigation par onglets : Crédits actifs vs Crédits archivés
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Modal d'édition/création d'un crédit
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [loanAccountId, setLoanAccountId] = useState<string>('');

  // Modal de saisie de mensualité
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [editingPayment, setEditingPayment] = useState<Transaction | null>(null);

  // Modal d'archivage sécurisé
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [loanToArchive, setLoanToArchive] = useState<Loan | null>(null);
  const [disableFutureOnArchive, setDisableFutureOnArchive] = useState(true);
  const [isArchivingLoading, setIsArchivingLoading] = useState(false);

  // Modal de désarchivage sécurisé
  const [isUnarchiveModalOpen, setIsUnarchiveModalOpen] = useState(false);
  const [loanToUnarchive, setLoanToUnarchive] = useState<Loan | null>(null);
  const [reactivateFutureOnUnarchive, setReactivateFutureOnUnarchive] = useState(false);
  const [isUnarchivingLoading, setIsUnarchivingLoading] = useState(false);

  // Modal d'historique et modification de mensualité
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyLoan, setHistoryLoan] = useState<Loan | null>(null);
  const [paymentHistoryList, setPaymentHistoryList] = useState<LoanPaymentHistory[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState<string>('');
  const [newEffectiveMonth, setNewEffectiveMonth] = useState<string>('');
  const [newPaymentNotes, setNewPaymentNotes] = useState<string>('');
  const [isSavingTier, setIsSavingTier] = useState(false);
  const [appliedEndDateSuccess, setAppliedEndDateSuccess] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const formatMonth = (ym: string) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  const handleSaveLoan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const parseNum = (val: FormDataEntryValue | null) => {
      if (!val) return undefined;
      const str = val.toString().replace(',', '.').replace(/\s/g, '');
      const num = Number(str);
      return isNaN(num) ? undefined : num;
    };

    const parseNumReq = (val: FormDataEntryValue | null) => {
      return parseNum(val) || 0;
    };

    const loan: Loan = {
      ...(editingLoan || {}),
      id: editingLoan ? editingLoan.id : generateId(),
      name: formData.get('name') as string,
      lender: formData.get('lender') as string,
      initialAmount: parseNumReq(formData.get('initialAmount')),
      remainingCapital: parseNumReq(formData.get('remainingCapital')),
      monthlyPayment: parseNumReq(formData.get('monthlyPayment')),
      interestRate: parseNum(formData.get('interestRate')),
      insurancePart: parseNum(formData.get('insurancePart')),
      startDate: formData.get('startDate') as string,
      durationMonths: parseNumReq(formData.get('durationMonths')),
      endDate: (formData.get('endDate') as string) || undefined,
      debitDay: parseNum(formData.get('debitDay')),
      prepaidInstallments: parseNum(formData.get('prepaidInstallments')) ?? editingLoan?.prepaidInstallments ?? 0,
      monthsAdjustment: parseNum(formData.get('monthsAdjustment')) ?? editingLoan?.monthsAdjustment ?? 0,
      accountId: loanAccountId || (formData.get('accountId') as string) || editingLoan?.accountId || '',
      notes: (formData.get('notes') as string) ?? editingLoan?.notes ?? '',
      isArchived: editingLoan ? Boolean(editingLoan.isArchived) : false,
      isPaused: editingLoan ? Boolean(editingLoan.isPaused) : false,
      loanType: (formData.get('loanType') as 'consumer' | 'mortgage') || editingLoan?.loanType || 'consumer',
    };

    if (serverData) {
      await serverData.saveLoan(loan);
    }

    setIsLoanModalOpen(false);
    setEditingLoan(null);
  };

  const handleOpenArchiveModal = (loan: Loan) => {
    setLoanToArchive(loan);
    setDisableFutureOnArchive(true);
    setIsArchiveModalOpen(true);
  };

  const handleArchiveConfirm = async () => {
    if (!loanToArchive || !serverData) return;
    setIsArchivingLoading(true);
    try {
      await serverData.archiveLoan(loanToArchive.id, true, disableFutureOnArchive);
      setIsArchiveModalOpen(false);
      setLoanToArchive(null);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'archivage.');
    } finally {
      setIsArchivingLoading(false);
    }
  };

  const handleOpenUnarchiveModal = (loan: Loan) => {
    setLoanToUnarchive(loan);
    setReactivateFutureOnUnarchive(false);
    setIsUnarchiveModalOpen(true);
  };

  const handleUnarchiveConfirm = async () => {
    if (!loanToUnarchive || !serverData) return;
    setIsUnarchivingLoading(true);
    try {
      await serverData.archiveLoan(loanToUnarchive.id, false);
      if (reactivateFutureOnUnarchive) {
        await serverData.reactivateLoanFuturePlanned(loanToUnarchive.id);
      }
      setIsUnarchiveModalOpen(false);
      setLoanToUnarchive(null);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la réactivation.');
    } finally {
      setIsUnarchivingLoading(false);
    }
  };

  const handleOpenHistory = (loan: Loan) => {
    setHistoryLoan(loan);
    setIsHistoryModalOpen(true);
    setIsHistoryLoading(true);
    setHistoryError(null);
    setNewPaymentAmount(loan.monthlyPayment !== undefined ? String(loan.monthlyPayment) : '');
    setAppliedEndDateSuccess(false);

    // Par défaut, proposer le mois prochain comme mois d'effet
    const [y, m] = currentMonth.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    setNewEffectiveMonth(`${nextY}-${String(nextM).padStart(2, '0')}`);
    setNewPaymentNotes('');

    apiClient.loans.paymentHistory.get(loan.id)
      .then(tiers => setPaymentHistoryList(tiers || []))
      .catch(err => setHistoryError(err.message || 'Erreur lors du chargement de l\'historique.'))
      .finally(() => setIsHistoryLoading(false));
  };

  const handleTogglePause = async (loan: Loan) => {
    if (serverData) {
      await serverData.saveLoan({ ...loan, isPaused: !loan.isPaused });
    }
  };

  const handleSavePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const parseNum = (val: FormDataEntryValue | null) => {
      if (!val) return undefined;
      const str = val.toString().replace(',', '.').replace(/\s/g, '');
      const num = Number(str);
      return isNaN(num) ? undefined : num;
    };
    
    const amount = parseNum(formData.get('amount')) || 0;
    const status = formData.get('status') as 'planned' | 'pending' | 'cleared' | 'disabled';
    const date = formData.get('date') as string;
    const loan = allLoans.find(l => l.id === selectedLoanId);

    if (!loan) return;

    const amortizedCapital = parseNum(formData.get('amortizedCapital'));

    if (serverData) {
      const paymentPayload: Partial<Transaction> = {
        id: editingPayment?.id || generateId(),
        date,
        amount,
        status,
        accountId: loan.accountId,
        linkedId: loan.id,
        notes: editingPayment?.notes || `Mensualité : ${loan.name}`,
        amortizedCapital,
        type: 'loan_payment'
      };
      await serverData.saveTransaction(paymentPayload);
    }

    setIsPaymentModalOpen(false);
    setEditingPayment(null);
  };

  const handleMarkAsCleared = async (payment: Transaction) => {
    if (serverData) {
      await serverData.updateLoanPaymentStatus(payment.id, 'cleared');
    }
  };

  const handleUpdatePaymentStatus = async (payment: Transaction, newStatus: string) => {
    if (serverData) {
      await serverData.updateLoanPaymentStatus(payment.id, newStatus as any);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (window.confirm('Voulez-vous vraiment supprimer cette mensualité ?')) {
      if (serverData) {
        await serverData.deleteTransaction(id);
      }
    }
  };

  const parsedNewPayment = parseFloat(newPaymentAmount.replace(',', '.'));
  const payoffSim = useMemo(() => {
    if (!historyLoan || isNaN(parsedNewPayment) || parsedNewPayment <= 0) return null;
    const fromMonth = newEffectiveMonth || currentMonth;
    return estimateLoanPayoffClient({
      remainingCapital: Number(historyLoan.remainingCapital) || 0,
      monthlyPayment: parsedNewPayment,
      interestRate: historyLoan.interestRate !== undefined ? Number(historyLoan.interestRate) : 0,
      insurancePart: historyLoan.insurancePart !== undefined ? Number(historyLoan.insurancePart) : 0,
      startMonth: fromMonth
    });
  }, [historyLoan, parsedNewPayment, newEffectiveMonth, currentMonth]);

  const handleSaveNewTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyLoan) return;
    if (isNaN(parsedNewPayment) || parsedNewPayment <= 0) {
      alert('Veuillez saisir un montant de mensualité valide supérieur à 0.');
      return;
    }
    if (!newEffectiveMonth || !/^\d{4}-\d{2}$/.test(newEffectiveMonth)) {
      alert('Veuillez sélectionner un mois d\'effet valide (ex: 2026-11).');
      return;
    }

    setIsSavingTier(true);
    try {
      await apiClient.loans.paymentHistory.add(historyLoan.id, {
        effectiveMonth: newEffectiveMonth,
        monthlyPayment: parsedNewPayment,
        notes: newPaymentNotes.trim() || undefined
      });
      const fresh = await apiClient.loans.paymentHistory.get(historyLoan.id);
      setPaymentHistoryList(fresh || []);
      if (newEffectiveMonth <= currentMonth && serverData) {
        const freshLoans = await apiClient.loans.getAll();
        const updated = freshLoans.find(l => l.id === historyLoan.id);
        if (updated) setHistoryLoan(updated);
      }
      setNewPaymentNotes('');
      alert('Nouvelle mensualité enregistrée avec succès.');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'enregistrement de la mensualité.');
    } finally {
      setIsSavingTier(false);
    }
  };

  const handleDeleteTier = async (tier: LoanPaymentHistory) => {
    const isFuture = tier.effectiveMonth > currentMonth;
    if (isFuture) {
      if (!window.confirm(`Confirmez-vous la suppression du palier futur pour ${tier.effectiveMonth} (${tier.monthlyPayment} €) ?`)) {
        return;
      }
      try {
        await apiClient.loans.paymentHistory.delete(tier.id, false);
        if (historyLoan) {
          const fresh = await apiClient.loans.paymentHistory.get(historyLoan.id);
          setPaymentHistoryList(fresh || []);
        }
      } catch (err: any) {
        alert(err.message || 'Erreur lors de la suppression.');
      }
    } else {
      const msg = `Attention : Ce palier (${tier.effectiveMonth} - ${tier.monthlyPayment} €) est déjà actif ou passé.\n\n` +
        `Sa suppression ne modifiera pas vos transactions passées, mais réaffectera la mensualité théorique du crédit.\n\n` +
        `Confirmez-vous cette correction ?`;
      if (!window.confirm(msg)) {
        return;
      }
      try {
        await apiClient.loans.paymentHistory.delete(tier.id, true);
        if (historyLoan) {
          const fresh = await apiClient.loans.paymentHistory.get(historyLoan.id);
          setPaymentHistoryList(fresh || []);
          if (serverData) {
            const freshLoans = await apiClient.loans.getAll();
            const updated = freshLoans.find(l => l.id === historyLoan.id);
            if (updated) setHistoryLoan(updated);
          }
        }
      } catch (err: any) {
        alert(err.message || 'Erreur lors de la suppression.');
      }
    }
  };

  const handleApplyEstimatedEndDate = async () => {
    if (!historyLoan || !payoffSim?.estimatedEndMonth || !serverData) return;
    const debitDay = historyLoan.debitDay || 1;
    const newEndDate = `${payoffSim.estimatedEndMonth}-${String(debitDay).padStart(2, '0')}`;
    try {
      await serverData.saveLoan({ id: historyLoan.id, endDate: newEndDate });
      setHistoryLoan(prev => prev ? { ...prev, endDate: newEndDate } : null);
      setAppliedEndDateSuccess(true);
      setTimeout(() => setAppliedEndDateSuccess(false), 4000);
    } catch (err: any) {
      alert(err.message || 'Impossible d\'appliquer la date de fin.');
    }
  };

  if (!allLoans || !accounts || !loanPayments || !incomeTransactions) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;
  }

  const monthIncomes = incomeTransactions.filter(inc => {
    if (inc.recurrenceDay && !inc.templateId) return true;
    return selectedMonth ? inc.date.startsWith(selectedMonth) : true;
  });

  let totalIncomesPlanned = 0;
  monthIncomes.forEach(inc => {
    if (inc.status !== 'disabled') {
      totalIncomesPlanned += Number(inc.amount) || 0;
    }
  });

  const monthPayments = loanPayments.filter(p => p.date.startsWith(selectedMonth));
  let totalPlanned = 0;
  let totalPaid = 0;
  let totalRemainingMonth = 0;

  activeLoans.forEach(loan => {
    if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;

    const loanStartMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
    const loanEndMonth = loan.endDate ? loan.endDate.substring(0, 7) : null;
    
    const loanMonthPayments = monthPayments.filter(p => p.linkedId === loan.id);
    const disabledPayments = loanMonthPayments.filter(p => p.status === 'disabled');
    const activePayments = loanMonthPayments.filter(p => p.status !== 'disabled');
    
    if (disabledPayments.length > 0 && activePayments.length === 0) return;

    const hasPaymentThisMonth = activePayments.length > 0;
    const isStarted = !loanStartMonth || selectedMonth >= loanStartMonth;
    const isWithinDates = isStarted && (!loanEndMonth || selectedMonth <= loanEndMonth);
    const hasRemainingCapital = (Number(loan.remainingCapital) || 0) > 0;
    
    const isActive = isWithinDates || (isStarted && hasRemainingCapital) || hasPaymentThisMonth;
    if (!isActive) return;

    const paidForLoan = activePayments.filter(p => p.status === 'cleared').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const isPaused = Boolean(loan.isPaused);
    const plannedForLoan = isPaused ? paidForLoan : (Number(loan.monthlyPayment) || 0);
    
    totalPlanned += plannedForLoan;
    totalPaid += paidForLoan;
    totalRemainingMonth += Math.max(0, plannedForLoan - paidForLoan);
  });

  let debtRatioText = '— %';
  let debtRatioValue: number | null = null;

  if (totalIncomesPlanned > 0 && Number.isFinite(totalIncomesPlanned)) {
    debtRatioValue = (totalPlanned / totalIncomesPlanned) * 100;
    debtRatioText = `${debtRatioValue.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  } else {
    debtRatioText = '— %';
    debtRatioValue = null;
  }

  let levelKey = '';
  let levelLabel = '';
  let levelColor = 'var(--text-main)';
  let levelBg = '#f1f5f9';

  if (debtRatioValue === null) {
    levelLabel = 'Non calculable';
    levelColor = 'var(--text-muted)';
    levelBg = '#f1f5f9';
  } else if (debtRatioValue < 20) {
    levelKey = 'faible';
    levelLabel = 'Faible';
    levelColor = '#16a34a';
    levelBg = '#dcfce7';
  } else if (debtRatioValue < 30) {
    levelKey = 'modere';
    levelLabel = 'Modéré';
    levelColor = '#65a30d';
    levelBg = '#ecfccb';
  } else if (debtRatioValue < 35) {
    levelKey = 'surveiller';
    levelLabel = 'À surveiller';
    levelColor = '#ca8a04';
    levelBg = '#fef9c3';
  } else if (debtRatioValue < 45) {
    levelKey = 'eleve';
    levelLabel = 'Élevé';
    levelColor = '#ea580c';
    levelBg = '#ffedd5';
  } else {
    levelKey = 'tres_eleve';
    levelLabel = 'Très élevé';
    levelColor = '#dc2626';
    levelBg = '#fee2e2';
  }

  const consumerLoans = activeLoans.filter(l => l.loanType !== 'mortgage');
  const mortgageLoans = activeLoans.filter(l => l.loanType === 'mortgage');

  const remainingCapitalConsumer = consumerLoans
    .reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);

  const initialCapitalConsumer = consumerLoans
    .reduce((sum, l) => sum + (Number(l.initialAmount) || 0), 0);

  const remainingCapitalMortgage = mortgageLoans
    .reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);

  const totalRemainingCapital = activeLoans.reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);
  const totalInitialCapital = activeLoans.reduce((sum, l) => sum + (Number(l.initialAmount) || 0), 0);

  let consumerProgress = 0;
  let hasConsumerProgress = false;
  if (initialCapitalConsumer > 0) {
    consumerProgress = Math.max(0, Math.min(100, ((initialCapitalConsumer - remainingCapitalConsumer) / initialCapitalConsumer) * 100));
    hasConsumerProgress = true;
  }

  const renderLoanCard = (loan: Loan, isArchivedView = false) => {
    const initialAmount = Number(loan.initialAmount) || 0;
    const remainingAmount = Number(loan.remainingCapital) || 0;
    let progress = 0;
    let hasProgress = false;
    if (initialAmount > 0) {
      progress = Math.max(0, Math.min(100, ((initialAmount - remainingAmount) / initialAmount) * 100));
      hasProgress = true;
    }

    const appClearedPayments = loanPayments.filter(p => p.linkedId === loan.id && p.status === 'cleared').length;
    const prepaid = Number(loan.prepaidInstallments) || 0;
    const adjustment = Number(loan.monthsAdjustment) || 0;
    let clearedPayments = appClearedPayments + prepaid + adjustment;
    const duration = Number(loan.durationMonths) || 0;
    if (clearedPayments < 0) clearedPayments = 0;
    if (duration > 0 && clearedPayments > duration) clearedPayments = duration;

    return (
      <div key={loan.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', opacity: isArchivedView ? 0.92 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>{loan.name}</h3>
              {isArchivedView ? (
                <span style={{ 
                  fontSize: '0.75rem', 
                  padding: '0.15rem 0.5rem', 
                  borderRadius: '999px', 
                  backgroundColor: '#e2e8f0', 
                  color: '#475569', 
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  📦 Archivé
                </span>
              ) : loan.isPaused ? (
                <span style={{ 
                  fontSize: '0.75rem', 
                  padding: '0.15rem 0.5rem', 
                  borderRadius: '999px', 
                  backgroundColor: '#fef3c7', 
                  color: '#92400e', 
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  ⏸️ En pause
                </span>
              ) : null}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{loan.lender}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {!isArchivedView && (
              <Button 
                variant="icon" 
                onClick={() => handleTogglePause(loan)} 
                title={loan.isPaused ? "Reprendre le crédit" : "Mettre en pause"}
                style={{ padding: '0.25rem' }}
              >
                {loan.isPaused ? <Play size={14} color="#16a34a" /> : <Pause size={14} color="#d97706" />}
              </Button>
            )}
            <Button
              variant="icon"
              onClick={() => handleOpenHistory(loan)}
              title="Historique & modification de mensualité"
              style={{ padding: '0.25rem' }}
            >
              <History size={14} color="var(--primary-color)" />
            </Button>
            <Button 
              variant="icon" 
              onClick={() => { setEditingLoan(loan); setLoanAccountId(loan.accountId); setIsLoanModalOpen(true); }} 
              title="Modifier la fiche du crédit"
              style={{ padding: '0.25rem' }}
            >
              <Edit2 size={14} />
            </Button>
            {isArchivedView ? (
              <Button 
                variant="icon" 
                onClick={() => handleOpenUnarchiveModal(loan)} 
                title="Désarchiver ce crédit"
                style={{ padding: '0.25rem' }}
              >
                <ArchiveRestore size={14} color="#16a34a" />
              </Button>
            ) : (
              <Button 
                variant="icon" 
                onClick={() => handleOpenArchiveModal(loan)} 
                title="Archiver ce crédit"
                style={{ padding: '0.25rem' }}
              >
                <Archive size={14} color="#d97706" />
              </Button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Capital initial</div>
            <div style={{ fontWeight: 'bold' }}>{initialAmount.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Restant dû</div>
            <div style={{ fontWeight: 'bold' }}>{remainingAmount.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Mensualité</div>
            <div style={{ fontWeight: 'bold' }}>{(Number(loan.monthlyPayment) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Taux</div>
            <div style={{ fontWeight: 'bold' }}>{loan.interestRate ? `${loan.interestRate} %` : '-'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Début</div>
            <div style={{ fontWeight: 'bold' }}>{loan.startDate ? new Date(loan.startDate).toLocaleDateString('fr-FR') : '-'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Fin prévue</div>
            <div style={{ fontWeight: 'bold' }}>{loan.endDate ? new Date(loan.endDate).toLocaleDateString('fr-FR') : '-'}</div>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
          <strong>Mensualités payées :</strong> <span>{clearedPayments} sur {loan.durationMonths || '?'}</span> 
          {prepaid > 0 && appClearedPayments > 0 && (
            <span> ({prepaid} historiques et {appClearedPayments} débitées ici)</span>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 500 }}>Remboursement</span>
            <span style={{ fontWeight: 'bold', color: hasProgress ? 'inherit' : 'var(--text-muted)' }}>
              {hasProgress ? `${progress.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %` : '-'}
            </span>
          </div>
          {hasProgress && (
            <div style={{ width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '999px', height: '6px' }}>
              <div style={{ backgroundColor: 'var(--primary-color)', height: '6px', borderRadius: '999px', width: `${progress}%` }}></div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem' }}>Mensualité de {formatMonth(selectedMonth)}</h4>
            {!isArchivedView && !loan.isPaused && monthPayments.filter(p => p.linkedId === loan.id).length === 0 && (
              <Button onClick={() => { setSelectedLoanId(loan.id); setEditingPayment(null); setIsPaymentModalOpen(true); }} style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                + Enregistrer
              </Button>
            )}
          </div>
          
          {isArchivedView && monthPayments.filter(p => p.linkedId === loan.id).length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>
              Crédit archivé (aucune mensualité prévue)
            </div>
          )}

          {!isArchivedView && loan.isPaused && monthPayments.filter(p => p.linkedId === loan.id).length === 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>
              Crédit en pause (mensualité suspendue)
            </div>
          )}
          
          {monthPayments.filter(p => p.linkedId === loan.id).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {monthPayments.filter(p => p.linkedId === loan.id).map(payment => (
                <div key={payment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-color)', padding: '0.4rem 0.5rem', borderRadius: 'var(--radius)', borderLeft: `3px solid ${payment.status === 'cleared' ? 'var(--success-color)' : payment.status === 'pending' ? 'var(--warning-color)' : payment.status === 'disabled' ? 'transparent' : 'var(--primary-color)'}`, opacity: payment.status === 'disabled' ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{(Number(payment.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</span>
                    <StatusBadgeSelect
                      status={payment.status}
                      options={LOAN_PAYMENT_STATUS_OPTIONS}
                      onChange={newStatus => handleUpdatePaymentStatus(payment, newStatus)}
                      size="sm"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.15rem' }}>
                    {payment.status !== 'cleared' && payment.status !== 'disabled' && (
                      <Button variant="outline" onClick={() => handleMarkAsCleared(payment)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}>Valider</Button>
                    )}
                    <Button variant="icon" onClick={() => { setSelectedLoanId(loan.id); setEditingPayment(payment); setIsPaymentModalOpen(true); }} style={{ padding: '0.15rem' }}><Edit2 size={12} /></Button>
                    <Button variant="icon" onClick={() => handleDeletePayment(payment.id)} style={{ padding: '0.15rem' }}><Trash2 size={12} color="var(--danger-color)" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {loan.insurancePart && Number(loan.insurancePart) > 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '0.25rem' }}>
            Assurance incluse : {(Number(loan.insurancePart)).toLocaleString('fr-FR', {minimumFractionDigits: 2})} € / mois
          </div>
        ) : null}
      </div>
    );
  };

  const currentLoanList = activeTab === 'active' ? activeLoans : archivedLoans;
  const currentMortgageLoans = currentLoanList.filter(l => l.loanType === 'mortgage');
  const currentConsumerLoans = currentLoanList.filter(l => l.loanType !== 'mortgage');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Prêts et crédits</h1>
        <Button onClick={() => { setEditingLoan(null); setLoanAccountId(accounts[0]?.id || ''); setIsLoanModalOpen(true); }} icon={<Plus size={16} />}>
          Ajouter un crédit
        </Button>
      </div>

      {/* Onglets : Crédits actifs vs Crédits archivés */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <Button
          variant={activeTab === 'active' ? 'primary' : 'outline'}
          onClick={() => setActiveTab('active')}
          icon={<CreditCard size={16} />}
        >
          Crédits actifs ({activeLoans.length})
        </Button>
        <Button
          variant={activeTab === 'archived' ? 'primary' : 'outline'}
          onClick={() => setActiveTab('archived')}
          icon={<Archive size={16} />}
        >
          Crédits archivés ({archivedLoans.length})
        </Button>
      </div>

      {activeTab === 'active' ? (
        <>
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
            </div>
          </div>

          <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
            <Card title="Mensualités prévues" value={`${totalPlanned.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
            <Card title="Déjà débitées" value={`${totalPaid.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
            <Card title="Restant à payer" value={`${totalRemainingMonth.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
            <Card title="Taux d’endettement budgétaire">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div className="kpi-value" style={{ margin: 0, color: levelColor }}>
                  {debtRatioText}
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '9999px',
                  backgroundColor: levelBg,
                  color: levelColor,
                  fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  {levelLabel}
                </span>
              </div>

              <div style={{ position: 'relative', marginTop: '0.6rem', width: '100%' }}>
                <div style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(to right, #16a34a 0%, #16a34a 20%, #84cc16 20%, #84cc16 30%, #eab308 30%, #eab308 35%, #f97316 35%, #f97316 45%, #ef4444 45%, #ef4444 100%)'
                }} />

                {debtRatioValue !== null && (
                  <div 
                    title={`Taux d'endettement : ${debtRatioText} (${levelLabel})`}
                    style={{
                      position: 'absolute',
                      top: '-3px',
                      left: `${Math.min(100, Math.max(0, debtRatioValue))}%`,
                      transform: 'translateX(-50%)',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: levelColor,
                      border: '2px solid #ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                      pointerEvents: 'none'
                    }} 
                  />
                )}
              </div>
            </Card>
            <Card title="Capital restant dû — Total de tous les crédits et prêts immobiliers" value={`${totalRemainingCapital.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
            <Card title="Capital restant dû — Crédits à la consommation" value={`${remainingCapitalConsumer.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
            <Card title="Capital restant dû — Prêt immobilier" value={`${remainingCapitalMortgage.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
          </div>

          {hasConsumerProgress && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 500 }}>Progression du remboursement des crédits à la consommation</span>
                <span style={{ fontWeight: 'bold' }}>{consumerProgress.toLocaleString('fr-FR', {maximumFractionDigits: 1})} %</span>
              </div>
              <div style={{ width: '100%', backgroundColor: 'var(--border-color)', borderRadius: '999px', height: '8px', marginBottom: '0.5rem' }}>
                <div style={{ backgroundColor: 'var(--primary-color)', height: '8px', borderRadius: '999px', width: `${consumerProgress}%` }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span>Différence calculée : {(initialCapitalConsumer - remainingCapitalConsumer).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</span>
                <span>Capital restant dû : {remainingCapitalConsumer.toLocaleString('fr-FR', {minimumFractionDigits: 2})} € (sur {initialCapitalConsumer.toLocaleString('fr-FR', {minimumFractionDigits: 2})} € de référence)</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Groupe 1 : Prêt immobilier */}
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Prêt immobilier
                {currentMortgageLoans.length > 0 && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    ({currentMortgageLoans.length})
                  </span>
                )}
              </h2>
              {currentMortgageLoans.length === 0 ? (
                <div className="card" style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Aucun prêt immobilier actif enregistré
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {currentMortgageLoans.map(loan => renderLoanCard(loan, false))}
                </div>
              )}
            </div>

            {/* Groupe 2 : Crédits à la consommation */}
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Crédits à la consommation
                {currentConsumerLoans.length > 0 && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    ({currentConsumerLoans.length})
                  </span>
                )}
              </h2>
              {currentConsumerLoans.length === 0 ? (
                <div className="card" style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Aucun crédit à la consommation actif enregistré
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {currentConsumerLoans.map(loan => renderLoanCard(loan, false))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* VUE CRÉDITS ARCHIVÉS */
        <div>
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Info size={20} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              <strong>Section des crédits archivés :</strong> Les crédits soldés ou archivés ne figurent plus dans les mensualités prévues actives ni dans les prévisions futures.
              Leurs informations contractuelles, l'historique complet de leurs mensualités passées et leurs écritures bancaires débitées restent scrupuleusement conservés.
            </div>
          </div>

          {archivedLoans.length === 0 ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Archive size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 500, fontSize: '1rem' }}>Aucun crédit archivé pour le moment.</p>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.85rem' }}>
                Lorsqu'un crédit est entièrement remboursé ou que vous ne souhaitez plus le suivre dans votre budget actif, vous pouvez l'archiver depuis l'onglet « Crédits actifs ».
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Groupe 1 : Prêt immobilier archivé */}
              {currentMortgageLoans.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Prêt immobilier archivé ({currentMortgageLoans.length})
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {currentMortgageLoans.map(loan => renderLoanCard(loan, true))}
                  </div>
                </div>
              )}

              {/* Groupe 2 : Crédits consommation archivés */}
              {currentConsumerLoans.length > 0 && (
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Crédits à la consommation archivés ({currentConsumerLoans.length})
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {currentConsumerLoans.map(loan => renderLoanCard(loan, true))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL CRÉATION / ÉDITION DE CRÉDIT */}
      <Modal
        isOpen={isLoanModalOpen}
        onClose={() => setIsLoanModalOpen(false)}
        title={editingLoan ? 'Modifier le crédit' : 'Ajouter un crédit'}
      >
        <form key={editingLoan ? editingLoan.id : 'new'} onSubmit={handleSaveLoan}>
          <div className="form-group">
            <label className="form-label">Catégorie du crédit</label>
            <select name="loanType" defaultValue={editingLoan?.loanType || 'consumer'} className="form-control">
              <option value="consumer">Crédit à la consommation</option>
              <option value="mortgage">Prêt immobilier</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Nom du crédit</label>
              <input type="text" name="name" defaultValue={editingLoan?.name} required className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Organisme</label>
              <input type="text" name="lender" defaultValue={editingLoan?.lender} required className="form-control" />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Capital initial (€)</label>
              <input type="number" step="0.01" name="initialAmount" defaultValue={editingLoan?.initialAmount} required className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Capital restant dû (€)</label>
              <input type="number" step="0.01" name="remainingCapital" defaultValue={editingLoan?.remainingCapital} required className="form-control" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Mensualité (€)</label>
              <input type="number" step="0.01" name="monthlyPayment" defaultValue={editingLoan?.monthlyPayment} required className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Taux (%)</label>
              <input type="number" step="0.01" name="interestRate" defaultValue={editingLoan?.interestRate} className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Assurance (€)</label>
              <input type="number" step="0.01" name="insurancePart" defaultValue={editingLoan?.insurancePart} className="form-control" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Début</label>
              <input type="date" name="startDate" defaultValue={editingLoan?.startDate} required className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Durée (mois)</label>
              <input type="number" name="durationMonths" defaultValue={editingLoan?.durationMonths} required className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Fin prévue</label>
              <input type="date" name="endDate" defaultValue={editingLoan?.endDate} className="form-control" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" title="Mensualités déjà payées avant utilisation de l'application">Déjà payées</label>
              <input type="number" min="0" name="prepaidInstallments" defaultValue={editingLoan?.prepaidInstallments || 0} className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label" title="Ajustement manuel du compteur de mensualités payées">Ajustement du compteur</label>
              <input type="number" name="monthsAdjustment" defaultValue={editingLoan?.monthsAdjustment || 0} className="form-control" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Jour prélèv.</label>
              <input type="number" min="1" max="31" name="debitDay" defaultValue={editingLoan?.debitDay} className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Compte concerné</label>
              <AccountSelect
                name="accountId"
                value={loanAccountId}
                onChange={setLoanAccountId}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea name="notes" defaultValue={editingLoan?.notes} className="form-control" />
          </div>

          <div className="modal-footer">
            <Button type="button" variant="outline" onClick={() => setIsLoanModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL ARCHIVAGE SÉCURISÉ */}
      <Modal
        isOpen={isArchiveModalOpen}
        onClose={() => { if (!isArchivingLoading) { setIsArchiveModalOpen(false); setLoanToArchive(null); } }}
        title="Archiver le crédit"
      >
        {loanToArchive && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.85rem', color: '#92400e' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                  Archiver « {loanToArchive.name} » ({loanToArchive.lender})
                </p>
                <p style={{ margin: 0 }}>
                  Ce crédit sera retiré de la liste des crédits actifs et de vos mensualités prévues.
                  L'historique des mensualités déjà débitées, des transactions pointées et du capital reste scrupuleusement conservé sans modifier vos soldes bancaires.
                </p>
              </div>
            </div>

            {(() => {
              const futureCount = (serverData?.transactions || []).filter(t => 
                t.type === 'loan_payment' && 
                t.linkedId === loanToArchive.id && 
                t.status === 'planned' && 
                t.date >= currentMonth
              ).length;

              return (
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-color)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: futureCount > 0 ? 'pointer' : 'default', fontWeight: 500, fontSize: '0.9rem' }}>
                    <input 
                      type="checkbox" 
                      checked={futureCount > 0 ? disableFutureOnArchive : false}
                      disabled={futureCount === 0}
                      onChange={(e) => setDisableFutureOnArchive(e.target.checked)}
                    />
                    <span>
                      Désactiver également les {futureCount} échéance(s) future(s) prévue(s) non débitée(s)
                    </span>
                  </label>
                  <p style={{ margin: '0.35rem 0 0 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {futureCount > 0 
                      ? "Recommandé : ces échéances prévues ne s'afficheront plus dans votre budget futur, mais restent conservées et consultables."
                      : "Aucune échéance future prévue à désactiver pour ce crédit."}
                  </p>
                </div>
              );
            })()}

            <div className="modal-footer">
              <Button 
                type="button" 
                variant="outline" 
                disabled={isArchivingLoading}
                onClick={() => { setIsArchiveModalOpen(false); setLoanToArchive(null); }}
              >
                Annuler
              </Button>
              <Button 
                type="button" 
                variant="primary" 
                disabled={isArchivingLoading}
                onClick={handleArchiveConfirm}
                style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
              >
                {isArchivingLoading ? 'Archivage...' : 'Confirmer l\'archivage'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL DÉSARCHIVAGE SÉCURISÉ */}
      <Modal
        isOpen={isUnarchiveModalOpen}
        onClose={() => { if (!isUnarchivingLoading) { setIsUnarchiveModalOpen(false); setLoanToUnarchive(null); } }}
        title="Désarchiver le crédit"
      >
        {loanToUnarchive && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', backgroundColor: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <CheckCircle size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.85rem', color: '#166534' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                  Désarchiver « {loanToUnarchive.name} » ({loanToUnarchive.lender})
                </p>
                <p style={{ margin: 0 }}>
                  Ce crédit redeviendra visible dans votre liste des crédits actifs et sera réintégré dans le suivi de vos mensualités prévues.
                </p>
              </div>
            </div>

            {(() => {
              const disabledFutureCount = (serverData?.transactions || []).filter(t => 
                t.type === 'loan_payment' && 
                t.linkedId === loanToUnarchive.id && 
                t.status === 'disabled' && 
                t.date >= currentMonth
              ).length;

              return (
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-color)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)' }}>
                  {disabledFutureCount > 0 ? (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                        <input 
                          type="checkbox" 
                          checked={reactivateFutureOnUnarchive}
                          onChange={(e) => setReactivateFutureOnUnarchive(e.target.checked)}
                        />
                        <span>
                          Réactiver également les {disabledFutureCount} échéance(s) future(s) précédemment désactivée(s)
                        </span>
                      </label>
                      <p style={{ margin: '0.35rem 0 0 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Par sécurité, les échéances désactivées ne sont jamais réactivées automatiquement sans votre accord explicite.
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Aucune échéance désactivée à réactiver. Le crédit sera réactivé avec ses mensualités théoriques actives.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="modal-footer">
              <Button 
                type="button" 
                variant="outline" 
                disabled={isUnarchivingLoading}
                onClick={() => { setIsUnarchiveModalOpen(false); setLoanToUnarchive(null); }}
              >
                Annuler
              </Button>
              <Button 
                type="button" 
                variant="primary" 
                disabled={isUnarchivingLoading}
                onClick={handleUnarchiveConfirm}
              >
                {isUnarchivingLoading ? 'Réactivation...' : 'Confirmer la réactivation'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL HISTORIQUE ET MODIFICATION DE MENSUALITÉ */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => { setIsHistoryModalOpen(false); setHistoryLoan(null); }}
        title={`Historique & mensualités — ${historyLoan?.name || ''}`}
      >
        {historyLoan && (
          <div>
            <div style={{ backgroundColor: 'var(--bg-color)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Mensualité actuelle : </span><strong>{(Number(historyLoan.monthlyPayment) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Restant dû : </span><strong>{(Number(historyLoan.remainingCapital) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Taux : </span><strong>{historyLoan.interestRate ? `${historyLoan.interestRate} %` : '0 %'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Assurance : </span><strong>{historyLoan.insurancePart ? `${historyLoan.insurancePart} €` : '0 €'}</strong></div>
            </div>

            {/* FORMULAIRE D'AJOUT D'UN NOUVEAU PALIER */}
            <form onSubmit={handleSaveNewTier} style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Modifier la mensualité (nouveau palier)</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nouvelle mensualité (€) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={newPaymentAmount} 
                    onChange={(e) => setNewPaymentAmount(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Mois d'effet *</label>
                  <input 
                    type="month" 
                    className="form-control" 
                    value={newEffectiveMonth} 
                    onChange={(e) => setNewEffectiveMonth(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Motif / Commentaire (optionnel)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Ex : Révision annuelle de taux, remboursement partiel, renégociation d'assurance..." 
                  value={newPaymentNotes} 
                  onChange={(e) => setNewPaymentNotes(e.target.value)} 
                />
              </div>

              {/* SIMULATION ACTUARIELLE INDICATIVE */}
              {payoffSim && (
                <div style={{ backgroundColor: payoffSim.possible ? 'var(--bg-color)' : '#fee2e2', border: `1px solid ${payoffSim.possible ? 'var(--border-color)' : '#fca5a5'}`, borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: payoffSim.possible ? 'var(--text-main)' : '#dc2626' }}>
                    {payoffSim.possible ? '📊 Simulation actuarielle indicative' : '⚠️ Attention'}
                  </div>
                  {payoffSim.possible ? (
                    <div>
                      <div>
                        Date de fin estimée : <strong>{formatMonth(payoffSim.estimatedEndMonth!)}</strong> (~{payoffSim.monthsRemaining} mois restants)
                      </div>
                      {payoffSim.totalInterest !== undefined && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                          Total intérêts estimés restants : {payoffSim.totalInterest.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                          {payoffSim.lastPaymentAmount !== undefined && Math.abs(payoffSim.lastPaymentAmount - parsedNewPayment) >= 0.01 && (
                            <span> (dernière mensualité ajustée : {payoffSim.lastPaymentAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €)</span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.35rem' }}>
                        Cette estimation est purement indicative (calculée au centime près selon le taux et l'assurance). Elle ne modifie pas automatiquement la date contractuelle du crédit.
                      </div>
                      {payoffSim.estimatedEndMonth && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={handleApplyEstimatedEndDate}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            📅 Appliquer cette date de fin estimée ({formatMonth(payoffSim.estimatedEndMonth)}) à la fiche du crédit
                          </Button>
                          {appliedEndDateSuccess && (
                            <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600 }}>
                              ✓ Date de fin mise à jour !
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: '#dc2626' }}>{payoffSim.reason}</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" disabled={isSavingTier}>
                  {isSavingTier ? 'Enregistrement...' : 'Enregistrer la nouvelle mensualité'}
                </Button>
              </div>
            </form>

            {/* HISTORIQUE CHRONOLOGIQUE DES PALIERS */}
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Historique des mensualités</h3>
              {isHistoryLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>Chargement de l'historique...</div>
              ) : historyError ? (
                <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{historyError}</div>
              ) : paymentHistoryList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>Aucun palier enregistré.</div>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Mois d'effet</th>
                        <th>Mensualité</th>
                        <th>Variation</th>
                        <th>Motif / Note</th>
                        <th>Saisi le</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistoryList.map(tier => {
                        const isBaseline = tier.previousPayment === null || (tier.notes && tier.notes.includes('contractuelle initiale'));
                        const isFuture = tier.effectiveMonth > currentMonth;
                        const diff = tier.previousPayment !== null && tier.previousPayment !== undefined 
                          ? tier.monthlyPayment - tier.previousPayment 
                          : null;
                        return (
                          <tr key={tier.id}>
                            <td><strong>{tier.effectiveMonth}</strong></td>
                            <td>{Number(tier.monthlyPayment).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</td>
                            <td>
                              {diff === null ? (
                                <span style={{ color: 'var(--text-muted)' }}>Initial</span>
                              ) : diff > 0 ? (
                                <span style={{ color: '#ea580c', fontWeight: 600 }}>+{diff.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
                              ) : diff < 0 ? (
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>{diff.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>=</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>{tier.notes || '—'}</td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {tier.createdAt ? new Date(tier.createdAt).toLocaleDateString('fr-FR') : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {isBaseline ? (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Contrat initial</span>
                              ) : (
                                <Button
                                  variant="icon"
                                  onClick={() => handleDeleteTier(tier)}
                                  title={isFuture ? "Supprimer ce palier futur" : "Supprimer ce palier (attention : palier actif ou passé)"}
                                  style={{ padding: '0.2rem' }}
                                >
                                  <Trash2 size={13} color="var(--danger-color)" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
              <Button type="button" variant="outline" onClick={() => { setIsHistoryModalOpen(false); setHistoryLoan(null); }}>
                Fermer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL ENREGISTRER UNE MENSUALITÉ */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Enregistrer une mensualité"
      >
        <form key={selectedLoanId || 'payment'} onSubmit={handleSavePayment}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Les mensualités ne sont pas déduites intégralement du capital restant dû, car elles incluent des intérêts et assurances.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Montant total (€)</label>
              <input 
                type="number" 
                step="0.01" 
                name="amount" 
                defaultValue={editingPayment ? editingPayment.amount : allLoans.find(l => l.id === selectedLoanId)?.monthlyPayment} 
                required 
                className="form-control" 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input 
                type="date" 
                name="date" 
                defaultValue={editingPayment ? editingPayment.date : new Date().toISOString().split('T')[0]} 
                required 
                className="form-control" 
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Statut</label>
            <select name="status" defaultValue={editingPayment ? editingPayment.status : "cleared"} className="form-control">
              <option value="planned">Prévue</option>
              <option value="pending">En attente</option>
              <option value="cleared">Débitée</option>
              <option value="disabled">Désactivée</option>
            </select>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <div className="form-group">
              <label className="form-label">
                Part de capital amorti estimée ou réelle (€) - Optionnel
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Si laissée vide, elle sera calculée automatiquement selon le taux d'intérêt. Ce montant sera déduit du capital restant dû lorsque la mensualité est débitée (et recrédité si elle repasse en attente).
              </p>
              <input 
                type="number" 
                step="0.01" 
                name="amortizedCapital" 
                defaultValue={editingPayment?.amortizedCapital}
                placeholder="Ex: 500" 
                className="form-control" 
              />
            </div>
          </div>

          <div className="modal-footer">
            <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)}>Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer la mensualité</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
