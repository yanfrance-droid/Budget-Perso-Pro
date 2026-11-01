// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PlannedExpenses from './PlannedExpenses';
import { apiClient } from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    plannedExpenses: {
      getAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn()
    }
  }
}));

const staticSyncDate = new Date('2026-10-24T12:00:00.000Z');

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: [],
    lastSyncTime: staticSyncDate
  })
}));

describe('PlannedExpenses Page - Comportement temporel et persistance d\'affichage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('affiche toujours une dépense créée dans le passé (ex: il y a 6 mois ou 2 ans)', async () => {
    // Dépense créée le 15 mai 2024 avec une date cible au 1er juin 2024
    const pastItem = {
      id: 'pe-past',
      label: 'Chaudière à condensation',
      estimatedAmount: 3200,
      urgency: 'urgent',
      targetDate: '2024-06-01',
      notes: 'Remplacement urgent en 2024',
      createdAt: '2024-05-15T09:00:00.000Z'
    };

    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([pastItem as any]);

    // L'utilisateur consulte l'application le 24 octobre 2026 (plus de 2 ans plus tard)
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));

    render(<PlannedExpenses />);

    // La dépense doit être présente et visible dans la liste
    expect(await screen.findByText('Chaudière à condensation')).toBeDefined();
    expect(await screen.findByText(/2024-06-01/)).toBeDefined();
    expect(screen.getAllByText(/3\s?200,00\s?€/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 projet actif')).toBeDefined();
  });

  it('affiche une dépense sans date ou avec une date très lointaine (ex: 2035)', async () => {
    const futureItem = {
      id: 'pe-future',
      label: 'Rénovation toiture',
      estimatedAmount: 15000,
      urgency: 'medium',
      targetDate: '2035-09-01',
      notes: 'Planification décennale',
      createdAt: '2026-10-24T10:00:00.000Z'
    };

    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([futureItem as any]);

    render(<PlannedExpenses />);

    expect(await screen.findByText('Rénovation toiture')).toBeDefined();
    expect(await screen.findByText(/2035-09-01/)).toBeDefined();
    expect(screen.getAllByText(/15\s?000,00\s?€/).length).toBeGreaterThanOrEqual(1);
  });

  it('ne possède aucun sélecteur de mois ni filtre de date pouvant masquer une dépense', async () => {
    vi.mocked(apiClient.plannedExpenses.getAll).mockResolvedValueOnce([]);

    render(<PlannedExpenses />);
    await screen.findByText('Mes projets');

    // Vérifier l'absence totale de champ mois (contrairement à Incomes ou CurrentExpenses)
    expect(screen.queryByLabelText(/Mois/i)).toBeNull();
    expect(screen.queryByTitle(/Mois précédent/i)).toBeNull();
    expect(screen.queryByTitle(/Mois suivant/i)).toBeNull();
  });
});
