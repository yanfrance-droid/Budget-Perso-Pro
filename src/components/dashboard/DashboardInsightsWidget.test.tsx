// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardInsightsWidget, normalizeTarget } from './DashboardInsightsWidget';
import type { FinancialInsight, InsightsContext } from '../../engine/insightsEngine';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const mockInsights: FinancialInsight[] = [
  {
    id: 'insight-crit-1',
    category: 'crash_test',
    severity: 'critical',
    title: 'Risque de découvert imminent',
    message: 'Votre solde bancaire risque de plonger à -250,00 € le 12/11.',
    actionLabel: 'Voir le Dashboard',
    actionTarget: '/'
  },
  {
    id: 'insight-warn-1',
    category: 'daily_cadence',
    severity: 'warning',
    title: 'Surconsommation du rythme quotidien',
    message: 'Votre rythme sur les dépenses courantes dépasse de 30 % la moyenne.',
    actionLabel: 'Ajuster les dépenses',
    actionTarget: '/depenses'
  },
  {
    id: 'insight-warn-2',
    category: 'stalled_health',
    severity: 'warning',
    title: 'Remboursements santé en souffrance',
    message: '120,00 € de frais de santé attendent un remboursement depuis 40 jours.',
    actionLabel: 'Suivre les remboursements',
    actionTarget: '/sante'
  },
  {
    id: 'insight-info-1',
    category: 'loan_prepayment',
    severity: 'info',
    title: 'Arbitrage de crédit avantageux',
    message: 'Un remboursement anticipé de 500 € vous ferait économiser 85 € d’intérêts.',
    actionLabel: 'Simuler le prêt',
    actionTarget: '/emprunts'
  },
  {
    id: 'insight-succ-1',
    category: 'emergency_fund',
    severity: 'success',
    title: 'Matelas de sécurité optimal',
    message: 'Votre épargne liquide couvre 4,5 mois de charges incompressibles.',
    actionLabel: 'Voir mon épargne',
    actionTarget: '/epargne'
  }
];

