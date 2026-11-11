import React from 'react';
import type { Loan, Transaction } from '../../db/database';
import { roundCurrency, estimateLoanPayoffClient } from '../../engine/calculations';
import { getCurrentMonth } from '../../utils/dateUtils';
import { 
  Rocket, 
  CalendarCheck, 
  TrendingDown, 
  Sparkles, 
  Home, 
  CreditCard, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Zap
} from 'lucide-react';

export interface LoanReleaseTimelineProps {
  loans: Loan[];
  monthlyIncomes?: number;
  loanPayments?: Transaction[];
  currentMonth?: string;
}

export interface ReleaseMilestone {
  loanId: string;
  loanName: string;
  lender: string;
  loanType: 'mortgage' | 'consumer';
  endMonth: string; // YYYY-MM
  endMonthFormatted: string; // ex: "octobre 2028"
  monthlyPayment: number; // Montant libéré par ce prêt
  cumulativeFreedMonthly: number; // Cumul du cash-flow libéré
  remainingActiveLoansCount: number;
  projectedRemainingMonthly: number; // Mensualités totales restantes
  projectedDebtRatio: number | null; // % si monthlyIncomes > 0
  isMortgage: boolean;
  remainingCapital: number;
}

export function formatMonthFr(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function computeReleaseMilestones(
  loans: Loan[],
  monthlyIncomes = 0,
  loanPayments: Transaction[] = [],
  baseCurrentMonth = getCurrentMonth()
): {
  milestones: ReleaseMilestone[];
  totalMonthlyInitially: number;
  initialDebtRatio: number | null;
  totalInitialCapital: number;
} {
  const activeLoans = loans.filter(l => !l.isArchived && (Number(l.remainingCapital) || 0) > 0);

  const totalMonthlyInitially = roundCurrency(
    activeLoans.reduce((sum, l) => sum + (Number(l.monthlyPayment) || 0), 0)
  );

  const totalInitialCapital = roundCurrency(
    activeLoans.reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0)
  );

  const initialDebtRatio = monthlyIncomes > 0
    ? roundCurrency((totalMonthlyInitially / monthlyIncomes) * 100)
    : null;

  // Calcul du mois de fin pour chaque prêt
  const loansWithEnd = activeLoans.map(loan => {
    let endYm = loan.endDate ? loan.endDate.slice(0, 7) : '';

    if (!endYm) {
      const rem = Number(loan.remainingCapital) || 0;
      const pay = Number(loan.monthlyPayment) || 0;
      const isCurrentMonthCleared = loanPayments.some(
        p => p.linkedId === loan.id && p.status === 'cleared' && p.date.startsWith(baseCurrentMonth)
      );
      const simStartMonth = isCurrentMonthCleared
        ? (() => {
            const [y, m] = baseCurrentMonth.split('-').map(Number);
            const nextM = m === 12 ? 1 : m + 1;
            const nextY = m === 12 ? y + 1 : y;
            return `${nextY}-${String(nextM).padStart(2, '0')}`;
          })()
        : baseCurrentMonth;

      const sim = estimateLoanPayoffClient({
        remainingCapital: rem,
        monthlyPayment: pay,
        interestRate: Number(loan.interestRate) || 0,
        insurancePart: Number(loan.insurancePart) || 0,
        startMonth: simStartMonth
      });

      if (sim.possible && sim.estimatedEndMonth) {
        endYm = sim.estimatedEndMonth;
      } else {
        endYm = '9999-12';
      }
    }

    return {
      loan,
      endYm
    };
  });

  // Tri par date d'extinction finale croissante
  loansWithEnd.sort((a, b) => a.endYm.localeCompare(b.endYm));

  let runningCumulativeFreed = 0;
  let runningProjectedMonthly = totalMonthlyInitially;

  const milestones: ReleaseMilestone[] = loansWithEnd.map((item, index) => {
    const l = item.loan;
    const monthlyPayment = roundCurrency(Number(l.monthlyPayment) || 0);
    runningCumulativeFreed = roundCurrency(runningCumulativeFreed + monthlyPayment);
    runningProjectedMonthly = roundCurrency(Math.max(0, runningProjectedMonthly - monthlyPayment));

    const remainingActiveLoansCount = loansWithEnd.length - (index + 1);
    const projectedDebtRatio = monthlyIncomes > 0
      ? roundCurrency((runningProjectedMonthly / monthlyIncomes) * 100)
      : null;

    return {
      loanId: l.id,
      loanName: l.name,
      lender: l.lender,
      loanType: (l.loanType === 'mortgage' ? 'mortgage' : 'consumer') as 'mortgage' | 'consumer',
      endMonth: item.endYm,
      endMonthFormatted: formatMonthFr(item.endYm),
      monthlyPayment,
      cumulativeFreedMonthly: runningCumulativeFreed,
      remainingActiveLoansCount,
      projectedRemainingMonthly: runningProjectedMonthly,
      projectedDebtRatio,
      isMortgage: l.loanType === 'mortgage',
      remainingCapital: Number(l.remainingCapital) || 0
    };
  });

  return {
    milestones,
    totalMonthlyInitially,
    initialDebtRatio,
    totalInitialCapital
  };
}

