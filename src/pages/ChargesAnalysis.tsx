import React, { useState, useMemo } from 'react';
import { 
  SlidersHorizontal, 
  FileText, 
  PieChart, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  Search, 
  RotateCcw,
  ShieldAlert,
  Percent,
  Calendar,
  Layers,
  Sparkles,
  Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ComposedChart,
  Cell
} from 'recharts';
import { useServerDataOptional } from '../contexts/ServerDataContext';
import { getCurrentMonth } from '../utils/dateUtils';
import { 
  analyzeCharges, 
  type AnalysisHorizon, 
  formatMonthLongFr 
} from '../engine/chargesAnalysisEngine';
import { roundCurrency } from '../engine/calculations';

const formatCurrency = (val: number): string => {
  const normalized = roundCurrency(val);
  return `${normalized.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
};

export default function ChargesAnalysis() {
  const serverData = useServerDataOptional();

  const currentSysMonth = useMemo(() => getCurrentMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentSysMonth);
  const [horizon, setHorizon] = useState<AnalysisHorizon>(12);
  const [activeTab, setActiveTab] = useState<'fixed' | 'variable'>('fixed');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const transactions = serverData?.transactions || [];
  const templates = serverData?.recurrenceTemplates || [];
  const categories = serverData?.categories || [];

  // Exécution du moteur d'analyse pure en mémoire
  const analysisResult = useMemo(() => {
    return analyzeCharges({
      transactions,
      templates,
      categories,
      referenceMonth: selectedMonth,
      horizon
    });
  }, [transactions, templates, categories, selectedMonth, horizon]);

  if (!serverData || serverData.isLoading) {
    return (
      <div className="p-4" style={{ textAlign: 'center', color: '#64748b' }}>
        Chargement de l'analyse des charges...
      </div>
    );
  }

  // Filtrage par texte de recherche
  const filteredFixedContracts = analysisResult.fixedContracts.filter(c => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.categoryName && c.categoryName.toLowerCase().includes(q));
  });

  const filteredVariableEnvelopes = analysisResult.variableEnvelopes.filter(e => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || (e.categoryName && e.categoryName.toLowerCase().includes(q));
  });

  const effortBadgeColor = analysisResult.currentEffortRate <= 35
    ? '#15803d'
    : (analysisResult.currentEffortRate <= 50 ? '#b45309' : '#dc2626');
  const effortBadgeBg = analysisResult.currentEffortRate <= 35
    ? '#dcfce7'
    : (analysisResult.currentEffortRate <= 50 ? '#fef3c7' : '#fee2e2');

  return (
    <div className="charges-analysis-container" data-testid="charges-analysis-page">
      {/* 1. En-tête & Contrôles */}
      <div className="charges-analysis-header">
        <div className="charges-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <SlidersHorizontal size={24} color="#4f46e5" />
            <h1 className="charges-title">Analyse des Charges</h1>
          </div>
          <p className="charges-subtitle">
            Pilotage des contrats incompressibles et suivi budgétaire des enveloppes dédiées sur {formatMonthLongFr(selectedMonth)}
          </p>
        </div>

        <div className="charges-controls-group">
          {/* Sélecteur de mois de référence */}
          <div className="charges-control-item">
            <label htmlFor="charges-month-select" className="charges-control-label">
              <Calendar size={14} /> Mois de référence
            </label>
            <input
              id="charges-month-select"
              type="month"
              className="charges-month-input"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              data-testid="charges-month-select"
            />
          </div>

          {/* Sélecteur d'horizon temporel (6M / 12M) */}
          <div className="charges-control-item">
            <span className="charges-control-label">Horizon glissant</span>
            <div className="horizon-toggle-group">
              <button
                type="button"
                className={`horizon-btn ${horizon === 6 ? 'active' : ''}`}
                onClick={() => setHorizon(6)}
                data-testid="horizon-6"
              >
                6 mois
              </button>
              <button
                type="button"
                className={`horizon-btn ${horizon === 12 ? 'active' : ''}`}
                onClick={() => setHorizon(12)}
                data-testid="horizon-12"
              >
                12 mois
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Navigation par double sous-onglet */}
      <div className="charges-tabs-nav">
        <button
          type="button"
          className={`charges-tab-btn ${activeTab === 'fixed' ? 'active' : ''}`}
          onClick={() => setActiveTab('fixed')}
          data-testid="tab-fixed"
        >
          <FileText size={17} />
          <span>Charges Fixes (Contrats)</span>
          {analysisResult.tariffIncreases.length > 0 && (
            <span className="tab-alert-badge" title="Hausses tarifaires détectées">
              {analysisResult.tariffIncreases.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`charges-tab-btn ${activeTab === 'variable' ? 'active' : ''}`}
          onClick={() => setActiveTab('variable')}
          data-testid="tab-variable"
        >
          <Layers size={17} />
          <span>Charges Variables (Enveloppes)</span>
          {analysisResult.underEstimatedEnvelopesCount > 0 && (
            <span className="tab-warning-badge" title="Enveloppes sous-évaluées">
              {analysisResult.underEstimatedEnvelopesCount}
            </span>
          )}
        </button>
      </div>

      {/* 3. Volet Charges Fixes (Contrats incompressibles) */}
      {activeTab === 'fixed' && (
        <div className="charges-tab-content" data-testid="fixed-charges-tab-content">
          {/* Cartes KPI Fixes */}
          <div className="charges-kpis-grid">
            <div className="kpi-card kpi-blue">
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Total Fixe ({formatMonthLongFr(selectedMonth)})</h3>
                <div className="kpi-card-icon"><FileText size={18} /></div>
              </div>
              <div className="kpi-card-value">{formatCurrency(analysisResult.currentTotalFixed)}</div>
              <p className="kpi-card-subtext">{analysisResult.fixedContracts.length} contrat(s) actif(s)</p>
            </div>

            <div className="kpi-card">
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Taux d'effort fixe réel</h3>
                <div className="kpi-card-icon" style={{ background: effortBadgeBg, color: effortBadgeColor }}>
                  <Percent size={18} />
                </div>
              </div>
              <div className="kpi-card-value" style={{ color: effortBadgeColor }}>
                {analysisResult.currentEffortRate.toFixed(1)} %
              </div>
              <p className="kpi-card-subtext">
                Sur {formatCurrency(analysisResult.currentRealIncomes)} de rentrées réelles
              </p>
            </div>

            <div className={`kpi-card ${analysisResult.tariffIncreases.length > 0 ? 'kpi-orange' : 'kpi-indigo'}`}>
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Hausses tarifaires M vs M-1</h3>
                <div className="kpi-card-icon">
                  {analysisResult.tariffIncreases.length > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                </div>
              </div>
              <div className="kpi-card-value">
                {analysisResult.tariffIncreases.length > 0 
                  ? `${analysisResult.tariffIncreases.length} détectée${analysisResult.tariffIncreases.length > 1 ? 's' : ''}` 
                  : '0 hausse'}
              </div>
              <p className="kpi-card-subtext">
                {analysisResult.tariffIncreases.length > 0 
                  ? 'Contrats en augmentation de tarif' 
                  : 'Tous les tarifs sont stables'}
              </p>
            </div>

            <div className="kpi-card kpi-indigo">
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Taux d'effort moyen ({horizon} mois)</h3>
                <div className="kpi-card-icon"><TrendingUp size={18} /></div>
              </div>
              <div className="kpi-card-value">{analysisResult.averageEffortRate.toFixed(1)} %</div>
              <p className="kpi-card-subtext">Moyenne historique constatée</p>
            </div>
          </div>

          {/* Bandeau d'alerte spécifique aux préavis d'engagement / fin de promo */}
          {analysisResult.fixedContracts.some(c => c.commitmentStatus === 'notice_window') && (
            <div className="tariff-increase-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', marginBottom: '1rem' }} data-testid="commitment-notice-banner">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Clock size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: '#b45309', fontSize: '0.95rem', fontWeight: 700 }}>
                    Fenêtre de préavis ouverte — Contrats fixes arrivant à échéance
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#92400e', fontSize: '0.85rem' }}>
                    {analysisResult.fixedContracts.filter(c => c.commitmentStatus === 'notice_window').map(c => (
                      <li key={c.id} style={{ marginBottom: '0.25rem' }}>
                        <strong>{c.name}</strong> : engagement jusqu'au {c.commitmentEndDate}. <strong>À résilier avant le {c.noticeDeadline}</strong> ({c.noticePeriodDays} j de préavis){c.postPromoAnnualCost && c.postPromoAnnualCost > 0 ? ` pour éviter une hausse de +${formatCurrency(c.postPromoAnnualCost)}/an (passage à ${formatCurrency(c.priceAfterPromo || 0)}/mois)` : ''}.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Bandeau d'alerte spécifique aux hausses de tarifs */}
          {analysisResult.tariffIncreases.length > 0 && (
            <div className="tariff-increase-banner" data-testid="tariff-increase-banner">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <ShieldAlert size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: '#991b1b', fontSize: '0.95rem', fontWeight: 700 }}>
                    {analysisResult.tariffIncreases.length} hausse{analysisResult.tariffIncreases.length > 1 ? 's' : ''} tarifaire{analysisResult.tariffIncreases.length > 1 ? 's' : ''} constatée{analysisResult.tariffIncreases.length > 1 ? 's' : ''} ce mois-ci
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#7f1d1d', fontSize: '0.85rem' }}>
                    {analysisResult.tariffIncreases.map(inc => (
                      <li key={inc.contractId} style={{ marginBottom: '0.25rem' }}>
                        <strong>{inc.contractName}</strong> : +{inc.increaseAmount.toFixed(2)} €/mois (+{inc.increasePercentage.toFixed(1)} %) — de {formatCurrency(inc.previousAmount)} à {formatCurrency(inc.newAmount)} (impact : <strong>+{formatCurrency(inc.annualImpact)}/an</strong>).
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Graphique Recharts Fixes : Total Fixes & Taux d'Effort */}
          <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
            <div className="dashboard-panel-header">
              <h3 className="dashboard-panel-title">
                <TrendingUp size={18} color="#2563eb" />
                Évolution temporelle des charges fixes & Taux d'effort ({horizon} mois)
              </h3>
            </div>
            <div style={{ width: '100%', height: 320, marginTop: '0.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analysisResult.fixedMonthlySeries} margin={{ top: 15, right: 30, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color, #e2e8f0)" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: 'var(--text-muted, #64748b)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: 'var(--text-muted, #64748b)' }} unit=" €" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#b45309' }} unit=" %" domain={[0, 100]} />
                  <Tooltip 
                    formatter={(value: any, name: any) => {
                      if (name === "Taux d'effort") return [`${Number(value).toFixed(1)} %`, name];
                      return [formatCurrency(Number(value) || 0), name];
                    }}
                    labelFormatter={(label) => `Mois : ${label}`}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar yAxisId="left" dataKey="totalFixed" name="Charges Fixes totales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="effortRate" name="Taux d'effort" stroke="#ea580c" strokeWidth={2.5} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tableau comparatif détaillé des contrats fixes */}
          <div className="dashboard-panel">
            <div className="table-filter-bar">
              <div className="table-search-box">
                <Search size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Rechercher un contrat ou une catégorie..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="table-search-input"
                  data-testid="charges-search-input"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
              <span className="results-count">
                {filteredFixedContracts.length} contrat{filteredFixedContracts.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="dashboard-table-container">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Contrat / Abonnement</th>
                    <th>Catégorie</th>
                    <th className="text-right">Mois M ({formatMonthLongFr(selectedMonth)})</th>
                    <th className="text-right">Mois M-1 ({formatMonthLongFr(analysisResult.previousMonth)})</th>
                    <th className="text-right">Écart M vs M-1</th>
                    <th className="text-right">Moyenne {horizon}M</th>
                    <th>Statut / Dérive</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFixedContracts.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        Aucun contrat fixe trouvé pour cette période.
                      </td>
                    </tr>
                  ) : (
                    filteredFixedContracts.map(c => (
                      <tr key={c.id} style={{ background: c.hasIncreased ? 'rgba(254, 242, 242, 0.4)' : undefined }}>
                        <td style={{ fontWeight: 600 }}>
                          <span>{c.name}</span>
                          {c.commitmentStatus === 'notice_window' && (
                            <span
                              className="badge-notice-window"
                              style={{
                                marginLeft: '0.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: '#fee2e2',
                                color: '#b91c1c',
                                border: '1px solid #f87171',
                                borderRadius: '4px',
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.72rem',
                                fontWeight: 600
                              }}
                              title={`Préavis à envoyer avant le ${c.noticeDeadline}`}
                            >
                              ⚠️ À résilier avant le {c.noticeDeadline}{c.postPromoAnnualCost && c.postPromoAnnualCost > 0 ? ` (+${c.postPromoAnnualCost} €/an)` : ''}
                            </span>
                          )}
                          {c.commitmentStatus === 'active' && (
                            <span
                              className="badge-active-commitment"
                              style={{
                                marginLeft: '0.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #86efac',
                                borderRadius: '4px',
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.72rem',
                                fontWeight: 500
                              }}
                              title={`Sous engagement jusqu'au ${c.commitmentEndDate}`}
                            >
                              Fin de promo le {c.commitmentEndDate}
                            </span>
                          )}
                          {c.commitmentStatus === 'expired_post_promo' && (
                            <span
                              className="badge-expired-commitment"
                              style={{
                                marginLeft: '0.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                padding: '0.15rem 0.45rem',
                                fontSize: '0.72rem',
                                fontWeight: 500
                              }}
                            >
                              Post-promo
                            </span>
                          )}
                        </td>
                        <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{c.categoryName}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(c.currentAmount)}</td>
                        <td className="text-right" style={{ color: '#64748b' }}>{formatCurrency(c.previousAmount)}</td>
                        <td className="text-right" style={{ 
                          color: c.diffMvsM1 > 0 ? '#dc2626' : (c.diffMvsM1 < 0 ? '#16a34a' : 'inherit'),
                          fontWeight: c.diffMvsM1 !== 0 ? 600 : 'normal'
                        }}>
                          {c.diffMvsM1 > 0 ? `+${formatCurrency(c.diffMvsM1)} (+${c.diffPercentageMvsM1.toFixed(1)} %)` : 
                            (c.diffMvsM1 < 0 ? `${formatCurrency(c.diffMvsM1)} (${c.diffPercentageMvsM1.toFixed(1)} %)` : '0,00 €')}
                        </td>
                        <td className="text-right" style={{ color: '#475569' }}>{formatCurrency(c.averageAmount)}</td>
                        <td>
                          {c.hasIncreased ? (
                            <span className="badge badge-critical" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <ArrowUpRight size={13} />
                              Hausse (+{formatCurrency(c.annualizedImpact)}/an)
                            </span>
                          ) : (
                            c.diffMvsM1 < 0 ? (
                              <span className="badge badge-cleared" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <ArrowDownRight size={13} />
                                Baisse tarifaire
                              </span>
                            ) : (
                              <span className="badge badge-cleared">Tarif stable</span>
                            )
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Volet Charges Variables (Enveloppes) */}
      {activeTab === 'variable' && (
        <div className="charges-tab-content" data-testid="variable-charges-tab-content">
          {/* Cartes KPI Variables */}
          <div className="charges-kpis-grid">
            <div className="kpi-card kpi-orange">
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Réel Consommé ({formatMonthLongFr(selectedMonth)})</h3>
                <div className="kpi-card-icon"><PieChart size={18} /></div>
              </div>
              <div className="kpi-card-value">{formatCurrency(analysisResult.totalVariableConsumedCurrent)}</div>
              <p className="kpi-card-subtext">Sur {formatCurrency(analysisResult.totalVariableAllocatedCurrent)} alloués</p>
            </div>

            <div className={`kpi-card ${analysisResult.totalVariableVarianceCurrent > 0 ? 'kpi-orange' : 'kpi-blue'}`}>
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Écart Net Prévisionnel vs Réel</h3>
                <div className="kpi-card-icon">
                  {analysisResult.totalVariableVarianceCurrent > 0 ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                </div>
              </div>
              <div className="kpi-card-value" style={{ color: analysisResult.totalVariableVarianceCurrent > 0 ? '#c2410c' : '#15803d' }}>
                {analysisResult.totalVariableVarianceCurrent > 0 ? `+${formatCurrency(analysisResult.totalVariableVarianceCurrent)}` : formatCurrency(analysisResult.totalVariableVarianceCurrent)}
              </div>
              <p className="kpi-card-subtext">
                {analysisResult.totalVariableVarianceCurrent > 0 ? 'Dépassement du budget prévu' : 'Budget global respecté'}
              </p>
            </div>

            <div className={`kpi-card ${analysisResult.underEstimatedEnvelopesCount > 0 ? 'kpi-amber' : 'kpi-indigo'}`}>
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Enveloppes sous-évaluées (&gt;15 % sur 3m)</h3>
                <div className="kpi-card-icon"><ShieldAlert size={18} /></div>
              </div>
              <div className="kpi-card-value">
                {analysisResult.underEstimatedEnvelopesCount > 0 
                  ? `${analysisResult.underEstimatedEnvelopesCount} à réajuster` 
                  : '0 alerte'}
              </div>
              <p className="kpi-card-subtext">
                {analysisResult.underEstimatedEnvelopesCount > 0 ? 'Dépassement récurrent constaté' : 'Aucune dérive structurelle'}
              </p>
            </div>

            <div className="kpi-card kpi-indigo">
              <div className="kpi-card-header">
                <h3 className="kpi-card-title">Enveloppes actives</h3>
                <div className="kpi-card-icon"><Layers size={18} /></div>
              </div>
              <div className="kpi-card-value">{analysisResult.variableEnvelopes.length}</div>
              <p className="kpi-card-subtext">Postes de dépenses suivis</p>
            </div>
          </div>

          {/* Bandeau d'alerte pour enveloppes sous-évaluées */}
          {analysisResult.underEstimatedEnvelopesCount > 0 && (
            <div className="tariff-increase-banner" style={{ background: '#fffbeb', borderColor: '#fcd34d' }} data-testid="underestimated-alert-banner">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <AlertTriangle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ margin: '0 0 0.35rem 0', color: '#92400e', fontSize: '0.95rem', fontWeight: 700 }}>
                    {analysisResult.underEstimatedEnvelopesCount} enveloppe{analysisResult.underEstimatedEnvelopesCount > 1 ? 's' : ''} structurellement sous-évaluée{analysisResult.underEstimatedEnvelopesCount > 1 ? 's' : ''}
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#78350f', fontSize: '0.85rem' }}>
                    {analysisResult.variableEnvelopes.filter(e => e.isUnderEstimated).map(env => (
                      <li key={env.id} style={{ marginBottom: '0.25rem' }}>
                        <strong>{env.name}</strong> : dépassement moyen de +{formatCurrency(env.averageDrift)} sur 3 mois consécutifs ({env.underEstimatedMonths.join(', ')}). Budget mensuel recommandé : <strong>{formatCurrency(env.recommendedBudget)}</strong> (actuellement {formatCurrency(env.currentAllocated)}).
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Graphique Recharts Variables : Barres groupées Prévisionnel vs Réel */}
          <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
            <div className="dashboard-panel-header">
              <h3 className="dashboard-panel-title">
                <PieChart size={18} color="#d97706" />
                Comparatif Budget Prévisionnel vs Réel Consommé ({horizon} mois)
              </h3>
            </div>
            <div style={{ width: '100%', height: 320, marginTop: '0.5rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysisResult.variableMonthlySeries} margin={{ top: 15, right: 30, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color, #e2e8f0)" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: 'var(--text-muted, #64748b)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted, #64748b)' }} unit=" €" />
                  <Tooltip 
                    formatter={(value: any, name: any) => [formatCurrency(Number(value) || 0), name]}
                    labelFormatter={(label) => `Mois : ${label}`}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="totalAllocated" name="Budget alloué (prévu)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="totalConsumed" name="Réel consommé (débité)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tableau comparatif des enveloppes variables */}
          <div className="dashboard-panel">
            <div className="table-filter-bar">
              <div className="table-search-box">
                <Search size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Rechercher une enveloppe variable..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="table-search-input"
                  data-testid="charges-search-input-variable"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="search-clear-btn">
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
              <span className="results-count">
                {filteredVariableEnvelopes.length} enveloppe{filteredVariableEnvelopes.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="dashboard-table-container">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Enveloppe / Poste</th>
                    <th>Catégorie</th>
                    <th className="text-right">Budget Alloué</th>
                    <th className="text-right">Réel Consommé</th>
                    <th className="text-right">Écart Net</th>
                    <th className="text-right">Moyenne Réelle</th>
                    <th>Diagnostic / Dérive</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVariableEnvelopes.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        Aucune enveloppe variable trouvée pour cette période.
                      </td>
                    </tr>
                  ) : (
                    filteredVariableEnvelopes.map(env => (
                      <tr key={env.id} style={{ background: env.isUnderEstimated ? 'rgba(254, 243, 199, 0.35)' : undefined }}>
                        <td style={{ fontWeight: 600 }}>{env.name}</td>
                        <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{env.categoryName}</td>
                        <td className="text-right" style={{ color: '#475569' }}>{formatCurrency(env.currentAllocated)}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(env.currentConsumed)}</td>
                        <td className="text-right" style={{ 
                          color: env.currentVariance > 0 ? '#dc2626' : (env.currentVariance < 0 ? '#16a34a' : 'inherit'),
                          fontWeight: env.currentVariance !== 0 ? 600 : 'normal'
                        }}>
                          {env.currentVariance > 0 ? `+${formatCurrency(env.currentVariance)} (+${env.currentVarianceRate.toFixed(1)} %)` : 
                            (env.currentVariance < 0 ? `${formatCurrency(env.currentVariance)} (${env.currentVarianceRate.toFixed(1)} %)` : '0,00 €')}
                        </td>
                        <td className="text-right" style={{ color: '#475569' }}>{formatCurrency(env.averageConsumed)}</td>
                        <td>
                          {env.isUnderEstimated ? (
                            <span className="badge badge-warning" title={`Conseil : passer à ${formatCurrency(env.recommendedBudget)}`}>
                              Sous-évaluée (&gt;15 % sur 3m) ↗ {formatCurrency(env.recommendedBudget)}
                            </span>
                          ) : (
                            env.seasonalPeaks.length > 0 ? (
                              <span className="badge badge-pending">
                                Pic de saisonnalité ({env.seasonalPeaks.map(p => p.month).join(', ')})
                              </span>
                            ) : (
                              <span className="badge badge-cleared">Budget maîtrisé</span>
                            )
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
