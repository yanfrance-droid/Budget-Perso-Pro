// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { LoanReleaseTimeline, computeReleaseMilestones } from '../LoanReleaseTimeline';
import Loans from '../../../pages/Loans';
import type { Loan, Transaction, Account } from '../../../db/database';

let mockLoans: Loan[] = [];
let mockTransactions: Transaction[] = [];
let mockAccounts: Account[] = [];

vi.mock('../../../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: [{ id: 'cat-1', name: 'Logement' }],
    accounts: mockAccounts,
    loans: mockLoans,
    transactions: mockTransactions,
    incomePayers: [],
    recurrenceTemplates: [],
    saveLoan: vi.fn(),
    deleteLoan: vi.fn(),
    archiveLoan: vi.fn(),
    reactivateLoanFuturePlanned: vi.fn(),
    saveTransaction: vi.fn(),
    updateTransactionStatus: vi.fn(),
    updateLoanPaymentStatus: vi.fn(),
    refreshAll: vi.fn(),
  })
}));

vi.mock('../../../services/apiClient', () => ({
  apiClient: {
    loans: {
      getAll: vi.fn().mockResolvedValue([]),
      archive: vi.fn(),
      unarchive: vi.fn(),
      reactivateFuture: vi.fn(),
      paymentHistory: {
        get: vi.fn().mockResolvedValue([]),
        add: vi.fn(),
        delete: vi.fn()
      }
    }
  }
}));

