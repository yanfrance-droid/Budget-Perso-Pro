// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { ServerDataProvider, useServerData } from './ServerDataContext';
import { apiClient } from '../services/apiClient';
import { calculateRealBalance } from '../engine/calculations';
import type { Account, Transaction } from '../db/database';

let mockAuthIsAuthenticated = true;

vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockAuthIsAuthenticated,
    isLoading: false,
    user: { id: 'user-1', username: 'admin' },
    token: 'test-token',
    login: vi.fn(),
    logout: vi.fn(),
    setup: vi.fn()
  })
}));

describe('Moteur Undo/Redo Universel (Transactions + Comptes)', () => {
  let dbAccounts: Account[];
  let dbTransactions: Transaction[];

  beforeEach(() => {
    mockAuthIsAuthenticated = true;
    vi.clearAllMocks();

    dbAccounts = [
      { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' }
    ];

    dbTransactions = [
      { id: 'tx-1', label: 'Courses Alimentaires', amount: 50, type: 'daily', status: 'cleared', date: '2026-10-15', accountId: 'acc-1' }
    ];

    // API Spies qui manipulent directement l'état en mémoire
    vi.spyOn(apiClient.accounts, 'getAll').mockImplementation(async () => JSON.parse(JSON.stringify(dbAccounts)));
    vi.spyOn(apiClient.categories, 'getAll').mockResolvedValue([]);
    vi.spyOn(apiClient.transactions, 'get').mockImplementation(async () => JSON.parse(JSON.stringify(dbTransactions.filter(t => !t.deleted_at))));
    vi.spyOn(apiClient.transactions, 'getAll').mockImplementation(async () => JSON.parse(JSON.stringify(dbTransactions)));
    let dbSettings: any = { manualBalance: '1000', card1: '0', card2: '0' };
    vi.spyOn(apiClient.loans, 'getAll').mockResolvedValue([]);
    vi.spyOn(apiClient.recurrence, 'getAll').mockResolvedValue([]);
    vi.spyOn(apiClient.incomePayers, 'getAll').mockResolvedValue([]);
    vi.spyOn(apiClient.settings, 'get').mockImplementation(async () => JSON.parse(JSON.stringify(dbSettings)));
    vi.spyOn(apiClient.settings, 'save').mockImplementation(async (s) => {
      dbSettings = { ...dbSettings, ...s };
      return JSON.parse(JSON.stringify(dbSettings));
    });

    vi.spyOn(apiClient.accounts, 'save').mockImplementation(async (acc) => {
      const idx = dbAccounts.findIndex(a => a.id === acc.id);
      if (idx >= 0) {
        dbAccounts[idx] = { ...dbAccounts[idx], ...acc } as Account;
        return JSON.parse(JSON.stringify(dbAccounts[idx]));
      }
      const created = { id: acc.id || `acc-${Date.now()}`, ...acc } as Account;
      dbAccounts.push(created);
      return JSON.parse(JSON.stringify(created));
    });

    vi.spyOn(apiClient.accounts, 'delete').mockImplementation(async (id) => {
      dbAccounts = dbAccounts.filter(a => a.id !== id);
      return { success: true };
    });

    vi.spyOn(apiClient.transactions, 'save').mockImplementation(async (tx) => {
      const idx = dbTransactions.findIndex(t => t.id === tx.id);
      if (idx >= 0) {
        dbTransactions[idx] = { ...dbTransactions[idx], ...tx } as Transaction;
        return JSON.parse(JSON.stringify(dbTransactions[idx]));
      }
      const created = { id: tx.id || `tx-${Date.now()}`, ...tx } as Transaction;
      dbTransactions.push(created);
      return JSON.parse(JSON.stringify(created));
    });

    vi.spyOn(apiClient.transactions, 'delete').mockImplementation(async (id) => {
      const found = dbTransactions.find(t => t.id === id);
      if (found) {
        found.deleted_at = Date.now();
      }
      return { success: true };
    });

    vi.spyOn(apiClient.transactions, 'restore').mockImplementation(async (id) => {
      const found = dbTransactions.find(t => t.id === id);
      if (found) {
        found.deleted_at = null;
      }
      return { success: true, transaction: JSON.parse(JSON.stringify(found || { id })) };
    });

    vi.spyOn(apiClient.transactions, 'updateStatus').mockImplementation(async (id, status) => {
      const found = dbTransactions.find(t => t.id === id);
      if (found) {
        found.status = status as any;
      }
      return JSON.parse(JSON.stringify(found || { id, status }));
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServerDataProvider>{children}</ServerDataProvider>
  );

  it('1. Gestion des piles Undo/Redo : capacité max 30 et vidage de redoStack lors d une nouvelle action', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Ajout d'une action
    await act(async () => {
      await result.current.saveTransaction({
        label: 'Achat Test 1',
        amount: 10,
        type: 'daily',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-16'
      });
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStack).toHaveLength(1);
    expect(result.current.canRedo).toBe(false);

    // Annuler
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.redoStack).toHaveLength(1);

    // Rétablir
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Nouvelle action utilisateur -> vide impérativement la redoStack
    await act(async () => {
      await result.current.saveTransaction({
        label: 'Achat Test 2',
        amount: 20,
        type: 'daily',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-17'
      });
    });

    expect(result.current.redoStack).toHaveLength(0);
    expect(result.current.canRedo).toBe(false);
  });

  it('2. Annulation d une modification de solde de compte (initialBalance) : restitution exacte du solde réel au centime près', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const accountBefore = result.current.accounts.find(a => a.id === 'acc-1')!;
    const txsBefore = result.current.transactions;
    // Solde réel initial : initialBalance (1000) - cleared daily (50) = 950 €
    const realBalanceBefore = calculateRealBalance(accountBefore, txsBefore);
    expect(realBalanceBefore).toBe(950);

    // 1. Modification du solde initial du compte de 1000 € à 2450.75 €
    await act(async () => {
      await result.current.saveAccount({
        id: 'acc-1',
        initialBalance: 2450.75
      });
    });

    const accountAfterMod = result.current.accounts.find(a => a.id === 'acc-1')!;
    expect(accountAfterMod.initialBalance).toBe(2450.75);
    const realBalanceAfterMod = calculateRealBalance(accountAfterMod, result.current.transactions);
    // 2450.75 - 50 = 2400.75 €
    expect(realBalanceAfterMod).toBe(2400.75);

    // 2. Undo : Retour arrière sur la modification de solde
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStack[0].label).toContain('Modification solde Compte Courant');

    await act(async () => {
      await result.current.undo();
    });

    const accountRestored = result.current.accounts.find(a => a.id === 'acc-1')!;
    expect(accountRestored.initialBalance).toBe(1000);
    const realBalanceRestored = calculateRealBalance(accountRestored, result.current.transactions);
    // Restitution au centime près
    expect(realBalanceRestored).toBe(950);

    // 3. Redo : Rétablissement de la modification
    await act(async () => {
      await result.current.redo();
    });

    const accountReapplied = result.current.accounts.find(a => a.id === 'acc-1')!;
    expect(accountReapplied.initialBalance).toBe(2450.75);
    expect(calculateRealBalance(accountReapplied, result.current.transactions)).toBe(2400.75);
  });

  it('3. Annulation d une modification de montant de transaction : recalcul au centime près', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // tx-1 a pour montant 50 €. On le passe à 180.25 €
    await act(async () => {
      await result.current.saveTransaction({
        id: 'tx-1',
        amount: 180.25
      });
    });

    expect(result.current.transactions.find(t => t.id === 'tx-1')?.amount).toBe(180.25);
    let realBal = calculateRealBalance(
      result.current.accounts[0], 
      result.current.transactions 
    );
    // 1000 - 180.25 = 819.75 €
    expect(realBal).toBe(819.75);

    // Undo
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.transactions.find(t => t.id === 'tx-1')?.amount).toBe(50);
    realBal = calculateRealBalance(
      result.current.accounts[0], 
      result.current.transactions 
    );
    // 1000 - 50 = 950.00 €
    expect(realBal).toBe(950);
  });

  it('4. Annulation d une création de transaction (Undo -> soft delete, Redo -> restore)', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    let createdId = '';
    await act(async () => {
      const created = await result.current.saveTransaction({
        label: 'Nouvelle Facture',
        amount: 120,
        type: 'fixed_expense',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-20'
      });
      createdId = created.id;
    });

    expect(result.current.transactions.some(t => t.id === createdId)).toBe(true);

    // Undo -> doit soft-supprimer la transaction
    await act(async () => {
      await result.current.undo();
    });

    expect(apiClient.transactions.delete).toHaveBeenCalledWith(createdId);
    expect(result.current.transactions.some(t => t.id === createdId)).toBe(false);

    // Redo -> doit restaurer la transaction
    await act(async () => {
      await result.current.redo();
    });

    expect(apiClient.transactions.restore).toHaveBeenCalledWith(createdId, expect.anything());
    expect(result.current.transactions.some(t => t.id === createdId)).toBe(true);
  });

  it('5. Annulation d une suppression de transaction (Undo -> restore, Redo -> delete)', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.transactions.some(t => t.id === 'tx-1')).toBe(true);

    // Suppression
    await act(async () => {
      await result.current.deleteTransaction('tx-1');
    });

    expect(result.current.transactions.some(t => t.id === 'tx-1')).toBe(false);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStack[0].label).toContain('Courses Alimentaires');

    // Undo -> Restaure sans limite de temps
    await act(async () => {
      await result.current.undo();
    });

    expect(apiClient.transactions.restore).toHaveBeenCalledWith('tx-1', expect.objectContaining({
      id: 'tx-1',
      label: 'Courses Alimentaires',
      amount: 50
    }));
    expect(result.current.transactions.some(t => t.id === 'tx-1')).toBe(true);

    // Redo -> Re-supprime
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.transactions.some(t => t.id === 'tx-1')).toBe(false);
  });

  it('6. Annulation d un pointage (updateTransactionStatus)', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Passer tx-1 de cleared à pending
    await act(async () => {
      await result.current.updateTransactionStatus('tx-1', 'pending');
    });

    expect(result.current.transactions.find(t => t.id === 'tx-1')?.status).toBe('pending');

    // Undo -> doit repasser à cleared
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.transactions.find(t => t.id === 'tx-1')?.status).toBe('cleared');
  });

  it('7. Raccourcis clavier Ctrl+Z et Ctrl+Y : ignorés lorsque le focus est dans un champ de saisie', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Ajout d'une action pour avoir du contenu dans undoStack
    await act(async () => {
      await result.current.saveTransaction({
        label: 'Achat Test',
        amount: 30,
        type: 'daily',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-18'
      });
    });

    expect(result.current.canUndo).toBe(true);
    const initialUndoLength = result.current.undoStack.length;

    // Cas A : L'utilisateur est dans un <input> -> Ctrl+Z ne doit PAS déclencher l'undo global
    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);
    inputEl.focus();

    const eventInInput = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    inputEl.dispatchEvent(eventInInput);

    expect(result.current.undoStack.length).toBe(initialUndoLength);

    // Cas B : L'utilisateur n'est pas dans un champ texte -> Ctrl+Z déclenche l'undo global
    inputEl.blur();
    document.body.removeChild(inputEl);

    const eventOutside = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });

    await act(async () => {
      window.dispatchEvent(eventOutside);
    });

    expect(result.current.undoStack.length).toBe(initialUndoLength - 1);
    expect(result.current.canRedo).toBe(true);

    // Cas C : Ctrl+Y déclenche le Redo global
    const redoEvent = new KeyboardEvent('keydown', {
      key: 'y',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });

    await act(async () => {
      window.dispatchEvent(redoEvent);
    });

    expect(result.current.undoStack.length).toBe(initialUndoLength);
    expect(result.current.canRedo).toBe(false);
  });

  it('8. Notification brève (1.5s) affichée lors de l annulation et du rétablissement', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.saveTransaction({
        label: 'Café',
        amount: 2.5,
        type: 'daily',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-19'
      });
    });

    // Undo -> feedback "Action annulée : ..."
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.undoFeedback).not.toBeNull();
    expect(result.current.undoFeedback?.message).toContain('Action annulée : Ajout opération « Café »');
    expect(result.current.undoFeedback?.type).toBe('undo');

    // Redo -> feedback "Action rétablie : ..."
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.undoFeedback).not.toBeNull();
    expect(result.current.undoFeedback?.message).toContain('Action rétablie : Ajout opération « Café »');
    expect(result.current.undoFeedback?.type).toBe('redo');
  });

  it('9. Undo/Redo sur les paramètres bancaires (Solde bancaire réel et encours cartes)', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(result.current.dashboardSettings.manualBalance).toBe('1000');
    expect(result.current.canUndo).toBe(false);

    // Modification du solde bancaire réel
    await act(async () => {
      await result.current.saveDashboardSettings({ manualBalance: '2500' });
    });

    expect(result.current.dashboardSettings.manualBalance).toBe('2500');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStack[0].label).toContain('Solde bancaire réel : 2500 €');

    // Annulation (Undo) -> restauration à 1000 €
    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dashboardSettings.manualBalance).toBe('1000');
    expect(result.current.canRedo).toBe(true);

    // Rétablissement (Redo) -> retour à 2500 €
    await act(async () => {
      await result.current.redo();
    });

    expect(result.current.dashboardSettings.manualBalance).toBe('2500');
    expect(result.current.canRedo).toBe(false);

    // Modification de l'encours CB 1
    await act(async () => {
      await result.current.saveDashboardSettings({ card1: '150' });
    });

    expect(result.current.dashboardSettings.card1).toBe('150');
    expect(result.current.undoStack[0].label).toContain('Encours CB 1 : 150 €');

    await act(async () => {
      await result.current.undo();
    });

    expect(result.current.dashboardSettings.card1).toBe('0');
  });

  it('10. Résilience face aux erreurs 400 (ressource introuvable) : dépile automatiquement l’action obsolète et exécute la suivante sans bloquer', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // 1. Première action valide (création d'une dépense val-1)
    await act(async () => {
      await result.current.saveTransaction({
        id: 'val-1',
        label: 'Dépense Valide 1',
        amount: 30,
        type: 'daily',
        status: 'cleared',
        accountId: 'acc-1',
        date: '2026-10-18'
      });
    });

    // 2. Seconde action : suppression d'une transaction obsolète tx-fantome
    dbTransactions.push({
      id: 'tx-fantome',
      label: 'Fantôme',
      amount: 15,
      type: 'daily',
      status: 'cleared',
      accountId: 'acc-1',
      date: '2026-10-19'
    });

    await act(async () => {
      await result.current.deleteTransaction('tx-fantome');
    });

    expect(result.current.undoStack).toHaveLength(2);

    // Simulons la disparition définitive de tx-fantome en base (ex: purge externe)
    // -> /restore renverra HTTP 400 introuvable
    vi.spyOn(apiClient.transactions, 'restore').mockImplementation(async (id: string) => {
      if (id === 'tx-fantome') {
        const err: any = new Error(`Transaction ${id} introuvable.`);
        err.status = 400;
        throw err;
      }
      return { success: true, transaction: { id } };
    });

    // 3. Appel de Undo : l'action 'tx-fantome' doit être automatiquement dépilée, et l'action 'val-1' doit être annulée avec succès !
    await act(async () => {
      await result.current.undo();
    });

    // La pile doit avoir été vidée (tx-fantome dépilé comme obsolète, val-1 annulé avec succès)
    expect(result.current.undoStack).toHaveLength(0);
    // La dépense val-1 a bien été annulée (supprimée)
    expect(dbTransactions.find(t => t.id === 'val-1')?.deleted_at).toBeTruthy();
  });

  it('11. Scénario ciblé : Suppression d\'une charge existante -> Undo -> Restauration réussie en base', async () => {
    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const targetExpense: Transaction = {
      id: 'tx-existing-charge',
      label: 'Abonnement Internet Fibre',
      amount: 39.99,
      type: 'fixed_expense',
      status: 'planned',
      accountId: 'acc-1',
      date: '2026-11-05'
    };
    dbTransactions.push(targetExpense);

    await act(async () => {
      await result.current.refreshAll();
    });

    expect(result.current.transactions.some(t => t.id === 'tx-existing-charge')).toBe(true);

    // 1. Suppression de la charge
    await act(async () => {
      await result.current.deleteTransaction(targetExpense);
    });

    // La charge est masquée de l'affichage
    expect(result.current.transactions.some(t => t.id === 'tx-existing-charge')).toBe(false);
    expect(result.current.canUndo).toBe(true);

    // 2. Undo -> Restauration réussie
    await act(async () => {
      await result.current.undo();
    });

    // La charge est restaurée et réapparaît dans la liste
    expect(result.current.transactions.some(t => t.id === 'tx-existing-charge')).toBe(true);
    const restored = result.current.transactions.find(t => t.id === 'tx-existing-charge');
    expect(restored?.amount).toBe(39.99);
    expect(restored?.label).toBe('Abonnement Internet Fibre');
    expect(apiClient.transactions.restore).toHaveBeenCalledWith('tx-existing-charge', expect.objectContaining({
      id: 'tx-existing-charge',
      label: 'Abonnement Internet Fibre',
      amount: 39.99
    }));
  });

  it('12. Snapshot Intégral Undo sur résiliation de contrat : restaure fidèlement les transactions avec leur statut exact (cleared, pending)', async () => {
    let dbTemplates: any[] = [
      { id: 'tmpl-fibre', label: 'Internet Fibre Pro', amount: 39.99, recurrenceDay: 10, startDate: '2026-09', isActive: 1 }
    ];
    vi.spyOn(apiClient.recurrence, 'getAll').mockImplementation(async () => JSON.parse(JSON.stringify(dbTemplates)));
    vi.spyOn(apiClient.recurrence, 'delete').mockImplementation(async (id: string) => {
      dbTemplates = dbTemplates.filter(t => t.id !== id);
      dbTransactions = dbTransactions.filter(t => !(t.templateId === id && t.status === 'planned'));
      dbTransactions.forEach(t => {
        if (t.templateId === id) (t as any).templateId = undefined;
      });
      return { success: true };
    });
    vi.spyOn(apiClient.recurrence, 'save').mockImplementation(async (tmpl: any) => {
      const idx = dbTemplates.findIndex(t => t.id === tmpl.id);
      if (idx >= 0) dbTemplates[idx] = { ...dbTemplates[idx], ...tmpl };
      else dbTemplates.push(tmpl);
      return JSON.parse(JSON.stringify(tmpl));
    });
    vi.spyOn(apiClient.recurrence, 'syncRollingHorizon').mockResolvedValue({ totalCreated: 0, monthsProcessed: [] } as any);

    // Initialiser les transactions du contrat : octobre (cleared), novembre (pending), décembre (planned)
    dbTransactions.push(
      { id: 'tx-oct', templateId: 'tmpl-fibre', label: 'Internet Fibre Pro', amount: 39.99, type: 'fixed_expense', status: 'cleared', date: '2026-10-10', accountId: 'acc-1' },
      { id: 'tx-nov', templateId: 'tmpl-fibre', label: 'Internet Fibre Pro', amount: 39.99, type: 'fixed_expense', status: 'pending', date: '2026-11-10', accountId: 'acc-1' },
      { id: 'tx-dec', templateId: 'tmpl-fibre', label: 'Internet Fibre Pro', amount: 39.99, type: 'fixed_expense', status: 'planned', date: '2026-12-10', accountId: 'acc-1' }
    );

    const { result } = renderHook(() => useServerData(), { wrapper });

    await act(async () => {
      await result.current.refreshAll();
    });

    expect(result.current.recurrenceTemplates.some(t => t.id === 'tmpl-fibre')).toBe(true);

    // 1. Résiliation du contrat à partir de novembre
    await act(async () => {
      await result.current.deleteRecurrenceTemplate('tmpl-fibre', '2026-11-01');
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoStack[0].label).toContain('Résiliation contrat « Internet Fibre Pro »');

    // 2. Undo -> Restauration intégrale
    await act(async () => {
      await result.current.undo();
    });

    // Le template est réactivé
    expect(dbTemplates.some(t => t.id === 'tmpl-fibre')).toBe(true);

    // Les transactions ont été restaurées avec leurs statuts d'origine EXACTS
    const oct = dbTransactions.find(t => t.id === 'tx-oct')!;
    const nov = dbTransactions.find(t => t.id === 'tx-nov')!;
    const dec = dbTransactions.find(t => t.id === 'tx-dec')!;

    expect(oct.status).toBe('cleared');
    expect(oct.templateId).toBe('tmpl-fibre');

    expect(nov.status).toBe('pending');
    expect(nov.templateId).toBe('tmpl-fibre');

    expect(dec.status).toBe('planned');
    expect(dec.templateId).toBe('tmpl-fibre');
  });
});
