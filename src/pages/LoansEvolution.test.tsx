// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import Loans from './Loans';
import type { Loan, Transaction, Account } from '../db/database';

let mockLoans: Loan[] = [];
let mockTransactions: Transaction[] = [];
let mockAccounts: Account[] = [];
const mockArchiveLoan = vi.fn();
const mockReactivateLoanFuturePlanned = vi.fn();
const mockSaveLoan = vi.fn();

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: [{ id: 'cat-1', name: 'Logement' }],
    accounts: mockAccounts,
    loans: mockLoans,
    transactions: mockTransactions,
    incomePayers: [],
    recurrenceTemplates: [],
    saveLoan: mockSaveLoan,
    deleteLoan: vi.fn(),
    archiveLoan: mockArchiveLoan,
    reactivateLoanFuturePlanned: mockReactivateLoanFuturePlanned,
    saveTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
    updateLoanPaymentStatus: vi.fn(),
    refreshAll: vi.fn(),
  })
}));

vi.mock('../services/apiClient', () => ({
  apiClient: {
    loans: {
      getAll: vi.fn().mockResolvedValue([]),
      archive: vi.fn().mockResolvedValue({ loan: { id: 'loan-1', isArchived: true }, disabledCount: 1 }),
      unarchive: vi.fn().mockResolvedValue({ loan: { id: 'loan-2', isArchived: false }, disabledCount: 0 }),
      reactivateFuture: vi.fn().mockResolvedValue({ success: true, reactivatedCount: 1 }),
      paymentHistory: {
        get: vi.fn().mockResolvedValue([
          {
            id: 'tier-1',
            loanId: 'loan-1',
            effectiveMonth: '2026-01',
            monthlyPayment: 300,
            previousPayment: null,
            notes: 'Mensualité contractuelle initiale',
            createdAt: '2026-01-01T10:00:00.000Z'
          }
        ]),
        add: vi.fn().mockResolvedValue({
          id: 'tier-2',
          loanId: 'loan-1',
          effectiveMonth: '2026-11',
          monthlyPayment: 350,
          previousPayment: 300,
          notes: 'Nouvelle mensualité',
          createdAt: '2026-10-31T10:00:00.000Z'
        }),
        delete: vi.fn().mockResolvedValue({ success: true })
      }
    }
  }
}));

describe('Évolution Crédits — Interface utilisateur (Loans.tsx)', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const activeLoan: Loan = {
    id: 'loan-1',
    name: 'Prêt Auto Actif',
    lender: 'Banque Populaire',
    initialAmount: 12000,
    remainingCapital: 8000,
    monthlyPayment: 300,
    interestRate: 3.5,
    insurancePart: 15,
    startDate: '2025-01-01',
    durationMonths: 48,
    accountId: 'acc-1',
    isArchived: false,
    loanType: 'consumer'
  };

  const archivedLoan: Loan = {
    id: 'loan-2',
    name: 'Prêt Conso Soldé',
    lender: 'Cofidis',
    initialAmount: 4000,
    remainingCapital: 0,
    monthlyPayment: 150,
    interestRate: 2.0,
    insurancePart: 0,
    startDate: '2023-01-01',
    durationMonths: 24,
    accountId: 'acc-1',
    isArchived: true,
    loanType: 'consumer'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAccounts = [{ id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 5000, referenceDate: '2026-01-01' }];
    mockLoans = [activeLoan, archivedLoan];
    mockTransactions = [
      {
        id: 'tx-future-1',
        type: 'loan_payment',
        amount: 300,
        date: '2099-01-15',
        status: 'planned',
        accountId: 'acc-1',
        linkedId: 'loan-1'
      }
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Affiche les deux onglets « Crédits actifs » et « Crédits archivés » avec leurs compteurs respectifs', () => {
    render(<Loans />);

    const activeTabBtn = screen.getByRole('button', { name: /Crédits actifs \(1\)/i });
    const archivedTabBtn = screen.getByRole('button', { name: /Crédits archivés \(1\)/i });

    expect(activeTabBtn).toBeDefined();
    expect(archivedTabBtn).toBeDefined();

    // Par défaut, l'onglet actif est sélectionné
    expect(screen.getByText('Prêt Auto Actif')).toBeDefined();
    expect(screen.queryByText('Prêt Conso Soldé')).toBeNull();
  });

  it('2. Permet de basculer vers l\'onglet « Crédits archivés » et affiche la fiche archivée avec son badge', () => {
    render(<Loans />);

    const archivedTabBtn = screen.getByRole('button', { name: /Crédits archivés \(1\)/i });
    fireEvent.click(archivedTabBtn);

    // L'onglet archivé affiche le prêt archivé et son badge
    expect(screen.getByText('Prêt Conso Soldé')).toBeDefined();
    expect(screen.getByText('📦 Archivé')).toBeDefined();
    expect(screen.getByText(/Crédit archivé \(aucune mensualité prévue\)/i)).toBeDefined();

    // Le prêt actif n'apparaît pas dans la liste archivée
    expect(screen.queryByText('Prêt Auto Actif')).toBeNull();
  });

  it('3. Ouvre la modale d\'archivage sécurisée avec l\'option de désactivation des échéances futures', async () => {
    mockArchiveLoan.mockResolvedValueOnce({ loan: { ...activeLoan, isArchived: true }, disabledCount: 1 });

    render(<Loans />);

    const archiveBtn = screen.getByTitle('Archiver ce crédit');
    fireEvent.click(archiveBtn);

    // Vérifier l'ouverture de la modale
    expect(screen.getByText(/Archiver « Prêt Auto Actif »/i)).toBeDefined();
    expect(screen.getByText(/Désactiver également les 1 échéance\(s\) future\(s\) prévue\(s\)/i)).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: /Confirmer l'archivage/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockArchiveLoan).toHaveBeenCalledWith('loan-1', true, true);
    });
  });

  it('4. Ouvre la modale de désarchivage sur un crédit archivé avec l\'option de réactivation', async () => {
    mockArchiveLoan.mockResolvedValueOnce({ loan: { ...archivedLoan, isArchived: false }, disabledCount: 0 });

    render(<Loans />);

    // Aller sur l'onglet archivé
    fireEvent.click(screen.getByRole('button', { name: /Crédits archivés \(1\)/i }));

    const unarchiveBtn = screen.getByTitle('Désarchiver ce crédit');
    fireEvent.click(unarchiveBtn);

    // Vérifier l'ouverture de la modale
    expect(screen.getByText(/Désarchiver « Prêt Conso Soldé »/i)).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: /Confirmer la réactivation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockArchiveLoan).toHaveBeenCalledWith('loan-2', false);
    });
  });

  it('5. Ouvre la modale d\'historique et modification de mensualité avec calcul actuariel indicatif', async () => {
    render(<Loans />);

    const historyBtn = screen.getByTitle('Historique & modification de mensualité');
    fireEvent.click(historyBtn);

    // Vérifier que la modale s'ouvre
    await waitFor(() => {
      expect(screen.getByText(/Historique & mensualités — Prêt Auto Actif/i)).toBeDefined();
    });

    // Vérifier l'affichage du palier contractuel initial
    await waitFor(() => {
      expect(screen.getByText('2026-01')).toBeDefined();
      expect(screen.getByText('Contrat initial')).toBeDefined();
    });

    // Vérifier la présence du calcul indicatif
    expect(screen.getByText(/Simulation actuarielle indicative/i)).toBeDefined();
  });
});