describe('DashboardInsightsWidget Component', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('ne rend rien (null) si la liste des insights est vide', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={[]} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('affiche par défaut uniquement les 3 insights les plus prioritaires (top 3)', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights} />
      </MemoryRouter>
    );

    // Badge de compteur global
    expect(screen.getByTestId('insights-count-badge').textContent).toContain('5 recommandations');

    // Les 3 premiers doivent être visibles
    expect(screen.getByText('Risque de découvert imminent')).toBeDefined();
    expect(screen.getByText('Surconsommation du rythme quotidien')).toBeDefined();
    expect(screen.getByText('Remboursements santé en souffrance')).toBeDefined();

    // Les 4e et 5e ne doivent pas être visibles par défaut
    expect(screen.queryByText('Arbitrage de crédit avantageux')).toBeNull();
    expect(screen.queryByText('Matelas de sécurité optimal')).toBeNull();

    // Pastilles de sévérité correspondantes
    expect(screen.getByText('Alerte critique')).toBeDefined();
    expect(screen.getAllByText('Attention').length).toBe(2);
  });

  it('déplie tous les insights au clic sur "Voir tous les conseils (X)" puis replie au second clic', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights} />
      </MemoryRouter>
    );

    const expandBtn = screen.getByTestId('expand-insights-btn');
    expect(expandBtn.textContent).toContain('Voir tous les conseils (5)');

    // Clic pour déplier
    fireEvent.click(expandBtn);

    // Les 5 insights sont désormais affichés
    expect(screen.getByText('Risque de découvert imminent')).toBeDefined();
    expect(screen.getByText('Surconsommation du rythme quotidien')).toBeDefined();
    expect(screen.getByText('Remboursements santé en souffrance')).toBeDefined();
    expect(screen.getByText('Arbitrage de crédit avantageux')).toBeDefined();
    expect(screen.getByText('Matelas de sécurité optimal')).toBeDefined();
    expect(expandBtn.textContent).toContain('Réduire les conseils');

    // Clic pour replier
    fireEvent.click(expandBtn);
    expect(expandBtn.textContent).toContain('Voir tous les conseils (5)');
    expect(screen.queryByText('Arbitrage de crédit avantageux')).toBeNull();
    expect(screen.queryByText('Matelas de sécurité optimal')).toBeNull();
  });

  it('ne propose pas de bouton de dépliage si le nombre d’insights est <= 3', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights.slice(0, 3)} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('expand-insights-btn')).toBeNull();
  });

  it('permet de masquer temporairement un conseil (dismiss) et le persiste en sessionStorage', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights} />
      </MemoryRouter>
    );

    // On masque la première alerte
    const dismissBtn = screen.getByTestId('dismiss-insight-crit-1');
    fireEvent.click(dismissBtn);

    // L’alerte critique doit disparaître immédiatement du DOM
    expect(screen.queryByText('Risque de découvert imminent')).toBeNull();

    // Le compteur passe à 4
    expect(screen.getByTestId('insights-count-badge').textContent).toContain('4 recommandations');

    // Le 4e insight ("Arbitrage de crédit avantageux") remonte dans le top 3 visible
    expect(screen.getByText('Arbitrage de crédit avantageux')).toBeDefined();

    // Vérification de la persistance en sessionStorage
    const stored = JSON.parse(window.sessionStorage.getItem('budget_dismissed_insights') || '[]');
    expect(stored).toContain('insight-crit-1');
  });

  it('permet de réafficher les alertes masquées via le bouton de réinitialisation', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights} />
      </MemoryRouter>
    );

    // Masquage d'un élément
    fireEvent.click(screen.getByTestId('dismiss-insight-crit-1'));
    expect(screen.queryByText('Risque de découvert imminent')).toBeNull();

    // Le bouton de réinitialisation apparaît dans l'en-tête
    const resetHeaderBtn = screen.getByTestId('reset-dismissed-btn-header');
    expect(resetHeaderBtn.textContent).toContain('Réafficher les conseils masqués (1)');

    // Clic sur réafficher
    fireEvent.click(resetHeaderBtn);

    // L’élément masqué réapparaît
    expect(screen.getByText('Risque de découvert imminent')).toBeDefined();
    expect(window.sessionStorage.getItem('budget_dismissed_insights')).toBeNull();
  });

  it('affiche un bandeau d’information avec réinitialisation si tous les conseils ont été masqués', () => {
    render(
      <MemoryRouter>
        <DashboardInsightsWidget insights={mockInsights.slice(0, 2)} />
      </MemoryRouter>
    );

    // Masquage des 2 insights
    fireEvent.click(screen.getByTestId('dismiss-insight-crit-1'));
    fireEvent.click(screen.getByTestId('dismiss-insight-warn-1'));

    // Le widget affiche le bandeau de masquage global
    expect(screen.getByTestId('insights-widget-empty')).toBeDefined();
    expect(screen.getByText(/Tous les conseils ont été temporairement masqués/i)).toBeDefined();

    // Clic pour réinitialiser
    const resetBtn = screen.getByTestId('reset-dismissed-btn');
    fireEvent.click(resetBtn);

    // Les insights reviennent
    expect(screen.getByText('Risque de découvert imminent')).toBeDefined();
    expect(screen.getByText('Surconsommation du rythme quotidien')).toBeDefined();
  });

  it('déclenche l’action directe avec normalisation des routes (/depenses -> /depenses-courantes, /emprunts -> /credits)', () => {
    const handleActionClick = vi.fn();

    render(
      <MemoryRouter>
        <DashboardInsightsWidget
          insights={[
            {
              id: 'test-depenses',
              category: 'daily_cadence',
              severity: 'warning',
              title: 'Dépenses',
              message: 'Trop de dépenses',
              actionLabel: 'Gérer les dépenses',
              actionTarget: '/depenses'
            },
            {
              id: 'test-credits',
              category: 'loan_prepayment',
              severity: 'info',
              title: 'Crédits',
              message: 'Arbitrage prêt',
              actionLabel: 'Ouvrir les crédits',
              actionTarget: '/emprunts'
            }
          ]}
          onActionClick={handleActionClick}
        />
      </MemoryRouter>
    );

    // Clic sur action dépenses
    const depensesBtn = screen.getByTestId('action-btn-test-depenses');
    fireEvent.click(depensesBtn);
    expect(handleActionClick).toHaveBeenCalledWith('/depenses-courantes');

    // Clic sur action crédits
    const creditsBtn = screen.getByTestId('action-btn-test-credits');
    fireEvent.click(creditsBtn);
    expect(handleActionClick).toHaveBeenCalledWith('/credits');
  });

  it('génère et affiche correctement les insights à partir de la prop context (sans insights statiques)', () => {
    const context: InsightsContext = {
      currentDate: '2026-11-15',
      manualBalance: -150,
      soldePrevisionnel: -150,
      pendingTransactions: [],
      liquidSavingsTotal: 500,
      totalObligatoires: 1200
    };

    render(
      <MemoryRouter>
        <DashboardInsightsWidget context={context} />
      </MemoryRouter>
    );

    // Doit avoir généré le crash test critique (solde négatif) et l’alerte matelas de précaution critique (< 1 mois)
    expect(screen.getByText(/Compte bancaire actuellement à découvert/i)).toBeDefined();
    expect(screen.getByText(/Matelas de précaution critique/i)).toBeDefined();
    expect(screen.getByTestId('insights-count-badge').textContent).toContain('2 recommandations');
  });

  it('fonctionne en dehors d’un contexte React Router sans lever d’exception', () => {
    const handleActionClick = vi.fn();

    const { container } = render(
      <DashboardInsightsWidget
        insights={[
          {
            id: 'test-no-router',
            category: 'idle_cash',
            severity: 'info',
            title: 'Épargne disponible',
            message: 'Excédent de 200 €.',
            actionLabel: 'Verser sur livret',
            actionTarget: '/epargne'
          }
        ]}
        onActionClick={handleActionClick}
      />
    );

    expect(screen.getByText('Épargne disponible')).toBeDefined();
    const actionBtn = screen.getByTestId('action-btn-test-no-router');
    fireEvent.click(actionBtn);
    expect(handleActionClick).toHaveBeenCalledWith('/epargne');
  });

  it('normalizeTarget gère les alias et les valeurs indéfinies', () => {
    expect(normalizeTarget(undefined)).toBe('/');
    expect(normalizeTarget('')).toBe('/');
    expect(normalizeTarget('/emprunts')).toBe('/credits');
    expect(normalizeTarget('/depenses')).toBe('/depenses-courantes');
    expect(normalizeTarget('/sante')).toBe('/sante');
    expect(normalizeTarget('/epargne')).toBe('/epargne');
  });
});
