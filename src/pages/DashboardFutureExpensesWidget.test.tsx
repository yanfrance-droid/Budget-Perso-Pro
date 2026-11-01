// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import Dashboard from './Dashboard';
import { apiClient } from '../services/apiClient';
import type { Transaction } from '../db/database';
import { getLocalTodayString } from './FutureExpenses';

let mockAccounts: any[] = [];
let mockTransactions: Transaction[] = [];
let mockLoans: any[] = [];
let mockIsLoading = false;
let mockDashboardSettings: any = null;

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => {
    if (mockIsLoading) return null;
    return {
      isLoading: false,
      accounts: mockAccounts,
      categories: [{ id: 'cat-1', name: 'Alimentation', type: 'daily' }],
      loans: mockLoans,
      transactions: mockTransactions,
      incomePayers: [],
      recurrenceTemplates: [],
      dashboardSettings: mockDashboardSettings,
      updateTransactionStatus: vi.fn(),
      updateLoanPaymentStatus: vi.fn(),
      saveDashboardSettings: vi.fn().mockResolvedValue({ success: true }),
      refreshAll: vi.fn()
    };
  }
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    loans: {
      history: {
        getAll: vi.fn().mockResolvedValue([])
      }
    }
  }
}));

// Mock ResizeObserver for Recharts
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Dashboard — Widget « Dépenses futures »', () => {
  const today = getLocalTodayString();
  const [currYearStr, currMonthStr] = today.split('-');
  const currYear = parseInt(currYearStr, 10);
  const currMonth = parseInt(currMonthStr, 10);

  // Mois dynamique futur et mois dynamique passé
  const nextMonthKey = currMonth === 12 
    ? `${currYear + 1}-01` 
    : `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;

  const inTwoMonthsKey = currMonth >= 11
    ? `${currYear + 1}-${String(currMonth + 2 - 12).padStart(2, '0')}`
    : `${currYear}-${String(currMonth + 2).padStart(2, '0')}`;

  const pastDate1 = '2026-08-10';
  const pastDate2 = '2026-09-20';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockAccounts = [{ id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 2000 }];
    mockTransactions = [];
    mockLoans = [];
    mockDashboardSettings = null;
  });

  afterEach(() => {
    cleanup();
  });

  const renderDashboard = () => {
    return render(<Dashboard />);
  };

  it('1. Affiche l\'état vide et le lien de navigation lorsqu\'aucune dépense future n\'existe', () => {
    mockTransactions = [];
    renderDashboard();

    const widget = screen.getByTestId('future-expenses-dashboard-widget');
    expect(widget).toBeDefined();

    // Titre sans total général dans l'en-tête
    expect(within(widget).getByText('Dépenses futures')).toBeDefined();
    // Lien de navigation
    const link = within(widget).getByRole('link', { name: /Voir toutes les dépenses futures/i });
    expect(link.getAttribute('href')).toBe('/depenses-futures');

    // Message d'état vide discret
    expect(within(widget).getByText('Aucune dépense future programmée')).toBeDefined();
    expect(within(widget).getByText(/Vos prochaines dépenses ponctuelles planifiées apparaîtront ici/i)).toBeDefined();
  });

  it('2. Classe les dépenses en retard avant les dépenses à venir et respecte le tri chronologique', () => {
    mockTransactions = [
      // Dépense future proche
      {
        id: 'tx-fut-1',
        date: `${nextMonthKey}-15`,
        expectedDate: `${nextMonthKey}-15`,
        label: 'Entretien chaudière',
        amount: 140,
        status: 'planned',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense future plus lointaine
      {
        id: 'tx-fut-2',
        date: `${inTwoMonthsKey}-25`,
        expectedDate: `${inTwoMonthsKey}-25`,
        label: 'Pneus hiver',
        amount: 320,
        status: 'pending',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense en retard ancienne
      {
        id: 'tx-retard-old',
        date: pastDate1,
        expectedDate: pastDate1,
        label: 'Contrôle technique en retard',
        amount: 85,
        status: 'planned',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense en retard plus récente
      {
        id: 'tx-retard-recent',
        date: pastDate2,
        expectedDate: pastDate2,
        label: 'Facture eau en retard',
        amount: 110,
        status: 'pending',
        type: 'daily',
        accountId: 'acc-1'
      }
    ];

    renderDashboard();

    const widget = screen.getByTestId('future-expenses-dashboard-widget');
    const rows = within(widget).getAllByRole('row');
    // rows[0] est le <thead>, les lignes suivantes sont les 4 opérations
    expect(rows.length).toBe(5);

    // Ordre attendu :
    // 1. tx-retard-old (pastDate1)
    // 2. tx-retard-recent (pastDate2)
    // 3. tx-fut-1 (nextMonthKey-15)
    // 4. tx-fut-2 (inTwoMonthsKey-25)
    expect(within(rows[1]).getByText('Contrôle technique en retard')).toBeDefined();
    expect(within(rows[1]).getByText(/⚠️ Date dépassée/)).toBeDefined();

    expect(within(rows[2]).getByText('Facture eau en retard')).toBeDefined();
    expect(within(rows[2]).getByText(/⚠️ Date dépassée/)).toBeDefined();

    expect(within(rows[3]).getByText('Entretien chaudière')).toBeDefined();
    expect(within(rows[3]).getByText('Prévu')).toBeDefined();

    expect(within(rows[4]).getByText('Pneus hiver')).toBeDefined();
    expect(within(rows[4]).getByText('En attente')).toBeDefined();
  });

  it('3. Limite strictement l\'affichage à un maximum de cinq opérations prioritaires', () => {
    // 4 dépenses en retard + 4 dépenses futures = 8 opérations éligibles
    mockTransactions = [
      { id: 'ret-1', date: '2026-07-01', expectedDate: '2026-07-01', label: 'Retard 1', amount: 10, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'ret-2', date: '2026-08-01', expectedDate: '2026-08-01', label: 'Retard 2', amount: 20, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'ret-3', date: '2026-09-01', expectedDate: '2026-09-01', label: 'Retard 3', amount: 30, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'ret-4', date: '2026-10-01', expectedDate: '2026-10-01', label: 'Retard 4', amount: 40, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'fut-1', date: `${nextMonthKey}-05`, expectedDate: `${nextMonthKey}-05`, label: 'Future 1', amount: 50, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'fut-2', date: `${nextMonthKey}-10`, expectedDate: `${nextMonthKey}-10`, label: 'Future 2 (exclue du top 5)', amount: 60, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'fut-3', date: `${nextMonthKey}-20`, expectedDate: `${nextMonthKey}-20`, label: 'Future 3 (exclue du top 5)', amount: 70, status: 'planned', type: 'daily', accountId: 'acc-1' },
      { id: 'fut-4', date: `${inTwoMonthsKey}-01`, expectedDate: `${inTwoMonthsKey}-01`, label: 'Future 4 (exclue du top 5)', amount: 80, status: 'planned', type: 'daily', accountId: 'acc-1' },
    ];

    renderDashboard();

    const widget = screen.getByTestId('future-expenses-dashboard-widget');
    const rows = within(widget).getAllByRole('row');
    // 1 ligne d'en-tête + exactement 5 lignes de données
    expect(rows.length).toBe(6);

    // Les 5 affichées sont les 4 retards + le 1er futur
    expect(within(widget).getByText('Retard 1')).toBeDefined();
    expect(within(widget).getByText('Retard 2')).toBeDefined();
    expect(within(widget).getByText('Retard 3')).toBeDefined();
    expect(within(widget).getByText('Retard 4')).toBeDefined();
    expect(within(widget).getByText('Future 1')).toBeDefined();

    // Les autres sont exclues de l'affichage
    expect(within(widget).queryByText('Future 2 (exclue du top 5)')).toBeNull();
    expect(within(widget).queryByText('Future 3 (exclue du top 5)')).toBeNull();
    expect(within(widget).queryByText('Future 4 (exclue du top 5)')).toBeNull();
  });

  it('4. Exclut formellement les opérations non éligibles (ordinaires passées, soldées, récurrentes, charges fixes)', () => {
    mockTransactions = [
      // Dépense passée ordinaire sans expectedDate -> EXCLUE
      {
        id: 'tx-past-ord',
        date: '2026-09-15',
        label: 'Courses passées sans expectedDate',
        amount: 65,
        status: 'pending',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense future soldée (cleared) -> EXCLUE
      {
        id: 'tx-cleared',
        date: `${nextMonthKey}-10`,
        expectedDate: `${nextMonthKey}-10`,
        label: 'Dépense déjà payée',
        amount: 90,
        status: 'cleared',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense future désactivée (disabled) -> EXCLUE
      {
        id: 'tx-disabled',
        date: `${nextMonthKey}-10`,
        expectedDate: `${nextMonthKey}-10`,
        label: 'Dépense annulée',
        amount: 120,
        status: 'disabled',
        type: 'daily',
        accountId: 'acc-1'
      },
      // Dépense récurrente (templateId) -> EXCLUE
      {
        id: 'tx-rec',
        date: `${nextMonthKey}-10`,
        label: 'Loyer mensuel récurrent',
        amount: 800,
        status: 'planned',
        type: 'daily',
        accountId: 'acc-1',
        templateId: 'tmpl-1'
      },
      // Charge fixe -> EXCLUE
      {
        id: 'tx-fixed',
        date: `${nextMonthKey}-05`,
        label: 'Facture Box Internet',
        amount: 40,
        status: 'planned',
        type: 'fixed_expense',
        accountId: 'acc-1'
      },
      // Dépense future éligible valide
      {
        id: 'tx-valid',
        date: `${nextMonthKey}-12`,
        expectedDate: `${nextMonthKey}-12`,
        label: 'Seule dépense valide',
        amount: 250,
        status: 'planned',
        type: 'daily',
        accountId: 'acc-1'
      }
    ];

    renderDashboard();

    const widget = screen.getByTestId('future-expenses-dashboard-widget');

    // Seule l'opération valide doit apparaître
    expect(within(widget).getByText('Seule dépense valide')).toBeDefined();

    expect(within(widget).queryByText('Courses passées sans expectedDate')).toBeNull();
    expect(within(widget).queryByText('Dépense déjà payée')).toBeNull();
    expect(within(widget).queryByText('Dépense annulée')).toBeNull();
    expect(within(widget).queryByText('Loyer mensuel récurrent')).toBeNull();
    expect(within(widget).queryByText('Facture Box Internet')).toBeNull();
  });

  it('5. Fait disparaître immédiatement une dépense du widget lorsqu\'elle passe au statut cleared', () => {
    mockTransactions = [
      {
        id: 'tx-to-clear',
        date: `${nextMonthKey}-08`,
        expectedDate: `${nextMonthKey}-08`,
        label: 'Régularisation assurance',
        amount: 130,
        status: 'planned',
        type: 'daily',
        accountId: 'acc-1'
      }
    ];

    const { rerender } = renderDashboard();

    const widget = screen.getByTestId('future-expenses-dashboard-widget');
    expect(within(widget).getByText('Régularisation assurance')).toBeDefined();

    // Passer au statut cleared (simule le pointage depuis l'interface ou une autre vue)
    mockTransactions = [
      {
        id: 'tx-to-clear',
        date: `${nextMonthKey}-08`,
        expectedDate: `${nextMonthKey}-08`,
        label: 'Régularisation assurance',
        amount: 130,
        status: 'cleared',
        type: 'daily',
        accountId: 'acc-1'
      }
    ];

    rerender(<Dashboard />);

    // L'opération a disparu et le widget repasse à l'état vide
    expect(within(widget).queryByText('Régularisation assurance')).toBeNull();
    expect(within(widget).getByText('Aucune dépense future programmée')).toBeDefined();
  });
});
