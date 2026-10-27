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
});
