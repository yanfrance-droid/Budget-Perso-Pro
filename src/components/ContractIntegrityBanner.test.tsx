// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { ContractIntegrityBanner } from './ContractIntegrityBanner';
import * as ServerDataContextModule from '../contexts/ServerDataContext';

describe('ContractIntegrityBanner Component (Watchdog Granulaire & Arbitrable)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('affiche un statut 100% conforme et discret avec les 3 pastilles de rubrique', () => {
    vi.spyOn(ServerDataContextModule, 'useServerDataOptional').mockReturnValue({
      recurrenceTemplates: [
        {
          id: 'tmpl-1',
          label: 'Fibre Optique',
          type: 'fixed_expense',
          amount: 39.99,
          recurrenceDay: 10,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        },
        {
          id: 'tmpl-2',
          label: 'Alimentation Courses',
          type: 'variable_expense',
          amount: 200,
          recurrenceDay: 5,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        }
      ],
      transactions: [
        {
          id: 'tx-1',
          templateId: 'tmpl-1',
          label: 'Fibre Optique',
          type: 'fixed_expense',
          amount: 39.99,
          date: '2026-11-10',
          recurrenceDay: 10,
          accountId: 'acc1',
          status: 'planned'
        },
        {
          id: 'tx-2',
          templateId: 'tmpl-2',
          label: 'Alimentation Courses',
          type: 'variable_expense',
          amount: 200,
          date: '2026-11-05',
          recurrenceDay: 5,
          accountId: 'acc1',
          status: 'planned'
        }
      ],
      acceptedExceptions: {},
      syncRollingHorizon: vi.fn().mockResolvedValue({ totalCreated: 0, monthsProcessed: ['2026-11'] })
    } as any);

    render(<ContractIntegrityBanner forcedMonth="2026-11" />);

    expect(screen.getByText(/Intégrité universelle/i)).toBeTruthy();
    expect(screen.getByText(/100 % conforme/i)).toBeTruthy();
    expect(screen.getByText(/Charges fixes : 1\/1/i)).toBeTruthy();
    expect(screen.getByText(/Variables récurrentes : 1\/1/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('affiche une bannière d\'alerte proéminente, permet l\'arbitrage (Régénérer ou Accepter) par contrat', async () => {
    const mockSyncRollingHorizon = vi.fn().mockResolvedValue({ totalCreated: 1, monthsProcessed: ['2026-11'] });
    const mockGenerateSingleOccurrence = vi.fn().mockResolvedValue({ success: true });
    const mockAcceptIntegrityException = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(ServerDataContextModule, 'useServerDataOptional').mockReturnValue({
      recurrenceTemplates: [
        {
          id: 'tmpl-1',
          label: 'Fibre Optique',
          type: 'fixed_expense',
          amount: 39.99,
          recurrenceDay: 10,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        },
        {
          id: 'tmpl-2',
          label: 'Assurance Habitation',
          type: 'fixed_expense',
          amount: 25.50,
          recurrenceDay: 5,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        }
      ],
      transactions: [
        {
          id: 'tx-1',
          templateId: 'tmpl-1',
          label: 'Fibre Optique',
          type: 'fixed_expense',
          amount: 39.99,
          date: '2026-11-10',
          recurrenceDay: 10,
          accountId: 'acc1',
          status: 'planned'
        }
      ],
      acceptedExceptions: {},
      syncRollingHorizon: mockSyncRollingHorizon,
      generateSingleOccurrence: mockGenerateSingleOccurrence,
      acceptIntegrityException: mockAcceptIntegrityException
    } as any);

    render(<ContractIntegrityBanner forcedMonth="2026-11" />);

    // Rôle alert présent
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();

    expect(screen.getByText(/Alerte Intégrité : 1 charge\(s\) contractuelle\(s\) manquante\(s\) sur 11\/2026 \(écart : 25.50 €\)/i)).toBeTruthy();

    // Ouverture des détails d'arbitrage
    const detailsBtn = screen.getByRole('button', { name: /Arbitrage & Détails/i });
    fireEvent.click(detailsBtn);

    expect(screen.getByText(/Assurance Habitation/i)).toBeTruthy();

    // Bouton [Régénérer]
    const regenBtn = screen.getByRole('button', { name: /Régénérer/i });
    fireEvent.click(regenBtn);
    expect(mockGenerateSingleOccurrence).toHaveBeenCalledWith('tmpl-2', '2026-11');

    await waitFor(() => {
      expect(screen.queryByText(/Synchronisation\.\.\./i)).toBeNull();
    });

    // Bouton [Accepter l'écart]
    const acceptBtn = screen.getByRole('button', { name: /Accepter l'écart/i });
    fireEvent.click(acceptBtn);
    expect(mockAcceptIntegrityException).toHaveBeenCalledWith('tmpl-2', '2026-11');

    // Bouton global [Synchroniser tout]
    const syncAllBtn = screen.getByRole('button', { name: /Synchroniser tout/i });
    fireEvent.click(syncAllBtn);
    expect(mockSyncRollingHorizon).toHaveBeenCalledWith('2026-11', 0, 12);
  });
});
