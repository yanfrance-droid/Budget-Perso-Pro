// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import Dashboard from './Dashboard';
import type { Loan, Transaction, Account } from '../db/database';

let mockLoans: Loan[] = [];
let mockTransactions: Transaction[] = [];
let mockAccounts: Account[] = [];

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: [{ id: 'cat-1', name: 'Logement' }],
    accounts: mockAccounts,
    loans: mockLoans,
    transactions: mockTransactions,
    incomePayers: [],
    recurrenceTemplates: [],
    dashboardSettings: { manualBalance: '3000', card1: '0', card2: '0' },
    saveDashboardSettings: vi.fn(),
    generateMonthlyOccurrences: vi.fn().mockResolvedValue(undefined),
  })
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    loans: {
      history: {
        getAll: vi.fn().mockResolvedValue([])
      }
    }
  }
}));

describe('Dashboard — Palier 2 : Bloc KPI d\'Endettement & HCSF', () => {
  beforeEach(() => {
    mockAccounts = [
      { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 3000, referenceDate: '2026-01-01' }
    ];
    mockTransactions = [
      { id: 'tx-inc-1', date: '2026-11-05', amount: 4000, type: 'income', status: 'planned', accountId: 'acc-1' }
    ];
    mockLoans = [
      {
        id: 'loan-immo-1',
        name: 'Prêt Immo Principal',
        lender: 'Banque Postale',
        initialAmount: 200000,
        remainingCapital: 120000,
        monthlyPayment: 800,
        interestRate: 1.5,
        insurancePart: 25,
        startDate: '2020-01-01',
        durationMonths: 240,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      },
      {
        id: 'loan-conso-1',
        name: 'Prêt Véhicule',
        lender: 'Sofinco',
        initialAmount: 15000,
        remainingCapital: 8000,
        monthlyPayment: 200,
        interestRate: 4.5,
        insurancePart: 10,
        startDate: '2024-01-01',
        durationMonths: 48,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Affiche le bloc KPI d\'endettement avec le titre, le nombre de crédits et le lien vers /credits', () => {
    const { container } = render(<Dashboard />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('Passif du Foyer & Endettement (2 crédits)');
    expect(text).toContain('Normes de solvabilité et suivi actuariel global');
    expect(text).toContain('Gérer les prêts');

    const link = container.querySelector('a[href="/credits"]');
    expect(link).not.toBeNull();
  });

  it('2. Calcule et affiche le taux d\'endettement brut avec la pastille HCSF adéquate', () => {
    // Revenu = 4000 €. Total mensualités = 800 + 200 = 1000 €.
    // Taux d'endettement = 1000 / 4000 = 25.0 % (< 30 % -> Sain)
    const { container } = render(<Dashboard />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain("Taux d'endettement brut");
    expect(text).toContain('25,0 %');
    expect(text).toContain('Sain (< 30 %)');
  });

  it('3. Présente la découpe HCSF : Part Immobilier vs Part Conso', () => {
    // Immo : 800 / 4000 = 20.0 % (800,00 €)
    // Conso : 200 / 4000 = 5.0 % (200,00 €)
    const { container } = render(<Dashboard />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain("Découpe HCSF de l'effort");
    expect(text).toContain('Immo (patrimonial) :');
    expect(text).toContain('20.0 %');
    expect(text).toContain('Conso (fractionné) :');
    expect(text).toContain('5.0 %');
  });

  it('4. Affiche le capital restant dû global et la facture réelle résiduelle avec intérêts', () => {
    // Capital restant dû = 120 000 + 8 000 = 128 000,00 €
    const { container } = render(<Dashboard />);
    const text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';

    expect(text).toContain('Capital restant dû global');
    expect(text).toContain('128 000,00 €');
    expect(text).toContain('Facture réelle résiduelle');
    expect(text).toContain('146 960,84 €');
    expect(text).toContain('Intérêts & assurances futurs inclus');
  });

  it('5. Masque le bloc KPI si aucun crédit actif n\'est présent', () => {
    mockLoans = [];
    const { container } = render(<Dashboard />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).not.toContain('Passif du Foyer & Endettement');
  });
});
