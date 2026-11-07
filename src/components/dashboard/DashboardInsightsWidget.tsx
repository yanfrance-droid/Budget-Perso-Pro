import React, { useState, useMemo } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  ArrowRight,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import {
  generateInsights,
  type FinancialInsight,
  type InsightsContext,
  type InsightSeverity
} from '../../engine/insightsEngine';

export interface DashboardInsightsWidgetProps {
  insights?: FinancialInsight[];
  context?: InsightsContext;
  onActionClick?: (target: string) => void;
  className?: string;
}

const SESSION_STORAGE_KEY = 'budget_dismissed_insights';

function getStoredDismissedIds(): string[] {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch {
    // Environnements sans sessionStorage
  }
  return [];
}

function storeDismissedId(id: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const current = getStoredDismissedIds();
      if (!current.includes(id)) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([...current, id]));
      }
    }
  } catch {
    // Environnements sans sessionStorage
  }
}

function clearStoredDismissedIds(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Environnements sans sessionStorage
  }
}

export function normalizeTarget(target?: string): string {
  if (!target) return '/';
  if (target === '/emprunts') return '/credits';
  if (target === '/depenses') return '/depenses-courantes';
  return target;
}

function ActionButton({
  target,
  actionLabel,
  onActionClick,
  insightId
}: {
  target?: string;
  actionLabel: string;
  onActionClick?: (target: string) => void;
  insightId: string;
}) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return (
      <RouterActionButton
        target={target}
        actionLabel={actionLabel}
        onActionClick={onActionClick}
        insightId={insightId}
      />
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!target) return;
    const normalized = normalizeTarget(target);
    if (onActionClick) onActionClick(normalized);
  };

  return (
    <button
      type="button"
      className="insight-action-btn"
      onClick={handleClick}
      data-testid={`action-btn-${insightId}`}
      data-target={normalizeTarget(target)}
    >
      <span>{actionLabel}</span>
      <ArrowRight size={14} />
    </button>
  );
}

function RouterActionButton({
  target,
  actionLabel,
  onActionClick,
  insightId
}: {
  target?: string;
  actionLabel: string;
  onActionClick?: (target: string) => void;
  insightId: string;
}) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!target) return;
    const normalized = normalizeTarget(target);
    if (onActionClick) onActionClick(normalized);
    navigate(normalized);
  };

  return (
    <button
      type="button"
      className="insight-action-btn"
      onClick={handleClick}
      data-testid={`action-btn-${insightId}`}
      data-target={normalizeTarget(target)}
    >
      <span>{actionLabel}</span>
      <ArrowRight size={14} />
    </button>
  );
}

const SEVERITY_META: Record<InsightSeverity, { label: string; icon: React.ReactElement }> = {
  critical: {
    label: 'Alerte critique',
    icon: <AlertOctagon size={14} />
  },
  warning: {
    label: 'Attention',
    icon: <AlertTriangle size={14} />
  },
  info: {
    label: 'Conseil',
    icon: <Info size={14} />
  },
  success: {
    label: 'Optimal',
    icon: <CheckCircle2 size={14} />
  }
};

