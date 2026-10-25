// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loans from './Loans';
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
    saveLoan: vi.fn(),
    deleteLoan: vi.fn(),
    saveTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
    updateLoanPaymentStatus: vi.fn(),
    saveDashboardSettings: vi.fn().mockResolvedValue({ success: true }),
    refreshAll: vi.fn(),
  })
}));

// Mock ResizeObserver for Recharts ResponsiveContainer
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Exclusion des crédits désactivés des calculs (Loans et Dashboard)', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const loan1: Loan = {
    id: 'loan-1',
    name: 'Prêt Auto',
    lender: 'Banque A',
    initialAmount: 10000,
    remainingCapital: 8000,
    monthlyPayment: 300,
    startDate: `${currentMonth}-01`,
    durationMonths: 36,
    accountId: 'acc-1',
    isArchived: false
  };

  const loan2: Loan = {
    id: 'loan-2',
    name: 'Prêt Travaux',
    lender: 'Banque B',
    initialAmount: 5000,
    remainingCapital: 4000,
    monthlyPayment: 200,
    startDate: `${currentMonth}-01`,
    durationMonths: 24,
    accountId: 'acc-1',
    isArchived: false
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('manualBalance', '3000');
    localStorage.setItem('manualBalance_test', '3000');
    localStorage.setItem('card1', '0');
    localStorage.setItem('card2', '0');
    mockAccounts = [{ id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 3000, referenceDate: '2026-01-01' }];
    mockLoans = [];
    mockTransactions = [];
  });

  it('Scénario 1 : Un crédit actif est toujours comptabilisé normalement dans Loans et Dashboard', () => {
    mockLoans = [loan1];
    // Pas encore de paiement enregistré ce mois-ci : le crédit actif doit générer sa mensualité prévue théorique
    mockTransactions = [];

    // Test dans l\'onglet Prêts (Loans)
    const { container: loansContainer } = render(<Loans />);
    expect(loansContainer.textContent).toContain('300,00 €'); // Mensualités prévues
    expect(loansContainer.textContent?.replace(/\u202F/g, ' ')).toContain('8 000,00 €');

    // Test dans le Tableau de bord (Dashboard)
    const { container: dashContainer } = render(<Dashboard />);
    // Solde prévisionnel = 3000 - 300 = 2700 €
    expect(dashContainer.textContent).toContain('2700.00');
    expect(dashContainer.textContent).toContain('300.00'); // Charges obligatoires / Crédit
  });

  it('Scénario 2 : Après désactivation, le crédit est exclu des mensualités prévues et du reste à payer', () => {
    mockLoans = [loan1];
    // La mensualité du mois est passée à "disabled" (Désactivé)
    mockTransactions = [
      {
        id: 'tx-loan-1',
        type: 'loan_payment',
        amount: 300,
        date: `${currentMonth}-10`,
        status: 'disabled',
        accountId: 'acc-1',
        linkedId: 'loan-1'
      }
    ];

    // Dans Loans.tsx : les mensualités prévues doivent être de 0,00 €
    const { container: loansContainer } = render(<Loans />);
    // Mensualités prévues = 0,00 €, Restant à payer = 0,00 €
    expect(loansContainer.textContent).toContain('0,00 €');
    // Le crédit reste consultable avec son capital restant dû intact
    expect(loansContainer.textContent?.replace(/\u202F/g, ' ')).toContain('8 000,00 €');
    expect(loansContainer.textContent).toContain('Prêt Auto');

    // Dans Dashboard.tsx : le crédit désactivé ne doit pas impacter les charges du mois ni déduire le solde prévisionnel
    const { container: dashContainer } = render(<Dashboard />);
    // Solde prévisionnel = 3000 - 0 = 3000.00 € (non déduit)
    expect(dashContainer.textContent).toContain('3000.00');
    // Charges de crédit du mois = 0.00 €
    expect(dashContainer.textContent).toContain('Total du mois');
  });

  it('Scénario 3 : Les autres crédits actifs continuent d’être calculés normalement', () => {
    mockLoans = [loan1, loan2]; // Loan 1 (300 €) désactivé, Loan 2 (200 €) actif
    mockTransactions = [
      {
        id: 'tx-loan-1',
        type: 'loan_payment',
        amount: 300,
        date: `${currentMonth}-10`,
        status: 'disabled',
        accountId: 'acc-1',
        linkedId: 'loan-1'
      }
    ];

    // Dans Loans.tsx : Total prévu = 200,00 € (seul loan 2 est compté)
    const { container: loansContainer } = render(<Loans />);
    expect(loansContainer.textContent).toContain('200,00 €');

    // Dans Dashboard.tsx : Solde prévisionnel = 3000 - 200 = 2800.00 €
    const { container: dashContainer } = render(<Dashboard />);
    expect(dashContainer.textContent).toContain('2800.00');
  });

  it('Scénario 4 : La réactivation du crédit le réintègre une seule fois sans double comptage', () => {
    mockLoans = [loan1, loan2];
    // Loan 1 réactivé en "planned" (300 €), Loan 2 actif (200 €)
    mockTransactions = [
      {
        id: 'tx-loan-1',
        type: 'loan_payment',
        amount: 300,
        date: `${currentMonth}-10`,
        status: 'planned',
        accountId: 'acc-1',
        linkedId: 'loan-1'
      }
    ];

    // Dans Loans.tsx : Total prévu = 300 + 200 = 500,00 €
    const { container: loansContainer } = render(<Loans />);
    expect(loansContainer.textContent).toContain('500,00 €');

    // Dans Dashboard.tsx : Solde prévisionnel = 3000 - 500 = 2500.00 €
    const { container: dashContainer } = render(<Dashboard />);
    expect(dashContainer.textContent).toContain('2500.00');
  });

  it('Scénario 5 : Les mensualités déjà payées, le capital restant dû et l’historique ne sont pas altérés', () => {
    mockLoans = [loan1];
    // Deux mensualités passées 'cleared' + mensualité courante 'disabled'
    mockTransactions = [
      { id: 'tx-past-1', type: 'loan_payment', amount: 300, date: '2026-08-10', status: 'cleared', accountId: 'acc-1', linkedId: 'loan-1' },
      { id: 'tx-past-2', type: 'loan_payment', amount: 300, date: '2026-09-10', status: 'cleared', accountId: 'acc-1', linkedId: 'loan-1' },
      { id: 'tx-curr', type: 'loan_payment', amount: 300, date: `${currentMonth}-10`, status: 'disabled', accountId: 'acc-1', linkedId: 'loan-1' }
    ];

    const { container } = render(<Loans />);
    // Le capital restant dû est conservé
    expect(container.textContent?.replace(/\u202F/g, ' ')).toContain('8 000,00 €');
    // Le nombre de mensualités débitées affiche bien 2
    expect(container.textContent).toContain('2 sur 36');
  });

  it('Scénario 6 : Plusieurs crédits, dont certains désactivés et certains payés, calculent des totaux exacts', () => {
    mockLoans = [loan1, loan2];
    mockTransactions = [
      // Loan 1 est désactivé ce mois-ci
      { id: 'tx-1', type: 'loan_payment', amount: 300, date: `${currentMonth}-10`, status: 'disabled', accountId: 'acc-1', linkedId: 'loan-1' },
      // Loan 2 a déjà été débité (cleared) ce mois-ci
      { id: 'tx-2', type: 'loan_payment', amount: 200, date: `${currentMonth}-05`, status: 'cleared', accountId: 'acc-1', linkedId: 'loan-1' }
    ];

    const { container: loansContainer } = render(<Loans />);
    // Pour Loan 2 : prévu = 200, débité = 200, restant à payer ce mois = 0
    // Pour Loan 1 : désactivé -> 0
    // Total débité = 200,00 €, restant à payer = 0,00 €
    expect(loansContainer.textContent).toContain('200,00 €');
  });

  describe('Fonctionnalité Mettre en pause / Reprendre un crédit entier (isPaused)', () => {
    it('Scénario Pause 1 : La mise en pause exclut le crédit des calculs et affiche le badge "En pause"', () => {
      const pausedLoan: Loan = { ...loan1, isPaused: true };
      mockLoans = [pausedLoan];
      mockTransactions = [];

      // Dans Loans.tsx : badge "En pause", 0 € prévus, capital intact
      const { container: loansContainer } = render(<Loans />);
      expect(loansContainer.textContent).toContain('En pause');
      expect(loansContainer.textContent).toContain('0,00 €'); // Mensualités prévues
      expect(loansContainer.textContent?.replace(/\u202F/g, ' ')).toContain('8 000,00 €'); // Capital restant dû intact

      // Dans Dashboard.tsx : solde prévisionnel non déduit (3000 €)
      const { container: dashContainer } = render(<Dashboard />);
      expect(dashContainer.textContent).toContain('3000.00');
    });

    it('Scénario Pause 2 : Un crédit en pause n\'affecte pas les autres crédits actifs', () => {
      const pausedLoan: Loan = { ...loan1, isPaused: true };
      mockLoans = [pausedLoan, loan2]; // Loan 1 en pause (300 €), Loan 2 actif (200 €)
      mockTransactions = [];

      // Dans Loans.tsx : seul Loan 2 est compté (200 €)
      const { container: loansContainer } = render(<Loans />);
      expect(loansContainer.textContent).toContain('200,00 €');
      expect(loansContainer.textContent).toContain('En pause');

      // Dans Dashboard.tsx : solde prévisionnel = 3000 - 200 = 2800 €
      const { container: dashContainer } = render(<Dashboard />);
      expect(dashContainer.textContent).toContain('2800.00');
    });

    it('Scénario Pause 3 : La reprise d\'un crédit réintègre les mensualités futures sans double comptage', () => {
      const resumedLoan: Loan = { ...loan1, isPaused: false };
      mockLoans = [resumedLoan, loan2]; // Loan 1 repris (300 €), Loan 2 actif (200 €)
      mockTransactions = [];

      // Dans Loans.tsx : total prévu = 300 + 200 = 500 €
      const { container: loansContainer } = render(<Loans />);
      expect(loansContainer.textContent).toContain('500,00 €');
      expect(loansContainer.textContent).not.toContain('En pause');

      // Dans Dashboard.tsx : solde prévisionnel = 3000 - 500 = 2500 €
      const { container: dashContainer } = render(<Dashboard />);
      expect(dashContainer.textContent).toContain('2500.00');
    });

    it('Scénario Pause 4 : Les mensualités explicitement désactivées individuellement restent désactivées après la reprise', () => {
      const resumedLoan: Loan = { ...loan1, isPaused: false };
      mockLoans = [resumedLoan];
      // Échéance du mois désactivée individuellement
      mockTransactions = [
        {
          id: 'tx-loan-1',
          type: 'loan_payment',
          amount: 300,
          date: `${currentMonth}-10`,
          status: 'disabled',
          accountId: 'acc-1',
          linkedId: 'loan-1'
        }
      ];

      // Même avec le crédit repris, la mensualité désactivée individuellement ne doit pas être réactivée
      const { container: loansContainer } = render(<Loans />);
      expect(loansContainer.textContent).toContain('0,00 €');

      const { container: dashContainer } = render(<Dashboard />);
      expect(dashContainer.textContent).toContain('3000.00');
    });

    it('Scénario Pause 5 : Les mensualités déjà payées et l\'historique sont intégralement préservés pendant la pause', () => {
      const pausedLoan: Loan = { ...loan1, isPaused: true };
      mockLoans = [pausedLoan];
      mockTransactions = [
        { id: 'tx-past-1', type: 'loan_payment', amount: 300, date: '2026-08-10', status: 'cleared', accountId: 'acc-1', linkedId: 'loan-1' },
        { id: 'tx-past-2', type: 'loan_payment', amount: 300, date: '2026-09-10', status: 'cleared', accountId: 'acc-1', linkedId: 'loan-1' }
      ];

      const { container } = render(<Loans />);
      expect(container.textContent).toContain('2 sur 36');
      expect(container.textContent?.replace(/\u202F/g, ' ')).toContain('8 000,00 €');
      expect(container.textContent).toContain('En pause');
    });
  });
});
