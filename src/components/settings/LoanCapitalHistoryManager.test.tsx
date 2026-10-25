// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';
import LoanCapitalHistoryManager, { formatMonthDisplay, formatEuro } from './LoanCapitalHistoryManager';
import { apiClient } from '../../services/apiClient';

// Mock complet du client API
vi.mock('../../services/apiClient', () => ({
  apiClient: {
    loans: {
      history: {
        getAll: vi.fn(),
        saveRecord: vi.fn(),
        updateMonth: vi.fn(),
        deleteMonth: vi.fn(),
        clearAll: vi.fn(),
        export: vi.fn(),
        import: vi.fn()
      }
    },
    migration: {
      import: vi.fn(),
      export: vi.fn()
    }
  }
}));

describe('LoanCapitalHistoryManager — Interface de gestion Paramètres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Fonctions utilitaires : formatage de mois et des montants en euros', () => {
    expect(formatMonthDisplay('2024-05')).toBe('05/2024');
    expect(formatEuro(150000)).toMatch(/150\s*000,00\s*€/);
    expect(formatEuro(null)).toBe('-');
    expect(formatEuro(undefined)).toBe('-');
    expect(formatEuro(0)).toMatch(/0,00\s*€/);
  });

  it('2. Affichage d\'un état initial vide sans enregistrement', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValueOnce([]);

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Aucun historique de capitaux enregistré/i)).not.toBeNull();
    });

    expect(screen.queryByText(/Ajouter votre premier relevé mensuel/i)).not.toBeNull();
  });

  it('3. Chargement et affichage des relevés existants depuis l\'API SQLite', async () => {
    const mockData = [
      {
        month: '2024-05',
        realEstateCapital: 185000,
        realEstateMonthlyPayment: 950,
        consumerCapital: 12000,
        consumerMonthlyPayment: 320,
        notes: 'Relevé de mai'
      }
    ];
    (apiClient.loans.history.getAll as any).mockResolvedValueOnce(mockData);

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('05/2024').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('Relevé de mai')).not.toBeNull();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('4. Ajout d\'un relevé mensuel avec valeurs numériques valides', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValue([]);
    (apiClient.loans.history.saveRecord as any).mockResolvedValueOnce({
      month: '2024-06',
      realEstateCapital: 184500,
      realEstateMonthlyPayment: 950,
      consumerCapital: 11800,
      consumerMonthlyPayment: 320
    });

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Ajouter un mois/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter un mois/i })[0]);

    const monthInput = screen.getByPlaceholderText(/Ex: 2024-05/i);
    const immoCapInput = screen.getByPlaceholderText(/Ex: 185000/i);
    const submitBtn = screen.getByRole('button', { name: /^Enregistrer$/i });

    fireEvent.change(monthInput, { target: { value: '2024-06' } });
    fireEvent.change(immoCapInput, { target: { value: '184500' } });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(apiClient.loans.history.saveRecord).toHaveBeenCalledWith({
        month: '2024-06',
        realEstateCapital: 184500,
        realEstateMonthlyPayment: null,
        consumerCapital: null,
        consumerMonthlyPayment: null,
        notes: null
      });
    });
  });

  it('5. Validation du format de mois : bloque la soumission si non conforme', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValue([]);

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Ajouter un mois/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter un mois/i })[0]);

    const monthInput = screen.getByPlaceholderText(/Ex: 2024-05/i);
    const submitBtn = screen.getByRole('button', { name: /^Enregistrer$/i });

    fireEvent.change(monthInput, { target: { value: 'mai-2024' } });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.queryAllByText(/Le mois doit être au format AAAA-MM/i).length).toBeGreaterThan(0);
    });

    expect(apiClient.loans.history.saveRecord).not.toHaveBeenCalled();
  });

  it('6. Confirmation avant suppression d\'un mois', async () => {
    const mockData = [
      {
        month: '2024-05',
        realEstateCapital: 185000,
        realEstateMonthlyPayment: 950,
        consumerCapital: null,
        consumerMonthlyPayment: null
      }
    ];
    (apiClient.loans.history.getAll as any).mockResolvedValue(mockData);
    (apiClient.loans.history.deleteMonth as any).mockResolvedValueOnce({ success: true, deleted: true });

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.queryByTitle(/Supprimer ce relevé/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByTitle(/Supprimer ce relevé/i));

    expect(screen.queryByText(/Êtes-vous sûr de vouloir supprimer définitivement le relevé du mois de/i)).not.toBeNull();

    const confirmBtn = screen.getByRole('button', { name: /Supprimer définitivement/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(apiClient.loans.history.deleteMonth).toHaveBeenCalledWith('2024-05');
    });
  });

  it('7. Effacement complet protégé par le mot clé "EFFACER"', async () => {
    const mockData = [
      { month: '2024-05', realEstateCapital: 185000 },
      { month: '2024-06', realEstateCapital: 184500 }
    ];
    (apiClient.loans.history.getAll as any).mockResolvedValue(mockData);
    (apiClient.loans.history.clearAll as any).mockResolvedValueOnce({ success: true, deletedCount: 2 });

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Tout effacer/i })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /Tout effacer/i }));

    expect(screen.queryByText(/Attention : cette action est irréversible !/i)).not.toBeNull();

    const inputConfirm = screen.getByPlaceholderText(/Tapez EFFACER/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirmer la suppression totale/i });

    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.change(inputConfirm, { target: { value: 'EFFACER' } });
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(apiClient.loans.history.clearAll).toHaveBeenCalled();
    });
  });

  it('8. Export autonome déclenché via apiClient.loans.history.export', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValue([{ month: '2024-05', realEstateCapital: 185000 }]);
    (apiClient.loans.history.export as any).mockResolvedValueOnce({
      format: 'PersonalBudgetPro_LoanCapitalHistory',
      version: 1,
      records: []
    });

    await act(async () => {
      render(<LoanCapitalHistoryManager />);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Exporter l'historique/i })).not.toBeNull();
    });

    // Mock createObjectURL et revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Exporter l'historique/i }));
    });

    await waitFor(() => {
      expect(apiClient.loans.history.export).toHaveBeenCalled();
    });
  });

  it('9. Absence totale d\'appel à l\'import général de migration lors de l\'import d\'historique', async () => {
    expect(apiClient.migration.import).not.toHaveBeenCalled();
  });

  it('10. Présence des attributs d\'acceptation CSV et JSON sur le champ d\'import de fichier', async () => {
    (apiClient.loans.history.getAll as any).mockResolvedValueOnce([]);

    const { container } = render(<LoanCapitalHistoryManager />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute('accept')).toContain('.csv');
    expect(fileInput.getAttribute('accept')).toContain('.json');
  });

  it('11. Sécurisation du mode Remplacement : exige une confirmation explicite (window.confirm)', async () => {
    // Cas où des enregistrements existent déjà
    (apiClient.loans.history.getAll as any).mockResolvedValue([
      { month: '2024-01', realEstateCapital: 100000 }
    ]);
    (apiClient.loans.history.import as any).mockResolvedValue({ success: true, importedCount: 1 });

    const { container } = render(<LoanCapitalHistoryManager />);

    await waitFor(() => {
      expect(screen.queryAllByText(/01\/2024/i).length).toBeGreaterThan(0);
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    // Simulation de la sélection d'un fichier CSV valide
    const csvContent = 'Mois;Capital Prêt Immo\n2024-05;150000';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Confirmer le remplacement/i)).not.toBeNull();
    });

    // 1. L'utilisateur annule le dialogue de confirmation
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmer le remplacement/i }));
    });

    // Aucun appel API n'a été émis !
    expect(apiClient.loans.history.import).not.toHaveBeenCalled();

    // 2. L'utilisateur confirme le dialogue
    confirmSpy.mockReturnValue(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmer le remplacement/i }));
    });

    // L'appel API d'import a été émis avec le mode replace
    expect(apiClient.loans.history.import).toHaveBeenCalledWith(expect.anything(), 'replace');
    confirmSpy.mockRestore();
  });
});