describe('LoanReleaseTimeline Component & Palier 3 Tests', () => {
  beforeEach(() => {
    mockAccounts = [{ id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 5000, referenceDate: '2026-01-01' }];
    mockTransactions = [
      { id: 'tx-inc-1', date: '2026-11-05', amount: 3500, type: 'income', status: 'cleared', accountId: 'acc-1' }
    ];
    mockLoans = [
      {
        id: 'loan-cic',
        name: 'CIC Allure Libre',
        lender: 'CIC',
        initialAmount: 3000,
        remainingCapital: 1320,
        monthlyPayment: 60,
        interestRate: 0,
        insurancePart: 0,
        startDate: '2026-09-15',
        endDate: '2028-10-15',
        durationMonths: 24,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      },
      {
        id: 'loan-cm12',
        name: 'Crédit Mutuel n°12',
        lender: 'Crédit Mutuel',
        initialAmount: 4000,
        remainingCapital: 3000,
        monthlyPayment: 81.39,
        interestRate: 2.1,
        insurancePart: 2,
        startDate: '2025-07-01',
        endDate: '2030-07-01',
        durationMonths: 60,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      },
      {
        id: 'loan-sofinco-perso',
        name: 'Sofinco Prêt Personnel',
        lender: 'Sofinco',
        initialAmount: 10000,
        remainingCapital: 8500,
        monthlyPayment: 215.28,
        interestRate: 4.8,
        insurancePart: 8,
        startDate: '2026-10-01',
        endDate: '2031-04-05',
        durationMonths: 54,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      },
      {
        id: 'loan-poele',
        name: 'MEIA Poêle à granulés',
        lender: 'MEIA',
        initialAmount: 7000,
        remainingCapital: 5000,
        monthlyPayment: 99.61,
        interestRate: 1.2,
        insurancePart: 2,
        startDate: '2024-07-01',
        endDate: '2034-01-04',
        durationMonths: 114,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      },
      {
        id: 'loan-immo',
        name: 'Prêt Immobilier Principal',
        lender: 'Crédit Mutuel',
        initialAmount: 250000,
        remainingCapital: 175000,
        monthlyPayment: 1114.12,
        interestRate: 1.5,
        insurancePart: 30,
        startDate: '2019-08-05',
        endDate: '2044-10-05',
        durationMonths: 303,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      }
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Trie rigoureusement les crédits par date d\'échéance finale croissante', () => {
    const { milestones } = computeReleaseMilestones(mockLoans, 3500);

    expect(milestones.length).toBe(5);
    // Ordre attendu :
    // 1. 2028-10 (CIC Allure Libre)
    // 2. 2030-07 (Crédit Mutuel n°12)
    // 3. 2031-04 (Sofinco Prêt Personnel)
    // 4. 2034-01 (MEIA Poêle)
    // 5. 2044-10 (Prêt Immo)
    expect(milestones[0].loanName).toBe('CIC Allure Libre');
    expect(milestones[0].endMonth).toBe('2028-10');

    expect(milestones[1].loanName).toBe('Crédit Mutuel n°12');
    expect(milestones[1].endMonth).toBe('2030-07');

    expect(milestones[2].loanName).toBe('Sofinco Prêt Personnel');
    expect(milestones[2].endMonth).toBe('2031-04');

    expect(milestones[3].loanName).toBe('MEIA Poêle à granulés');
    expect(milestones[3].endMonth).toBe('2034-01');

    expect(milestones[4].loanName).toBe('Prêt Immobilier Principal');
    expect(milestones[4].endMonth).toBe('2044-10');
  });

  it('2. Calcule fidèlement le cumul du cash-flow libéré et la baisse du taux d\'endettement à chaque jalon', () => {
    const { milestones, totalMonthlyInitially } = computeReleaseMilestones(mockLoans, 3500);

    // Total initial : 60 + 81.39 + 215.28 + 99.61 + 1114.12 = 1570.40 €
    expect(totalMonthlyInitially).toBe(1570.4);

    // Étape 1 : Libération CIC Allure Libre (+60,00 €)
    expect(milestones[0].monthlyPayment).toBe(60);
    expect(milestones[0].cumulativeFreedMonthly).toBe(60);
    expect(milestones[0].projectedRemainingMonthly).toBe(1510.4);

    // Étape 2 : Libération CM n°12 (+81,39 €) -> Cumul = 141,39 €
    expect(milestones[1].monthlyPayment).toBe(81.39);
    expect(milestones[1].cumulativeFreedMonthly).toBe(141.39);

    // Étape 3 : Libération Sofinco (+215,28 €) -> Cumul = 356,67 €
    expect(milestones[2].monthlyPayment).toBe(215.28);
    expect(milestones[2].cumulativeFreedMonthly).toBe(356.67);

    // Dernière étape (Prêt Immo) : Cumul égal au total initial et endettement projeté = 0 %
    expect(milestones[4].cumulativeFreedMonthly).toBe(1570.4);
    expect(milestones[4].projectedRemainingMonthly).toBe(0);
    expect(milestones[4].projectedDebtRatio).toBe(0);
  });

  it('3. Rend visuellement les éléments clés de la frise chronologique', () => {
    const { container } = render(<LoanReleaseTimeline loans={mockLoans} monthlyIncomes={3500} />);
    const text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';

    expect(text).toContain("Trajectoire d'Extinction & Libération du Cash-Flow");
    expect(text).toContain('Horizon liberté totale : octobre 2044');
    expect(text).toContain('1 570,40 €/mois');
    expect(text).toContain('CIC Allure Libre');
    expect(text).toContain('+60,00 €/mois');
    expect(text).toContain('Crédit Mutuel n°12');
    expect(text).toContain('Prêt Immobilier Principal');
    expect(text).toContain('Libération définitive');
  });

  it('4. Permet de basculer de manière fluide vers l\'onglet « 🚀 Trajectoire & Libération » dans Loans.tsx', () => {
    const { container } = render(<Loans />);

    // Par défaut : onglet actif
    let text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';
    expect(text).toContain('Mensualités prévues');
    expect(text).toContain('Crédits actifs (5)');

    // Clic sur l'onglet Trajectoire & Libération
    const timelineBtn = screen.getByText(/Trajectoire & Libération/i);
    fireEvent.click(timelineBtn);

    text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';
    expect(text).toContain("Trajectoire d'Extinction & Libération du Cash-Flow");
    expect(text).toContain('Chronologie des extinctions de crédits');
    expect(text).toContain('octobre 2044');

    // Clic pour revenir aux crédits actifs
    const activeBtn = screen.getByText(/Crédits actifs \(5\)/i);
    fireEvent.click(activeBtn);

    text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';
    expect(text).toContain('Mensualités prévues');
  });

  it('5. Harmonise le badge HCSF sur Loans.tsx avec la terminologie du Dashboard', () => {
    // Rend Loans avec les 5 prêts
    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/[\u202F\u00A0]/g, ' ') || '';

    // Si le ratio est < 45 %, le badge affiche la désignation alignée
    expect(text).toMatch(/(Sain \(< 30 %\)|Modéré \(30-33 %\)|Limite HCSF \(33-35 %\)|Élevé \(35-45 %\)|Critique)/);
  });
});
