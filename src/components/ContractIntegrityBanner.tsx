import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useServerDataOptional } from '../contexts/ServerDataContext';
import { getCurrentMonth, formatDateFr } from '../utils/dateUtils';
import { computeContractIntegrity } from '../engine/contractIntegrityEngine';
import type { SectionIntegrity, IntegrityItem } from '../engine/contractIntegrityEngine';
import { AlertTriangle, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Check, X, ShieldAlert, Sparkles } from 'lucide-react';

export interface ContractIntegrityBannerProps {
  forcedMonth?: string;
}

export const ContractIntegrityBanner: React.FC<ContractIntegrityBannerProps> = ({ forcedMonth }) => {
  const serverData = useServerDataOptional();
  const [activeMonth, setActiveMonth] = useState<string>(() => forcedMonth || getCurrentMonth());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [activeFilterSection, setActiveFilterSection] = useState<'all' | 'fixed_expense' | 'variable_expense' | 'income'>('all');

  // Synchronisation avec les changements de mois émis par les pages
  useEffect(() => {
    if (forcedMonth) {
      setActiveMonth(forcedMonth);
      return;
    }

    const handleMonthChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ month: string }>;
      if (customEvent.detail?.month) {
        setActiveMonth(customEvent.detail.month);
      }
    };

    window.addEventListener('pbp-active-month-changed', handleMonthChange);
    return () => {
      window.removeEventListener('pbp-active-month-changed', handleMonthChange);
    };
  }, [forcedMonth]);

  const recurrenceTemplates = serverData?.recurrenceTemplates || [];
  const transactions = serverData?.transactions || [];
  const acceptedExceptions = serverData?.acceptedExceptions || {};

  // Calcul du rapport granulaire d'intégrité
  const report = useMemo(() => {
    return computeContractIntegrity(recurrenceTemplates, transactions, activeMonth, acceptedExceptions);
  }, [recurrenceTemplates, transactions, activeMonth, acceptedExceptions]);

  const { fixedExpenses, variableExpenses, incomes } = report.sections;

  // Filtrage des items manquants selon la pastille sélectionnée (déclaré inconditionnellement en tête de composant)
  const displayedMissingSections: SectionIntegrity[] = useMemo(() => {
    if (activeFilterSection === 'fixed_expense') return [fixedExpenses];
    if (activeFilterSection === 'variable_expense') return [variableExpenses];
    if (activeFilterSection === 'income') return [incomes];
    return [fixedExpenses, variableExpenses, incomes].filter(s => s.missingCount > 0);
  }, [activeFilterSection, fixedExpenses, variableExpenses, incomes]);

  const handleSyncAll = useCallback(async () => {
    if (!serverData) return;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await serverData.syncRollingHorizon(activeMonth, 0, 12);
      setFeedback(`Synchronisation réussie : ${res.totalCreated} occurrence(s) générée(s) sur ${res.monthsProcessed.length} mois.`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback(`Erreur : ${err.message || 'Erreur inconnue'}`);
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  }, [serverData, activeMonth]);

  const handleRegenerateSingle = useCallback(async (templateId: string, label: string) => {
    if (!serverData) return;
    setIsSyncing(true);
    try {
      await serverData.generateSingleOccurrence(templateId, activeMonth);
      setFeedback(`Contrat « ${label} » régénéré avec succès pour ${formatDateFr(activeMonth)}.`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erreur : ${err.message || 'Impossible de régénérer'}`);
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  }, [serverData, activeMonth]);

  const handleAcceptException = useCallback(async (templateId: string, label: string) => {
    if (!serverData) return;
    try {
      await serverData.acceptIntegrityException(templateId, activeMonth);
      setFeedback(`Écart accepté pour « ${label} » sur ${formatDateFr(activeMonth)}.`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erreur : ${err.message}`);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [serverData, activeMonth]);

  const handleRevokeException = useCallback(async (templateId: string, label: string) => {
    if (!serverData) return;
    try {
      await serverData.revokeIntegrityException(templateId, activeMonth);
      setFeedback(`Acceptation révoquée pour « ${label} ».`);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erreur : ${err.message}`);
      setTimeout(() => setFeedback(null), 5000);
    }
  }, [serverData, activeMonth]);

  // Sortie anticipée UNIQUEMENT une fois que 100% des Hooks ont été appelés inconditionnellement
  if (!serverData || report.totalExpected === 0) {
    return null;
  }

  const formattedMonth = formatDateFr(activeMonth);

  const renderSectionPill = (
    section: SectionIntegrity,
    filterKey: 'fixed_expense' | 'variable_expense' | 'income'
  ) => {
    const isSelected = activeFilterSection === filterKey;
    const isCompliant = section.isFullyCompliant;
    const hasAccepted = section.acceptedCount > 0;

    return (
      <button
        key={filterKey}
        type="button"
        onClick={() => {
          if (activeFilterSection === filterKey) {
            setActiveFilterSection('all');
          } else {
            setActiveFilterSection(filterKey);
            setIsDetailsOpen(true);
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.2rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.74rem',
          fontWeight: 600,
          cursor: 'pointer',
          backgroundColor: isSelected
            ? (isCompliant ? '#15803d' : '#dc2626')
            : (isCompliant ? (hasAccepted ? '#ecfdf5' : '#f0fdf4') : '#fee2e2'),
          color: isSelected
            ? '#ffffff'
            : (isCompliant ? (hasAccepted ? '#065f46' : '#15803d') : '#b91c1c'),
          border: `1px solid ${isSelected ? 'transparent' : (isCompliant ? (hasAccepted ? '#a7f3d0' : '#bbf7d0') : '#fca5a5')}`,
          transition: 'all 0.15s ease'
        }}
        title={`Cliquer pour filtrer les détails sur ${section.title}`}
      >
        {isCompliant ? (
          <CheckCircle2 size={12} color={isSelected ? '#fff' : (hasAccepted ? '#059669' : '#16a34a')} />
        ) : (
          <AlertTriangle size={12} color={isSelected ? '#fff' : '#dc2626'} />
        )}
        <span>
          {section.title} : {section.totalFound}/{section.totalExpected}
          {!isCompliant && ` (-${section.missingCount})`}
          {isCompliant && hasAccepted && ` (${section.acceptedCount} acc.)`}
        </span>
      </button>
    );
  };

  // CAS 1 : ÉCART NON RÉSOLU (ALERTE PROÉMINENTE)
  if (!report.isFullyCompliant) {
    return (
      <div 
        role="alert"
        aria-live="assertive"
        style={{
          backgroundColor: '#fef2f2',
          borderBottom: '2px solid #ef4444',
          borderTop: '1px solid #fee2e2',
          color: '#991b1b',
          padding: '0.65rem 1.25rem',
          fontSize: '0.85rem',
          boxShadow: '0 2px 4px rgba(239, 68, 68, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
            <div style={{
              backgroundColor: '#fee2e2',
              padding: '0.4rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <AlertTriangle size={19} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>Alerte Intégrité : {report.totalMissing} charge(s) contractuelle(s) manquante(s) sur {formattedMonth} (écart : {report.totalMissingAmount.toFixed(2)} €)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: '#7f1d1d', fontWeight: 600 }}>Par rubrique :</span>
                {renderSectionPill(fixedExpenses, 'fixed_expense')}
                {renderSectionPill(variableExpenses, 'variable_expense')}
                {renderSectionPill(incomes, 'income')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {feedback && (
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: feedback.startsWith('Erreur') ? '#b91c1c' : '#15803d' }}>
                {feedback}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              style={{
                background: 'transparent',
                border: '1px solid #fca5a5',
                borderRadius: '6px',
                color: '#b91c1c',
                padding: '0.35rem 0.65rem',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
              title="Voir et arbitrer les charges manquantes"
            >
              Arbitrage & Détails {isDetailsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={isSyncing}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 1px 3px rgba(220, 38, 38, 0.25)',
                opacity: isSyncing ? 0.7 : 1
              }}
            >
              <RotateCcw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Synchronisation...' : 'Synchroniser tout'}
            </button>
          </div>
        </div>

        {/* PANNEAU D'ARBITRAGE GRANULAIRE */}
        {isDetailsOpen && (
          <div style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed #fca5a5',
            fontSize: '0.8rem'
          }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#7f1d1d' }}>
              Arbitrage des contrats manquants pour {formattedMonth} :
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {displayedMissingSections.map(sec => (
                <div key={sec.type} style={{ backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #fee2e2', padding: '0.6rem 0.85rem' }}>
                  <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                    {sec.title} ({sec.missingCount} manquant{sec.missingCount > 1 ? 's' : ''} — {sec.missingAmount.toFixed(2)} €)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {sec.missingItems.map(item => (
                      <div 
                        key={item.templateId} 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                          padding: '0.3rem 0.5rem',
                          backgroundColor: '#fef2f2',
                          borderRadius: '4px',
                          border: '1px solid #fecaca',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div>
                          <strong style={{ color: '#1e293b' }}>{item.label}</strong> — <span style={{ color: '#b91c1c', fontWeight: 600 }}>{item.amount.toFixed(2)} €</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '0.5rem' }}>
                            (Échéance le {item.recurrenceDay} du mois)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => handleRegenerateSingle(item.templateId, item.label)}
                            disabled={isSyncing}
                            style={{
                              backgroundColor: '#15803d',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                            title="Recréer immédiatement la transaction pour ce mois"
                          >
                            <RotateCcw size={11} /> Régénérer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptException(item.templateId, item.label)}
                            style={{
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                            title="Accepter l'absence de ce contrat pour ce mois sans bloquer le Watchdog"
                          >
                            <Check size={11} /> Accepter l'écart
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ÉCARTS DÉJÀ ACCEPTÉS */}
            {report.totalAccepted > 0 && (
              <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#065f46' }}>
                  Écarts acceptés sur ce mois ({report.totalAccepted}) :
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                  {[...fixedExpenses.acceptedItems, ...variableExpenses.acceptedItems, ...incomes.acceptedItems].map(acc => (
                    <span 
                      key={acc.templateId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        fontSize: '0.72rem',
                        fontWeight: 500
                      }}
                    >
                      {acc.label} ({acc.amount.toFixed(2)} €)
                      <button
                        type="button"
                        onClick={() => handleRevokeException(acc.templateId, acc.label)}
                        style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', padding: 0 }}
                        title="Révoquer l'acceptation de l'écart"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // CAS 2 : STATUT CONFORME (100% INTÈGRE OU ÉCARTS ARBITRÉS & ACCEPTÉS)
  return (
    <div 
      style={{
        backgroundColor: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        padding: '0.35rem 1.25rem',
        fontSize: '0.75rem',
        color: '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.6rem',
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <CheckCircle2 size={13} color="#16a34a" />
          <span>
            <strong style={{ color: '#334155' }}>Intégrité universelle :</strong> {formattedMonth} (100 % conforme
            {report.totalAccepted > 0 && `, ${report.totalAccepted} écart(s) accepté(s)`})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {renderSectionPill(fixedExpenses, 'fixed_expense')}
          {renderSectionPill(variableExpenses, 'variable_expense')}
          {renderSectionPill(incomes, 'income')}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {feedback && (
          <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>
            {feedback}
          </span>
        )}
        <button
          type="button"
          onClick={handleSyncAll}
          disabled={isSyncing}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            fontSize: '0.72rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px'
          }}
          title="Forcer la vérification et la synchronisation de l'horizon glissant (M-1 à M+12)"
        >
          <RotateCcw size={11} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Vérification...' : 'Vérifier horizon'}
        </button>
      </div>
    </div>
  );
};
