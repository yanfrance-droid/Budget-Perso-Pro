import React, { useState } from 'react';
import { generateId } from '../db/database';
import type { Loan, Transaction } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect, AccountSelect } from '../components/ui/Components';
import { Plus, Edit2, Trash2, Filter, Pause, Play } from 'lucide-react';

import { useServerDataOptional } from '../contexts/ServerDataContext';

const LOAN_PAYMENT_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Débité' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Désactivé' }
];

export default function Loans() {
  const serverData = useServerDataOptional();

  const accounts = serverData?.accounts || [];
  const loans = (serverData?.loans || []).filter(l => !l.isArchived);
  const loanPayments = (serverData?.transactions || []).filter(t => t.type === 'loan_payment');
  const incomeTransactions = (serverData?.transactions || []).filter(t => t.type === 'income');

  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [loanAccountId, setLoanAccountId] = useState<string>('');

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [editingPayment, setEditingPayment] = useState<Transaction | null>(null);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

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
      isArchived: editingLoan ? editingLoan.isArchived : false,
      isPaused: editingLoan ? editingLoan.isPaused : false,
      loanType: (formData.get('loanType') as 'consumer' | 'mortgage') || editingLoan?.loanType || 'consumer',
    };

    if (serverData) {
      await serverData.saveLoan(loan);
    }

    setIsLoanModalOpen(false);
    setEditingLoan(null);
  };

  const handleArchiveLoan = async (id: string) => {
    if (window.confirm('Voulez-vous vraiment archiver ce crédit ? L\'historique sera conservé.')) {
      if (serverData) {
        await serverData.saveLoan({ id, isArchived: true });
      }
    }
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
    const loan = loans?.find(l => l.id === selectedLoanId);

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

  if (!loans || !accounts || !loanPayments || !incomeTransactions) return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement...</div>;

  const monthIncomes = incomeTransactions.filter(inc => {
    // Rétrocompatibilité : ancienne récurrence non migrée
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

  loans.forEach(loan => {
    if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;

    const loanStartMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
    const loanEndMonth = loan.endDate ? loan.endDate.substring(0, 7) : null;
    
    const loanMonthPayments = monthPayments.filter(p => p.linkedId === loan.id);
    const disabledPayments = loanMonthPayments.filter(p => p.status === 'disabled');
    const activePayments = loanMonthPayments.filter(p => p.status !== 'disabled');
    
    // Si la mensualité a été explicitement désactivée et qu'il n'y a pas d'autre paiement actif
    if (disabledPayments.length > 0 && activePayments.length === 0) return;

    const hasPaymentThisMonth = activePayments.length > 0;
    
    const isStarted = !loanStartMonth || selectedMonth >= loanStartMonth;
    const isWithinDates = isStarted && (!loanEndMonth || selectedMonth <= loanEndMonth);
    const hasRemainingCapital = (Number(loan.remainingCapital) || 0) > 0;
    
    // Un crédit est actif et génère une mensualité prévue si :
    // 1. Il est dans ses dates théoriques
    // 2. OU il est commencé mais pas encore remboursé (capital restant > 0)
    // 3. OU il y a un paiement explicite ce mois-ci
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

  const consumerLoans = loans.filter(l => l.loanType !== 'mortgage');
  const mortgageLoans = loans.filter(l => l.loanType === 'mortgage');

  const remainingCapitalConsumer = consumerLoans
    .reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);

  const initialCapitalConsumer = consumerLoans
    .reduce((sum, l) => sum + (Number(l.initialAmount) || 0), 0);

  const remainingCapitalMortgage = mortgageLoans
    .reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);

  const totalRemainingCapital = loans.reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);
  const totalInitialCapital = loans.reduce((sum, l) => sum + (Number(l.initialAmount) || 0), 0);

  let consumerProgress = 0;
  let hasConsumerProgress = false;
  if (initialCapitalConsumer > 0) {
    consumerProgress = Math.max(0, Math.min(100, ((initialCapitalConsumer - remainingCapitalConsumer) / initialCapitalConsumer) * 100));
    hasConsumerProgress = true;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Prêts et crédits</h1>
        <Button onClick={() => { setEditingLoan(null); setLoanAccountId(accounts[0]?.id || ''); setIsLoanModalOpen(true); }} icon={<Plus size={16} />}>
          Ajouter un crédit
        </Button>
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

          {/* Barre fine en dégradé avec repère discret */}
          <div style={{ position: 'relative', marginTop: '0.6rem', width: '100%' }}>
            <div style={{
              width: '100%',
              height: '4px',
              borderRadius: '9999px',
              background: 'linear-gradient(to right, #16a34a 0%, #16a34a 20%, #84cc16 20%, #84cc16 30%, #eab308 30%, #eab308 35%, #f97316 35%, #f97316 45%, #ef4444 45%, #ef4444 100%)'
            }} />

            {/* Repère discret indiquant le taux actuel */}
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


      {(() => {
        const mortgageLoans = loans.filter(l => l.loanType === 'mortgage');
        const consumerLoans = loans.filter(l => l.loanType !== 'mortgage');

        const renderLoanCard = (loan: Loan) => {
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

          const formatMonth = (ym: string) => {
            const [y, m] = ym.split('-');
            const d = new Date(parseInt(y), parseInt(m) - 1, 1);
            return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          };

          return (
            <div key={loan.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>{loan.name}</h3>
                    {loan.isPaused && (
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
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{loan.lender}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <Button 
                    variant="icon" 
                    onClick={() => handleTogglePause(loan)} 
                    title={loan.isPaused ? "Reprendre le crédit" : "Mettre en pause"}
                    style={{ padding: '0.25rem' }}
                  >
                    {loan.isPaused ? <Play size={14} color="#16a34a" /> : <Pause size={14} color="#d97706" />}
                  </Button>
                  <Button variant="icon" onClick={() => { setEditingLoan(loan); setLoanAccountId(loan.accountId); setIsLoanModalOpen(true); }} style={{ padding: '0.25rem' }}>
                    <Edit2 size={14} />
                  </Button>
                  <Button variant="icon" onClick={() => handleArchiveLoan(loan.id)} style={{ padding: '0.25rem' }}>
                    <Trash2 size={14} color="var(--danger-color)" />
                  </Button>
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
                  {!loan.isPaused && monthPayments.filter(p => p.linkedId === loan.id).length === 0 && (
                    <Button onClick={() => { setSelectedLoanId(loan.id); setEditingPayment(null); setIsPaymentModalOpen(true); }} style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                      + Enregistrer
                    </Button>
                  )}
                </div>
                
                {loan.isPaused && monthPayments.filter(p => p.linkedId === loan.id).length === 0 && (
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

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Groupe 1 : Prêt immobilier */}
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Prêt immobilier
                {mortgageLoans.length > 0 && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    ({mortgageLoans.length})
                  </span>
                )}
              </h2>
              {mortgageLoans.length === 0 ? (
                <div className="card" style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Aucun prêt immobilier enregistré
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {mortgageLoans.map(renderLoanCard)}
                </div>
              )}
            </div>

            {/* Groupe 2 : Crédits à la consommation */}
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Crédits à la consommation
                {consumerLoans.length > 0 && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    ({consumerLoans.length})
                  </span>
                )}
              </h2>
              {consumerLoans.length === 0 ? (
                <div className="card" style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Aucun crédit à la consommation enregistré
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {consumerLoans.map(renderLoanCard)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
                defaultValue={editingPayment ? editingPayment.amount : loans.find(l => l.id === selectedLoanId)?.monthlyPayment} 
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
