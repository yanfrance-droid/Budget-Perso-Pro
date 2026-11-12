// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { IntegritySectionBadge } from './IntegritySectionBadge';
import * as ServerDataContextModule from '../contexts/ServerDataContext';

describe('IntegritySectionBadge Component', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('affiche le badge conforme quand toutes les charges fixes sont présentes', () => {
    vi.spyOn(ServerDataContextModule, 'useServerDataOptional').mockReturnValue({
      recurrenceTemplates: [
        {
          id: 'tmpl-1',
          label: 'Loyer',
          type: 'fixed_expense',
          amount: 800,
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
          label: 'Loyer',
          type: 'fixed_expense',
          amount: 800,
          date: '2026-11-05',
          recurrenceDay: 5,
          accountId: 'acc1',
          status: 'planned'
        }
      ],
      acceptedExceptions: {}
    } as any);

    render(<IntegritySectionBadge type="fixed_expense" month="2026-11" />);

    expect(screen.getByText(/Charges fixes : 1\/1/i)).toBeTruthy();
  });

  it('affiche le badge d\'alerte quand une charge est manquante', () => {
    vi.spyOn(ServerDataContextModule, 'useServerDataOptional').mockReturnValue({
      recurrenceTemplates: [
        {
          id: 'tmpl-1',
          label: 'Loyer',
          type: 'fixed_expense',
          amount: 800,
          recurrenceDay: 5,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        }
      ],
      transactions: [],
      acceptedExceptions: {}
    } as any);

    render(<IntegritySectionBadge type="fixed_expense" month="2026-11" />);

    expect(screen.getByText(/Charges fixes : 0\/1 \(1 manquante\)/i)).toBeTruthy();
  });

  it('affiche la mention accepté quand un écart est arbitré', () => {
    vi.spyOn(ServerDataContextModule, 'useServerDataOptional').mockReturnValue({
      recurrenceTemplates: [
        {
          id: 'tmpl-1',
          label: 'Loyer',
          type: 'fixed_expense',
          amount: 800,
          recurrenceDay: 5,
          startDate: '2026-01',
          isActive: true,
          accountId: 'acc1'
        }
      ],
      transactions: [],
      acceptedExceptions: {
        'tmpl-1_2026-11': true
      }
    } as any);

    render(<IntegritySectionBadge type="fixed_expense" month="2026-11" />);

    expect(screen.getByText(/Charges fixes : 0\/1 \(1 accepté\)/i)).toBeTruthy();
  });
});
