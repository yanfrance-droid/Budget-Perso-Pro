// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import PlannedExpenses from './PlannedExpenses';
import { apiClient } from '../services/apiClient';

// Mock de l'apiClient
vi.mock('../services/apiClient', () => ({
  apiClient: {
    plannedExpenses: {
      getAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn()
    }
  }
}));

let mockLastSyncTime: Date | null = new Date();

// Mock du contexte ServerData
vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: [
      { id: 'cat_tech', name: 'High-Tech', type: 'daily', isArchived: false },
      { id: 'cat_house', name: 'Maison', type: 'daily', isArchived: false }
    ],
    lastSyncTime: mockLastSyncTime
  })
}));

describe('PlannedExpenses Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('affiche le titre, la description et l\'état vide initial', async () => {
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([]);

    render(<PlannedExpenses />);

    expect(await screen.findByText('Mes projets')).toBeDefined();
    expect(screen.getByText(/Pense-bête et liste de projets/i)).toBeDefined();
    expect(screen.getByText('Aucun projet enregistré')).toBeDefined();
  });

  it('calcule correctement le total général et les compteurs d\'urgence pour les dépenses actives', async () => {
    const mockItems = [
      { id: '1', label: 'Aspirateur', estimatedAmount: 250, urgency: 'urgent', createdAt: '2026-10-01' },
      { id: '2', label: 'Canapé', estimatedAmount: 750, urgency: 'medium', createdAt: '2026-10-02' },
      { id: '3', label: 'Casque audio', estimatedAmount: 100, urgency: 'low', createdAt: '2026-10-03' }
    ];
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce(mockItems as any);

    render(<PlannedExpenses />);

    // Total 250 + 750 + 100 = 1 100,00 €
    expect(await screen.findByText(/1\s?100,00\s?€/)).toBeDefined();
    expect(screen.getByText('3 projets actifs')).toBeDefined();
    expect(screen.getByText('Urgentes')).toBeDefined();
    expect(screen.getByText('Moyennement urgentes')).toBeDefined();
    expect(screen.getByText('Pas urgentes')).toBeDefined();
  });

  it('permet d\'ajouter une nouvelle dépense prévisionnelle avec les champs requis', async () => {
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([]);
    vi.mocked(apiClient.plannedExpenses.save).mockResolvedValueOnce({
      id: 'new_1',
      label: 'Robot ménager',
      estimatedAmount: 399,
      urgency: 'urgent',
      categoryId: 'cat_house',
      targetDate: '2026-11-15',
      notes: 'Modèle multifonction',
      createdAt: new Date().toISOString()
    } as any);

    render(<PlannedExpenses />);
    await screen.findByText('Mes projets');

    // Cliquer sur le bouton d'ajout
    const addBtn = screen.getByRole('button', { name: /Nouveau projet/i });
    fireEvent.click(addBtn);

    // Vérifier la présence du modal
    expect(screen.getByText('Ajouter un projet')).toBeDefined();

    // Remplir le formulaire
    fireEvent.change(screen.getByPlaceholderText(/Ex: Remplacement chauffe-eau/i), {
      target: { value: 'Robot ménager' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Ex: 450.00/i), {
      target: { value: '399' }
    });

    // Valider
    const submitBtn = screen.getByRole('button', { name: 'Ajouter le projet' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.plannedExpenses.save).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Robot ménager',
        estimatedAmount: 399
      }));
    });

    // L'élément apparaît maintenant dans la liste
    expect(await screen.findByText('Robot ménager')).toBeDefined();
  });

  it('retire immédiatement la dépense de la liste active et du total quand elle est marquée comme réalisée', async () => {
    const mockItem = {
      id: 'item_done',
      label: 'Peinture salon',
      estimatedAmount: 150,
      urgency: 'medium',
      createdAt: '2026-10-01'
    };
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([mockItem as any]);
    vi.mocked(apiClient.plannedExpenses.delete).mockResolvedValueOnce({ success: true });

    // Mock confirm dialog
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PlannedExpenses />);
    expect(await screen.findByText('Peinture salon')).toBeDefined();
    expect(screen.getAllByText(/150,00\s?€/).length).toBeGreaterThanOrEqual(1);

    // Cliquer sur "Réalisée"
    const doneBtn = screen.getByRole('button', { name: /Réalisée/i });
    fireEvent.click(doneBtn);

    await waitFor(() => {
      expect(apiClient.plannedExpenses.delete).toHaveBeenCalledWith('item_done');
    });

    // La dépense doit immédiatement disparaître de la liste
    expect(screen.queryByText('Peinture salon')).toBeNull();
    // Le montant de la dépense (150,00 €) a disparu
    expect(screen.queryByText(/150,00\s?€/)).toBeNull();
    // Le total repasse à 0
    expect(screen.getByText(/0,00\s?€/)).toBeDefined();
  });

  it('permet de supprimer manuellement une dépense après confirmation', async () => {
    const mockItem = {
      id: 'item_del',
      label: 'Projet abandonné',
      estimatedAmount: 500,
      urgency: 'low',
      createdAt: '2026-10-01'
    };
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([mockItem as any]);
    vi.mocked(apiClient.plannedExpenses.delete).mockResolvedValueOnce({ success: true });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PlannedExpenses />);
    expect(await screen.findByText('Projet abandonné')).toBeDefined();

    const deleteBtn = screen.getByTitle(/Supprimer ce projet/i);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiClient.plannedExpenses.delete).toHaveBeenCalledWith('item_del');
    });

    expect(screen.queryByText('Projet abandonné')).toBeNull();
  });

  it('actualise automatiquement son affichage et repasse à zéro lors d\'une synchronisation ou d\'une remise à zéro', async () => {
    // 1. Initialement, 2 dépenses sont présentes
    const initialItems = [
      { id: 'item-1', label: 'Machine à laver', estimatedAmount: 600, urgency: 'urgent', createdAt: '2026-10-01' },
      { id: 'item-2', label: 'Robot aspirateur', estimatedAmount: 400, urgency: 'medium', createdAt: '2026-10-02' }
    ];
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce(initialItems as any);

    const { rerender } = render(<PlannedExpenses />);
    expect(await screen.findByText('Machine à laver')).toBeDefined();
    expect(screen.getByText('Robot aspirateur')).toBeDefined();
    expect(screen.getByText(/1\s?000,00\s?€/)).toBeDefined();

    // 2. Simuler une remise à zéro des données côté serveur : la table est désormais vide
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([]);

    // Mise à jour de lastSyncTime (comme le fait serverData.refreshAll() lors de la réinitialisation)
    mockLastSyncTime = new Date();
    rerender(<PlannedExpenses />);

    // 3. Vérifier que la liste se vide immédiatement et que le total repasse à 0 €
    await waitFor(() => {
      expect(screen.queryByText('Machine à laver')).toBeNull();
      expect(screen.queryByText('Robot aspirateur')).toBeNull();
    });

    expect(screen.getByText('Aucun projet enregistré')).toBeDefined();
    expect(screen.getByText(/0,00\s?€/)).toBeDefined();
  });
});