export function DashboardInsightsWidget({
  insights,
  context,
  onActionClick,
  className
}: DashboardInsightsWidgetProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => getStoredDismissedIds());
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Calcul ou récupération des insights
  const allInsights = useMemo<FinancialInsight[]>(() => {
    if (insights) {
      return insights;
    }
    if (context) {
      return generateInsights(context);
    }
    return [];
  }, [insights, context]);

  // Filtrage des insights masqués par l'utilisateur
  const visibleInsights = useMemo(() => {
    return allInsights.filter(item => !dismissedIds.includes(item.id));
  }, [allInsights, dismissedIds]);

  // Masquage d'un insight
  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    storeDismissedId(id);
    setDismissedIds(prev => (prev.includes(id) ? prev : [...prev, id]));
  };

  // Réinitialisation des alertes masquées
  const handleResetDismissed = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearStoredDismissedIds();
    setDismissedIds([]);
  };

  // Aucun insight généré -> pas d'affichage
  if (allInsights.length === 0) {
    return null;
  }

  // Tous les insights ont été masqués
  if (visibleInsights.length === 0) {
    return (
      <section
        className={`dashboard-insights-section insights-all-dismissed ${className || ''}`}
        aria-label="Conseils et alertes budgétaires"
        data-testid="insights-widget-empty"
      >
        <div className="dashboard-insights-all-dismissed-banner">
          <span>Tous les conseils ont été temporairement masqués pour cette session.</span>
          <button
            type="button"
            className="insights-reset-dismissed-btn"
            onClick={handleResetDismissed}
            data-testid="reset-dismissed-btn"
          >
            <RotateCcw size={13} />
            <span>Réinitialiser les alertes masquées ({dismissedIds.length})</span>
          </button>
        </div>
      </section>
    );
  }

  // Affichage des 3 premiers par défaut, ou tous si déplié
  const displayedInsights = isExpanded || visibleInsights.length <= 3
    ? visibleInsights
    : visibleInsights.slice(0, 3);

  return (
    <section
      className={`dashboard-insights-section ${className || ''}`}
      aria-label="Conseils et alertes budgétaires"
      data-testid="dashboard-insights-widget"
    >
      {/* En-tête du widget */}
      <div className="dashboard-insights-header">
        <div className="dashboard-insights-title-group">
          <Sparkles size={18} className="insights-sparkles-icon" />
          <h3 className="dashboard-insights-title">Conseils & Anticipation</h3>
          <span className="insights-count-badge" data-testid="insights-count-badge">
            {visibleInsights.length} recommandation{visibleInsights.length > 1 ? 's' : ''}
          </span>
        </div>

        {dismissedIds.length > 0 && (
          <button
            type="button"
            className="insights-reset-dismissed-btn"
            onClick={handleResetDismissed}
            title="Réafficher les alertes masquées"
            data-testid="reset-dismissed-btn-header"
          >
            <RotateCcw size={13} />
            <span>Réafficher les conseils masqués ({dismissedIds.length})</span>
          </button>
        )}
      </div>

      {/* Grille de cartes */}
      <div className="dashboard-insights-grid" data-testid="insights-grid">
        {displayedInsights.map(item => {
          const meta = SEVERITY_META[item.severity];

          return (
            <div
              key={item.id}
              className={`dashboard-insight-card severity-${item.severity}`}
              data-testid={`insight-card-${item.id}`}
            >
              <div className="insight-card-top">
                <div className={`insight-badge badge-${item.severity}`}>
                  {meta.icon}
                  <span>{meta.label}</span>
                </div>
                <button
                  type="button"
                  className="insight-dismiss-btn"
                  onClick={e => handleDismiss(item.id, e)}
                  title="Masquer ce conseil"
                  aria-label="Masquer ce conseil"
                  data-testid={`dismiss-${item.id}`}
                >
                  <X size={15} />
                </button>
              </div>

              <h4 className="insight-card-title">{item.title}</h4>
              <p className="insight-card-message">{item.message}</p>

              {item.actionLabel && item.actionTarget && (
                <div className="insight-card-footer">
                  <ActionButton
                    target={item.actionTarget}
                    actionLabel={item.actionLabel}
                    onActionClick={onActionClick}
                    insightId={item.id}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bouton de dépliage si plus de 3 insights */}
      {visibleInsights.length > 3 && (
        <div className="dashboard-insights-footer">
          <button
            type="button"
            className="insights-expand-btn"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-expanded={isExpanded}
            data-testid="expand-insights-btn"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={16} />
                <span>Réduire les conseils</span>
              </>
            ) : (
              <>
                <ChevronDown size={16} />
                <span>Voir tous les conseils ({visibleInsights.length})</span>
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

export default DashboardInsightsWidget;
