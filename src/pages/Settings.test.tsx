// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import Settings from './Settings';
import { apiClient } from '../services/apiClient';

let mockIsAuthenticated = false;
let mockServerData: any = null;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
    user: mockIsAuthenticated ? { id: 'u1', username: 'admin' } : null,
    logout: vi.fn(),
    changePassword: vi.fn(),
    getRecoveryKey: vi.fn()
  })
}));

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => mockServerData
}));

vi.mock('../contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({
    theme: 'light',
    setTheme: vi.fn(),
    isPrivacyMode: false,
    togglePrivacyMode: vi.fn()
  })
}));

describe('Settings page - Protection des requêtes de maintenance', () => {
  let getStatusSpy: any;
  let getLogsSpy: any;
  let listSnapshotsSpy: any;

  afterEach(() => { cleanup(); });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockServerData = {
      categories: [],
      accounts: [],
      incomePayers: [],
      transactions: [],
      loans: [],
      refreshAll: vi.fn()
    };

    getStatusSpy = vi.spyOn(apiClient.maintenance, 'getStatus').mockResolvedValue({
      integrity: 'ok',
      dbSizeFormatted: '128 Ko',
      walSizeFormatted: '0 o',
      systemMetrics: {
        uptimeFormatted: '1h',
        memoryUsageFormatted: '50 Mo',
        diskStats: null
      }
    } as any);

    getLogsSpy = vi.spyOn(apiClient.maintenance, 'getLogs').mockResolvedValue({
      lines: ['[INFO] Serveur actif']
    });

    listSnapshotsSpy = vi.spyOn(apiClient.maintenance, 'listSnapshots').mockResolvedValue({
      snapshots: []
    });
  });

  it('1. Ne déclenche AUCUN appel aux endpoints de maintenance lorsque l\'utilisateur n\'est pas authentifié', async () => {
    mockIsAuthenticated = false;

    render(<Settings />);

    // Basculer vers l'onglet Serveur & Synchro (le bouton avec classe btn-outline qui bascule la section)
    const serverBtns = screen.getAllByRole('button', { name: /Serveur & Synchro/i });
    const navBtn = serverBtns.find(b => b.classList.contains('btn-outline')) || serverBtns[0];
    await act(async () => {
      fireEvent.click(navBtn);
    });

    expect(getStatusSpy).not.toHaveBeenCalled();
    expect(getLogsSpy).not.toHaveBeenCalled();
    expect(listSnapshotsSpy).not.toHaveBeenCalled();
  });

  it('2. Déclenche les appels aux endpoints de maintenance lorsque l\'utilisateur est authentifié et consulte l\'onglet Serveur', async () => {
    mockIsAuthenticated = true;

    render(<Settings />);

    // Basculer vers l'onglet Serveur & Synchro (le bouton avec classe btn-outline qui bascule la section)
    const serverBtns = screen.getAllByRole('button', { name: /Serveur & Synchro/i });
    const navBtn = serverBtns.find(b => b.classList.contains('btn-outline')) || serverBtns[0];
    await act(async () => {
      fireEvent.click(navBtn);
    });

    expect(getStatusSpy).toHaveBeenCalledTimes(1);
    expect(getLogsSpy).toHaveBeenCalledTimes(1);
  });

  it('2b. Déclenche le chargement des instantanés lorsque l\'utilisateur consulte l\'onglet Sauvegardes & Restauration', async () => {
    mockIsAuthenticated = true;

    render(<Settings />);

    // Basculer vers l'onglet Sauvegardes & Restauration
    const backupBtns = screen.getAllByRole('button', { name: /Sauvegardes & Restauration/i });
    const navBtn = backupBtns.find(b => b.classList.contains('btn-outline')) || backupBtns[0];
    await act(async () => {
      fireEvent.click(navBtn);
    });

    expect(listSnapshotsSpy).toHaveBeenCalledTimes(1);
  });

  it('3. Ouvre la modale de sélection de période Excel et déclenche le téléchargement', async () => {
    mockIsAuthenticated = true;
    const downloadExcelSpy = vi.spyOn(apiClient.migration, 'downloadExcel').mockResolvedValue(undefined as any);

    render(<Settings />);

    // Basculer vers la section "Sauvegardes & Restauration"
    const backupNavBtns = screen.getAllByRole('button', { name: /Sauvegardes & Restauration/i });
    const backupNavBtn = backupNavBtns.find(b => b.classList.contains('btn-outline')) || backupNavBtns[0];
    await act(async () => {
      fireEvent.click(backupNavBtn);
    });

    // Trouver le bouton "Exporter au format Excel (.xlsx)"
    const exportExcelBtn = screen.getByRole('button', { name: /Exporter au format Excel \(\.xlsx\)/i });
    expect(exportExcelBtn).toBeDefined();

    // Cliquer sur le bouton pour ouvrir la modale
    await act(async () => {
      fireEvent.click(exportExcelBtn);
    });

    // La modale doit être affichée avec son titre
    expect(screen.getByText("Paramètres de l'export Excel (.xlsx)")).toBeDefined();
    expect(screen.getByText(/Exporter l'intégralité des données/i)).toBeDefined();

    // Tester la validation en mode personnalisé avec dates manquantes ou incohérentes
    const customRadio = screen.getByLabelText(/Filtrer par période personnalisée/i);
    await act(async () => {
      fireEvent.click(customRadio);
    });

    const downloadBtn = screen.getByRole('button', { name: /Télécharger le classeur \(\.xlsx\)/i });

    // Clic sans date -> erreur
    await act(async () => {
      fireEvent.click(downloadBtn);
    });
    expect(screen.getByText(/Veuillez renseigner une date de début et une date de fin/i)).toBeDefined();
    expect(downloadExcelSpy).not.toHaveBeenCalled();

    // Saisie date début > date fin -> erreur
    // Les inputs date n'ont pas de htmlFor explicite lié au label, on les sélectionne par input[type=date]
    const dateInputs = screen.getAllByDisplayValue('')
      .filter(el => (el as HTMLInputElement).type === 'date') as HTMLInputElement[];
    expect(dateInputs.length).toBe(2);
    const startDateInput = dateInputs[0];
    const endDateInput = dateInputs[1];

    await act(async () => {
      fireEvent.change(startDateInput, { target: { value: '2026-06-01' } });
      fireEvent.change(endDateInput, { target: { value: '2026-01-01' } });
      fireEvent.click(downloadBtn);
    });
    expect(screen.getByText(/La date de début doit être antérieure ou égale à la date de fin/i)).toBeDefined();
    expect(downloadExcelSpy).not.toHaveBeenCalled();

    // Saisie dates valides -> appel api avec options
    await act(async () => {
      fireEvent.change(endDateInput, { target: { value: '2026-12-31' } });
      fireEvent.click(downloadBtn);
    });
    expect(downloadExcelSpy).toHaveBeenCalledWith({ startDate: '2026-06-01', endDate: '2026-12-31' });
  });

  describe('Gestion explicite du compte courant principal et des comptes secondaires', () => {
    it('attribue le solde bancaire réel du tableau de bord au seul compte principal, et conserve le solde calculé pour le compte secondaire', async () => {
      mockIsAuthenticated = true;
      const mockSaveDashboardSettings = vi.fn().mockResolvedValue(undefined);

      mockServerData = {
        categories: [],
        accounts: [
          { id: 'acc-main', name: 'Compte Boursorama', type: 'checking', initialBalance: 1000, isClosed: false },
          { id: 'acc-sec', name: 'Compte Revolut Secondaire', type: 'checking', initialBalance: 200, isClosed: false },
          { id: 'acc-livret', name: 'Livret A', type: 'savings', initialBalance: 5000, isClosed: false }
        ],
        incomePayers: [],
        transactions: [
          // Transaction de 50€ pointée sur le compte secondaire -> solde calculé 200 - 50 = 150€
          { id: 'tx-1', accountId: 'acc-sec', amount: 50, type: 'daily', status: 'cleared', date: '2026-10-15' }
        ],
        loans: [],
        recurrenceTemplates: [],
        dashboardSettings: {
          manualBalance: '3450.50',
          card1: '0',
          card2: '0',
          primaryAccountId: 'acc-main'
        },
        saveDashboardSettings: mockSaveDashboardSettings,
        saveAccount: vi.fn(),
        deleteAccount: vi.fn(),
        refreshAll: vi.fn()
      };

      render(<Settings />);

      // Le compte Boursorama (principal) doit afficher le solde du Tableau de bord (3 450,50 €)
      const mainRow = screen.getByText('Compte Boursorama').closest('tr')!;
      expect(mainRow.textContent).toContain('3\u202f450,50 €');
      expect(mainRow.textContent).toContain('(Tableau de bord)');
      expect(mainRow.textContent).toContain('Principal');

      // Le compte Revolut (secondaire) doit afficher son propre solde calculé (150,00 €) et PAS le solde du Dashboard
      const secRow = screen.getByText('Compte Revolut Secondaire').closest('tr')!;
      expect(secRow.textContent).toContain('150,00 €');
      expect(secRow.textContent).not.toContain('3\u202f450,50 €');
      expect(secRow.textContent).not.toContain('(Tableau de bord)');
      expect(secRow.textContent).not.toContain('Principal');

      // Le livret A (épargne) doit afficher son solde initial / calculé (5 000,00 €)
      const livretCells = screen.getAllByText('Livret A');
      const livretRow = livretCells[0].closest('tr')!;
      expect(livretRow.textContent).toContain('5\u202f000,00 €');
      expect(livretRow.textContent).not.toContain('(Tableau de bord)');
    });

    it('permet de changer de compte principal en cliquant sur l\'étoile et appelle saveDashboardSettings', async () => {
      mockIsAuthenticated = true;
      const mockSaveDashboardSettings = vi.fn().mockResolvedValue(undefined);

      mockServerData = {
        categories: [],
        accounts: [
          { id: 'acc-main', name: 'Compte Boursorama', type: 'checking', initialBalance: 1000, isClosed: false },
          { id: 'acc-sec', name: 'Compte Revolut Secondaire', type: 'checking', initialBalance: 200, isClosed: false }
        ],
        incomePayers: [],
        transactions: [],
        loans: [],
        recurrenceTemplates: [],
        dashboardSettings: {
          manualBalance: '3000',
          card1: '0',
          card2: '0',
          primaryAccountId: 'acc-main'
        },
        saveDashboardSettings: mockSaveDashboardSettings,
        saveAccount: vi.fn(),
        deleteAccount: vi.fn(),
        refreshAll: vi.fn()
      };

      render(<Settings />);

      // Trouver le bouton pour définir le compte secondaire en tant que compte principal
      const setPrimaryBtn = screen.getByRole('button', { name: /Définir Compte Revolut Secondaire comme compte principal/i });
      await act(async () => {
        fireEvent.click(setPrimaryBtn);
      });

      expect(mockSaveDashboardSettings).toHaveBeenCalledWith({ primaryAccountId: 'acc-sec' });
    });

    it('ignore un primaryAccountId invalide ou clôturé et se rabat proprement sur le premier compte actif sans corrompre les autres', () => {
      mockIsAuthenticated = true;
      mockServerData = {
        categories: [],
        accounts: [
          // Le compte principal enregistré a été clôturé
          { id: 'acc-old-main', name: 'Ancien Compte Clos', type: 'checking', initialBalance: 0, isClosed: true },
          // Le compte actif restant
          { id: 'acc-active', name: 'Compte Actif', type: 'checking', initialBalance: 500, isClosed: false },
          { id: 'acc-other', name: 'Compte Secondaire Actif', type: 'checking', initialBalance: 200, isClosed: false }
        ],
        incomePayers: [],
        transactions: [],
        loans: [],
        recurrenceTemplates: [],
        dashboardSettings: {
          manualBalance: '4200',
          card1: '0',
          card2: '0',
          primaryAccountId: 'acc-old-main' // pointe vers un compte clôturé
        },
        saveDashboardSettings: vi.fn(),
        saveAccount: vi.fn(),
        deleteAccount: vi.fn(),
        refreshAll: vi.fn()
      };

      render(<Settings />);

      // L'ancien compte clos ne doit PAS être principal
      const oldRow = screen.getByText('Ancien Compte Clos').closest('tr')!;
      expect(oldRow.textContent).not.toContain('Principal');
      expect(oldRow.textContent).not.toContain('(Tableau de bord)');

      // Le compte actif de repli devient principal
      const activeRow = screen.getByText('Compte Actif').closest('tr')!;
      expect(activeRow.textContent).toContain('4\u202f200,00 €');
      expect(activeRow.textContent).toContain('(Tableau de bord)');
      expect(activeRow.textContent).toContain('Principal');

      // Le compte secondaire actif garde son solde propre (200,00 €)
      const otherRow = screen.getByText('Compte Secondaire Actif').closest('tr')!;
      expect(otherRow.textContent).toContain('200,00 €');
      expect(otherRow.textContent).not.toContain('4\u202f200,00 €');
      expect(otherRow.textContent).not.toContain('(Tableau de bord)');
    });
  });
});
