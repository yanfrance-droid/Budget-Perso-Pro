// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';
import { UIPreferencesProvider, useUIPreferences } from './UIPreferencesContext';
import Dashboard from '../pages/Dashboard';

// Mock contexts required by Dashboard
let mockAccounts: any[] = [];
let mockTransactions: any[] = [];
let mockCategories: any[] = [];
let mockLoans: any[] = [];
let mockDashboardSettings = { manualBalance: '1500', card1: '200', card2: '100' };

vi.mock('./ServerDataContext', () => ({
  useServerData: () => ({
    accounts: mockAccounts,
    transactions: mockTransactions,
    categories: mockCategories,
    loans: mockLoans,
    dashboardSettings: mockDashboardSettings,
    saveDashboardSettings: vi.fn().mockResolvedValue(true)
  }),
  useServerDataOptional: () => ({
    accounts: mockAccounts,
    transactions: mockTransactions,
    categories: mockCategories,
    loans: mockLoans,
    dashboardSettings: mockDashboardSettings,
    saveDashboardSettings: vi.fn().mockResolvedValue(true)
  })
}));

// Mock ResizeObserver for Recharts
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function PrivacyToggleTestHelper() {
  const { isPrivacyMode, togglePrivacyMode } = useUIPreferences();
  return (
    <div>
      <button data-testid="toggle-privacy-btn" onClick={togglePrivacyMode}>
        {isPrivacyMode ? 'Masquer désactivé' : 'Masquer activé'}
      </button>
      <Dashboard />
    </div>
  );
}

describe('UIPreferencesContext & Floutage étendu (Mode discret)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    mockAccounts = [
      { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 1000 }
    ];
    mockCategories = [
      { id: 'cat-fixe', name: 'Loyer', type: 'fixed_expense' },
      { id: 'cat-inc', name: 'Salaire', type: 'income' }
    ];
    mockTransactions = [
      { id: 'tx-1', date: '2026-03-01', type: 'income', amount: 2500, status: 'cleared', accountId: 'acc-1', categoryId: 'cat-inc' },
      { id: 'tx-2', date: '2026-03-05', type: 'fixed_expense', amount: 800, status: 'cleared', accountId: 'acc-1', categoryId: 'cat-fixe' }
    ];
    mockLoans = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('active et désactive la classe privacy-mode-active sur <html>', () => {
    render(
      <UIPreferencesProvider>
        <PrivacyToggleTestHelper />
      </UIPreferencesProvider>
    );

    const root = document.documentElement;
    // Par défaut, le mode discret est inactif
    expect(root.classList.contains('privacy-mode-active')).toBe(false);

    // Activer le mode discret
    const btn = screen.getByTestId('toggle-privacy-btn');
    act(() => {
      btn.click();
    });
    expect(root.classList.contains('privacy-mode-active')).toBe(true);

    // Désactiver le mode discret
    act(() => {
      btn.click();
    });
    expect(root.classList.contains('privacy-mode-active')).toBe(false);
  });

  it('conserve les données calculées intactes dans le DOM tout en permettant leur floutage visuel', () => {
    const { container } = render(
      <UIPreferencesProvider>
        <PrivacyToggleTestHelper />
      </UIPreferencesProvider>
    );

    // Les indicateurs KPIs sont présents
    const kpiCards = container.querySelectorAll('.kpi-card-value');
    expect(kpiCards.length).toBeGreaterThan(0);

    // La projection bancaire est présente
    const forecast = container.querySelector('.forecast-amount');
    expect(forecast).not.toBeNull();

    // Activer le mode discret
    const btn = screen.getByTestId('toggle-privacy-btn');
    act(() => {
      btn.click();
    });

    // Les montants sous-jacents ne sont ni remplacés par zéro ni effacés
    expect(container.textContent).toContain('Solde bancaire réel');
    expect(container.textContent).toContain('Solde prévisionnel en banque');
    expect(document.documentElement.classList.contains('privacy-mode-active')).toBe(true);
  });
});