export function LoanReleaseTimeline({
  loans,
  monthlyIncomes = 0,
  loanPayments = [],
  currentMonth = getCurrentMonth()
}: LoanReleaseTimelineProps) {
  const {
    milestones,
    totalMonthlyInitially,
    initialDebtRatio,
    totalInitialCapital
  } = computeReleaseMilestones(loans, monthlyIncomes, loanPayments, currentMonth);

  if (milestones.length === 0) {
    return (
      <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 0.75rem auto' }} />
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>Félicitations, aucun crédit en cours !</h3>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
          Vous êtes libre de tout engagement d'emprunt. 100 % de vos revenus sont disponibles pour votre reste à vivre et votre épargne.
        </p>
      </div>
    );
  }

  const finalMilestone = milestones[milestones.length - 1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Carte Héros / Synthèse de la Libération Financière */}
      <div 
        className="card"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: 'var(--radius, 12px)',
          padding: '1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(37, 99, 235, 0.25)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Rocket size={22} color="#60a5fa" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                Trajectoire d'Extinction & Libération du Cash-Flow
              </h2>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Vision prospective du désendettement progressif et de l'augmentation mécanique de votre reste à vivre.
              </p>
            </div>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.35rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', color: '#34d399', fontWeight: 600 }}>
            <Sparkles size={14} />
            <span>Horizon liberté totale : {finalMilestone.endMonthFormatted}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mensualités engagées actuelles</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.25rem' }}>
              {totalMonthlyInitially.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>/mois</span>
            </div>
            {initialDebtRatio !== null && (
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                Taux d'endettement : <strong>{initialDebtRatio.toFixed(1)} %</strong>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cash-flow total à récupérer</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399', marginTop: '0.25rem' }}>
              +{totalMonthlyInitially.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €<span style={{ fontSize: '0.8rem', color: '#a7f3d0', fontWeight: 400 }}>/mois</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
              Gain net cumulé de reste à vivre
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capital restant dû global</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.25rem' }}>
              {totalInitialCapital.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
              Dette nominale à rembourser
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre d'étapes d'extinction</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.25rem' }}>
              {milestones.length} crédit{milestones.length > 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
              Paliers successifs de libération
            </div>
          </div>
        </div>
      </div>

      {/* 2. Frise Chronologique / Timeline des Étapes d'Extinction */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CalendarCheck size={18} color="var(--primary-color)" />
          Chronologie des extinctions de crédits & gains de cash-flow
        </h3>

        <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
          {/* Ligne verticale conductrice */}
          <div 
            style={{
              position: 'absolute',
              top: '12px',
              bottom: '12px',
              left: '7px',
              width: '2px',
              backgroundColor: 'var(--border-color, #e2e8f0)',
              borderRadius: '999px'
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {milestones.map((m, idx) => {
              const isFinal = idx === milestones.length - 1;
              const isFirst = idx === 0;

              return (
                <div key={m.loanId} style={{ position: 'relative' }}>
                  {/* Puce chronologique sur la ligne */}
                  <div 
                    style={{
                      position: 'absolute',
                      left: '-1.5rem',
                      top: '16px',
                      transform: 'translateX(-50%)',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: isFinal ? '#16a34a' : m.isMortgage ? '#2563eb' : '#d97706',
                      border: '3px solid var(--surface-color, #ffffff)',
                      boxShadow: '0 0 0 2px var(--border-color, #cbd5e1)'
                    }} 
                  />

                  {/* Carte d'étape */}
                  <div 
                    style={{
                      backgroundColor: 'var(--bg-color, #f8fafc)',
                      border: '1px solid var(--border-color, #e2e8f0)',
                      borderLeft: `4px solid ${isFinal ? '#16a34a' : m.isMortgage ? '#2563eb' : '#ea580c'}`,
                      borderRadius: 'var(--radius, 10px)',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span 
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            backgroundColor: isFinal ? '#dcfce7' : '#eff6ff',
                            color: isFinal ? '#16a34a' : '#1d4ed8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <CalendarCheck size={14} />
                          {m.endMonthFormatted}
                        </span>

                        <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: m.isMortgage ? '#dbeafe' : '#ffedd5', color: m.isMortgage ? '#1e40af' : '#9a3412', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          {m.isMortgage ? <Home size={12} /> : <CreditCard size={12} />}
                          {m.isMortgage ? 'Immobilier' : 'Consommation'}
                        </span>

                        {isFinal && (
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            🎉 Libération définitive
                          </span>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mensualité supprimée : </span>
                        <strong style={{ fontSize: '0.95rem', color: '#16a34a' }}>
                          +{m.monthlyPayment.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mois
                        </strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px dashed var(--border-color)', paddingTop: '0.5rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {m.loanName}
                        </h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.lender} • Restant dû actuel : {m.remainingCapital.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ backgroundColor: 'var(--surface-color)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Cash-flow cumulé : </span>
                          <strong style={{ color: '#16a34a' }}>
                            +{m.cumulativeFreedMonthly.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mois
                          </strong>
                        </div>

                        <div style={{ backgroundColor: 'var(--surface-color)', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Endettement projeté : </span>
                          <strong style={{ color: (m.projectedDebtRatio ?? 0) < 30 ? '#16a34a' : '#ea580c' }}>
                            {m.projectedDebtRatio !== null ? `${m.projectedDebtRatio.toFixed(1)} %` : '—'}
                          </strong>
                          <span style={{ color: 'var(--text-muted)' }}> ({m.projectedRemainingMonthly.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/m)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
