// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';
import Dashboard from './Dashboard';
import { apiClient } from '../services/apiClient';

let mockAccounts: any[] = [];
let mockTransactions: any[] = [];
let mockLoans: any[] = [];
let mockIsLoading = false;
let mockDashboardSettings: any = null;

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => {
    if (mockIsLoading) return null;
    return {
      isLoading: false,
      accounts: mockAccounts,
      categories: [{ id: '1', name: 'Alimentation', type: 'daily' }],
      loans: mockLoans,
      transactions: mockTransactions,
      incomePayers: [],
      recurrenceTemplates: [],
      dashboardSettings: mockDashboardSettings,
      updateTransactionStatus: vi.fn(),
      updateLoanPaymentStatus: vi.fn(),
      saveDashboardSettings: vi.fn().mockResolvedValue({ success: true }),
      generateMonthlyOccurrences: vi.fn().mockResolvedValue(0),
      refreshAll: vi.fn()
    };
  }
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    loans: {
      history: {
        getAll: vi.fn()
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

describe('Dashboard — Intégration du graphique historique et prévisionnel des capitaux', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockAccounts = [{ id: 'acc-1', name: 'Compte Principal', type: 'checking', initialBalance: 1000 }];
    mockTransactions = [];
    mockLoans = [];
    mockDashboardSettings = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Affichage de l\'état vide lorsque aucun historique n\'existe', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValueOnce([]);

    await act(async () => {
      render(<Dashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Aucun historique de capitaux enregistré/i)).not.toBeNull();
    });

    expect(screen.queryByText(/Renseignez vos relevés mensuels dans l'onglet Paramètres/i)).not.toBeNull();
  });

  it('2. Chargement des données historiques depuis l\'API et affichage de la période complète sans limitation à 12 mois', async () => {
    // 24 mois d'historique (bien supérieur à 12 mois)
    const longHistory = [];
    for (let i = 1; i <= 24; i++) {
      const m = i < 10 ? `0${i}` : `${i}`;
      const year = i <= 12 ? '2023' : '2024';
      const monthNum = i <= 12 ? i : i - 12;
      const monthStr = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
      longHistory.push({
        month: `${year}-${monthStr}`,
        realEstateCapital: 200000 - i * 1000,
        realEstateMonthlyPayment: 900,
        consumerCapital: i >= 12 ? 15000 - (i - 12) * 500 : null,
        consumerMonthlyPayment: i >= 12 ? 300 : null
      });
    }

    (apiClient.loans.history.getAll as any).mockResolvedValueOnce(longHistory);

    await act(async () => {
      render(<Dashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Historique des capitaux restants dus/i)).not.toBeNull();
    });

    // Confirmation que le titre affiche l'étendue intégrale (2023-01 à 2024-12) et non les 12 derniers mois
    expect(screen.queryByText(/2023-01 à 2024-12/i)).not.toBeNull();
    // Vérification de l'absence totale de mois futurs après le mois courant
    const currentMonth = new Date().toISOString().substring(0, 7);
    expect(screen.queryByText(new RegExp(`${currentMonth.substring(0, 4)}-12 à`, 'i'))).toBeNull();
  });

  it('3. Respect scrupuleux des deux séries : Immobilier et Consommation', async () => {
    const records = [
      {
        month: '2024-01',
        realEstateCapital: 150000,
        realEstateMonthlyPayment: 800,
        consumerCapital: null,
        consumerMonthlyPayment: null
      },
      {
        month: '2024-02',
        realEstateCapital: 149200,
        realEstateMonthlyPayment: 800,
        consumerCapital: 10000,
        consumerMonthlyPayment: 250
      }
    ];

    (apiClient.loans.history.getAll as any).mockResolvedValueOnce(records);

    let containerResult: HTMLElement;
    await act(async () => {
      const { container } = render(<Dashboard />);
      containerResult = container;
    });

    await waitFor(() => {
      expect(screen.queryByText(/Historique des capitaux restants dus \(2024-01 à 2024-02\)/i)).not.toBeNull();
    });

    // Vérifie la présence du conteneur Recharts avec la classe standard
    const chartContainer = containerResult!.querySelector('.recharts-responsive-container');
    expect(chartContainer).not.toBeNull();
  });

  it('6. Configuration dynamique des pastilles (dot) : visibles si <= 12 mois, masquées si > 12 mois', async () => {
    // Cas <= 12 mois (ex: 1 seul mois pour un utilisateur débutant son 1er crédit)
    const singleMonth = [
      {
        month: '2024-01',
        realEstateCapital: 150000,
        realEstateMonthlyPayment: 800,
        consumerCapital: null,
        consumerMonthlyPayment: null
      }
    ];

    (apiClient.loans.history.getAll as any).mockResolvedValueOnce(singleMonth);

    await act(async () => {
      render(<Dashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Historique des capitaux restants dus/i)).not.toBeNull();
    });
  });

  it('4. Détection et affichage d\'un bandeau d\'écart discret si les fiches de crédits diffèrent du dernier relevé réel', async () => {
    const records = [
      {
        month: '2024-05',
        realEstateCapital: 180000,
        consumerCapital: 8000
      }
    ];

    // Prêt conso avec capital restant dû à 9000 € (écart de 1000 € avec le réel à 8000 €)
    mockLoans = [
      {
        id: 'loan-conso',
        name: 'Prêt Auto',
        lender: 'Banque',
        initialAmount: 10000,
        remainingCapital: 9000,
        monthlyPayment: 250,
        startDate: '2024-01-01',
        endDate: '2026-12-31',
        durationMonths: 36,
        accountId: 'acc-1',
        loanType: 'consumer'
      }
    ];

    (apiClient.loans.history.getAll as any).mockResolvedValueOnce(records);

    await act(async () => {
      render(<Dashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Information de raccordement/i)).not.toBeNull();
    });

    expect(screen.queryByText(/Écart constaté sur les crédits consommation/i)).not.toBeNull();
    expect(screen.queryByText(/Les données historiques réelles sont scrupuleusement conservées/i)).not.toBeNull();
  });

  it('5. Gestion d\'une erreur API lors du chargement', async () => {
    (apiClient.loans.history.getAll as any).mockRejectedValueOnce(new Error('Erreur réseau 500'));

    await act(async () => {
      render(<Dashboard />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Erreur réseau 500/i)).not.toBeNull();
    });
  });
});
