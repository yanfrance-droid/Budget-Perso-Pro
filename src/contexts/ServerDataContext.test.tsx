// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ServerDataProvider, useServerData } from './ServerDataContext';
import { apiClient } from '../services/apiClient';

let mockAuthIsAuthenticated = true;

// Mock useAuth to simulate an authenticated or unauthenticated user
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockAuthIsAuthenticated,
    isLoading: false,
    user: mockAuthIsAuthenticated ? { id: 'user-1', username: 'admin' } : null,
    token: mockAuthIsAuthenticated ? 'test-token' : null,
    login: vi.fn(),
    logout: vi.fn(),
    setup: vi.fn()
  })
}));

describe('ServerDataContext — Unification SQLite comme source unique', () => {
  const mockInitialAccounts = [
    { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 1000 }
  ];
  const mockInitialCategories = [
    { id: 'cat-1', name: 'Alimentation', type: 'daily', isArchived: false }
  ];
  const mockInitialTransactions = [
    { id: 'tx-1', label: 'Courses', amount: 50, type: 'daily', status: 'cleared', date: '2026-10-15', accountId: 'acc-1', categoryId: 'cat-1' }
  ];
  const mockInitialLoans = [
    { id: 'loan-1', name: 'Prêt Immo', initialAmount: 100000, currentPrincipal: 80000, monthlyPayment: 600, totalMonths: 240, remainingMonths: 180, isArchived: false, isPaused: false }
  ];
  const mockInitialTemplates = [
    { id: 'tmpl-1', label: 'Loyer', amount: 800, recurrenceDay: 5, accountId: 'acc-1', type: 'fixed_expense', startDate: '2026-01', isActive: true }
  ];
  const mockInitialSettings = {
    manualBalance: '1500',
    card1: '250',
    card2: '0'
  };

  beforeEach(() => {
    mockAuthIsAuthenticated = true;
    vi.clearAllMocks();

    // Default successful API mocks
    vi.spyOn(apiClient.accounts, 'getAll').mockResolvedValue([...mockInitialAccounts]);
    vi.spyOn(apiClient.categories, 'getAll').mockResolvedValue([...mockInitialCategories]);
    vi.spyOn(apiClient.transactions, 'get').mockResolvedValue([...mockInitialTransactions]);
    vi.spyOn(apiClient.loans, 'getAll').mockResolvedValue([...mockInitialLoans]);
    vi.spyOn(apiClient.recurrence, 'getAll').mockResolvedValue([...mockInitialTemplates]);
    vi.spyOn(apiClient.incomePayers, 'getAll').mockResolvedValue([]);
    vi.spyOn(apiClient.settings, 'get').mockResolvedValue({ ...mockInitialSettings });

    vi.spyOn(apiClient.incomePayers, 'save').mockImplementation(async (p) => ({ ...p, id: p.id || 'payer-new' } as any));
    vi.spyOn(apiClient.incomePayers, 'delete').mockResolvedValue({ success: true });

    vi.spyOn(apiClient.accounts, 'save').mockImplementation(async (acc) => ({ ...acc, id: acc.id || 'acc-new' } as any));
    vi.spyOn(apiClient.accounts, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(apiClient.categories, 'save').mockImplementation(async (cat) => ({ ...cat, id: cat.id || 'cat-new' } as any));
    vi.spyOn(apiClient.categories, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(apiClient.transactions, 'save').mockImplementation(async (tx) => ({ ...tx, id: tx.id || 'tx-new' } as any));
    vi.spyOn(apiClient.transactions, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(apiClient.transactions, 'restore').mockImplementation(async (id) => ({
      success: true,
      transaction: { id, label: 'Courses', amount: 50, type: 'daily', status: 'cleared', date: '2026-10-15', accountId: 'acc-1', deleted_at: null } as any
    }));
    vi.spyOn(apiClient.transactions, 'updateStatus').mockImplementation(async (id, status) => {
      const found = mockInitialTransactions.find(t => t.id === id) || { id, status };
      return { ...found, status } as any;
    });
    vi.spyOn(apiClient.loans, 'save').mockImplementation(async (loan) => ({ ...loan, id: loan.id || 'loan-new' } as any));
    vi.spyOn(apiClient.loans, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(apiClient.loans, 'updatePaymentStatus').mockImplementation(async (paymentId, status) => ({
      payment: { id: paymentId, status } as any,
      loan: { id: 'loan-1', currentPrincipal: 79400 } as any
    }));
    vi.spyOn(apiClient.recurrence, 'save').mockImplementation(async (tmpl) => ({ ...tmpl, id: tmpl.id || 'tmpl-new' } as any));
    vi.spyOn(apiClient.recurrence, 'delete').mockResolvedValue({ success: true });
    vi.spyOn(apiClient.recurrence, 'generate').mockResolvedValue({ generated: 1 });
    vi.spyOn(apiClient.settings, 'save').mockResolvedValue({ success: true });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServerDataProvider>{children}</ServerDataProvider>
  );

  it('1. Charge les données initiales exclusivement depuis le serveur SQLite via apiClient', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0].name).toBe('Compte Courant');
    expect(result.current.categories[0].name).toBe('Alimentation');
    expect(result.current.transactions[0].label).toBe('Courses');
    expect(result.current.loans[0].name).toBe('Prêt Immo');
    expect(result.current.recurrenceTemplates[0].label).toBe('Loyer');
    expect(result.current.dashboardSettings.manualBalance).toBe('1500');
  });

  it('2. Création et suppression de compte : route exclusivement vers le serveur SQLite', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Création
    await act(async () => {
      await result.current.saveAccount({ name: 'Livret A', type: 'savings', initialBalance: 500 });
    });

    expect(apiClient.accounts.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Livret A' }));
    expect(result.current.accounts.some(a => a.name === 'Livret A')).toBe(true);

    // Suppression
    await act(async () => {
      await result.current.deleteAccount('acc-1');
    });

    expect(apiClient.accounts.delete).toHaveBeenCalledWith('acc-1');
    expect(result.current.accounts.some(a => a.id === 'acc-1')).toBe(false);
  });

  it('3. Mise à jour du statut d\'une transaction : écrit sur le serveur SQLite', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.updateTransactionStatus('tx-1', 'pending');
    });

    expect(apiClient.transactions.updateStatus).toHaveBeenCalledWith('tx-1', 'pending');
    const updated = result.current.transactions.find(t => t.id === 'tx-1');
    expect(updated?.status).toBe('pending');
  });

  it('4. Pointage de mensualité de crédit : écrit sur le serveur SQLite et met à jour le capital restant', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.updateLoanPaymentStatus('pay-1', 'cleared');
    });

    expect(apiClient.loans.updatePaymentStatus).toHaveBeenCalledWith('pay-1', 'cleared');
  });

  it('5. Suppression des replis silencieux : en cas d\'échec de requête serveur, affiche clairement l\'erreur et ne replie pas vers Dexie', async () => {
    // Simuler une coupure réseau ou une panne serveur
    vi.spyOn(apiClient.accounts, 'getAll').mockRejectedValue(new Error('Erreur réseau 500 : Serveur SQLite indisponible'));

    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // L'erreur doit être clairement exposée
    expect(result.current.error).toBe('Erreur réseau 500 : Serveur SQLite indisponible');
    expect(result.current.isLoading).toBe(false);
    // Les comptes ne doivent pas être silencieusement remplis avec d'anciennes données Dexie
    expect(result.current.accounts).toHaveLength(0);
  });

  it('6. Rejet des écritures feintes : en cas d\'échec d\'écriture sur le serveur, une exception est levée et non masquée', async () => {
    vi.spyOn(apiClient.transactions, 'save').mockRejectedValue(new Error('Échec d\'écriture SQLite'));

    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // L'écriture doit lever une exception pour que l'interface puisse alerter l'utilisateur
    await expect(
      result.current.saveTransaction({ label: 'Test Dépense', amount: 100 })
    ).rejects.toThrow('Échec d\'écriture SQLite');
  });

  it('7. Sauvegarde des paramètres du tableau de bord sur le serveur SQLite', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.saveDashboardSettings({ manualBalance: '2000', card1: '500' });
    });

    expect(apiClient.settings.save).toHaveBeenCalledWith(expect.objectContaining({
      manualBalance: '2000',
      card1: '500'
    }));
    expect(result.current.dashboardSettings.manualBalance).toBe('2000');
    expect(result.current.dashboardSettings.card1).toBe('500');
  });

  it('8. Empêche tout appel à apiClient.settings.save tant que l\'utilisateur n\'est pas authentifié', async () => {
    mockAuthIsAuthenticated = false;

    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.saveDashboardSettings({ manualBalance: '3000', card1: '100' });
    });

    // Aucun appel réseau ne doit être parti vers le backend
    expect(apiClient.settings.save).not.toHaveBeenCalled();
    // Les paramètres ne sont pas modifiés
    expect(result.current.dashboardSettings.manualBalance).toBe('0');
  });

  it('9. Suppression avec Soft-Delete et Restauration Undo (Toast & refresh)', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.transactions).toHaveLength(1);

    // Suppression
    await act(async () => {
      await result.current.deleteTransaction('tx-1');
    });

    expect(apiClient.transactions.delete).toHaveBeenCalledWith('tx-1');
    expect(result.current.transactions).toHaveLength(0);

    // Restauration Undo
    await act(async () => {
      await result.current.restoreTransaction('tx-1');
    });

    expect(apiClient.transactions.restore).toHaveBeenCalledWith('tx-1');
  });
});
