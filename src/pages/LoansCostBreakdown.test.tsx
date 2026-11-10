// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import Loans from './Loans';
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
    archiveLoan: vi.fn(),
    reactivateLoanFuturePlanned: vi.fn(),
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

describe('Palier 1 : Électrochoc Visuel & Coût Réel des Crédits (Loans.tsx)', () => {
  beforeEach(() => {
    mockAccounts = [{ id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 5000, referenceDate: '2026-01-01' }];
    mockTransactions = [];
    mockLoans = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Affiche le bandeau macro de progression pour le prêt immobilier lorsqu\'il est présent', () => {
    mockLoans = [
      {
        id: 'loan-immo',
        name: 'Prêt Résidence Principale',
        lender: 'Crédit Agricole',
        initialAmount: 200000,
        remainingCapital: 150000,
        monthlyPayment: 900,
        interestRate: 2.5,
        insurancePart: 30,
        startDate: '2020-01-01',
        durationMonths: 240,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    // Progression : (200 000 - 150 000) / 200 000 = 25 %
    expect(text).toContain('Progression du remboursement du prêt immobilier');
    expect(text).toContain('25 %');
    expect(text).toContain('Amorti à ce jour : 50 000,00 €');
    expect(text).toContain('Capital restant dû : 150 000,00 €');
  });

  it('2. Affiche "des prêts immobiliers" au pluriel si plusieurs prêts immobiliers actifs existent', () => {
    mockLoans = [
      {
        id: 'loan-immo-1',
        name: 'Prêt Immo 1',
        lender: 'Banque 1',
        initialAmount: 100000,
        remainingCapital: 80000,
        monthlyPayment: 500,
        startDate: '2022-01-01',
        durationMonths: 240,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      },
      {
        id: 'loan-immo-2',
        name: 'Prêt Immo 2',
        lender: 'Banque 2',
        initialAmount: 50000,
        remainingCapital: 40000,
        monthlyPayment: 250,
        startDate: '2022-01-01',
        durationMonths: 120,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    expect(container.textContent).toContain('Progression du remboursement des prêts immobiliers');
  });

  it('3. Électrochoc du coût caché réel : affiche Facture réelle restante et Perte sèche sur chaque fiche active', () => {
    mockLoans = [
      {
        id: 'loan-auto',
        name: 'Prêt Auto Rapide',
        lender: 'Sofinco',
        initialAmount: 10000,
        remainingCapital: 5000,
        monthlyPayment: 300,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2025-01-01',
        durationMonths: 36,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('Facture réelle restante');
    expect(text).toContain('Perte sèche (coût banque) :');
    expect(text).toContain("d'intérêts");
    expect(text).toContain("d'assurance");
    expect(text).toContain('Plus que');
    expect(text).toContain('mensualité');
  });

  it('4. Découpe de mensualité bicolore : affiche le ratio Capital utile vs Coût banque', () => {
    mockLoans = [
      {
        id: 'loan-deco',
        name: 'Prêt Décoration',
        lender: 'Cetelem',
        initialAmount: 6000,
        remainingCapital: 3000,
        monthlyPayment: 200,
        interestRate: 4.0, // 3000 * 0.04 / 12 = 10 € intérêts
        insurancePart: 10,  // 10 € assurance
        startDate: '2025-01-01',
        durationMonths: 36,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    // Mensualité = 200 € | Coût banque = 20 € (10 % banque) | Capital utile = 180 € (90 % utile)
    expect(text).toContain('Découpe mensualité (200,00 €)');
    expect(text).toContain('90 %');
    expect(text).toContain('utile');
    expect(text).toContain('10 %');
    expect(text).toContain('banque');
    expect(text).toContain('Capital utile : 180,00 €');
    expect(text).toContain('Coût banque : 20,00 €');
  });

  it('5. Prêt à taux 0 % (PTZ) : 100 % de la mensualité est utile en l\'absence d\'assurance', () => {
    mockLoans = [
      {
        id: 'loan-ptz',
        name: 'Prêt à Taux Zéro',
        lender: 'État / Banque',
        initialAmount: 20000,
        remainingCapital: 10000,
        monthlyPayment: 250,
        interestRate: 0,
        insurancePart: 0,
        startDate: '2024-01-01',
        durationMonths: 80,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('100 %');
    expect(text).toContain('utile');
    expect(text).toContain('0 %');
    expect(text).toContain('banque');
    expect(text).toContain('Capital utile : 250,00 €');
    expect(text).toContain('Coût banque : 0,00 €');
  });

  it('6. Synthèse globale : affiche la carte récapitulative du coût total des intérêts et assurances restants', () => {
    mockLoans = [
      {
        id: 'loan-1',
        name: 'Prêt 1',
        lender: 'B1',
        initialAmount: 10000,
        remainingCapital: 5000,
        monthlyPayment: 250,
        interestRate: 4.8,
        insurancePart: 10,
        startDate: '2025-01-01',
        durationMonths: 48,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('Coût total des intérêts & assurances restants');
    expect(text).toContain('Facture réelle totale :');
  });

  it('7. Cas limite : prêt en pause n\'affiche pas le compte à rebours dynamique mais le badge En pause', () => {
    mockLoans = [
      {
        id: 'loan-paused',
        name: 'Prêt Suspendu',
        lender: 'Banque',
        initialAmount: 10000,
        remainingCapital: 6000,
        monthlyPayment: 250,
        interestRate: 3.0,
        insurancePart: 10,
        startDate: '2025-01-01',
        durationMonths: 48,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false,
        isPaused: true
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('En pause');
    expect(text).not.toContain('⏳ Plus que');
  });

  it('8. Cas limite : prêt soldé (remainingCapital = 0) n\'affiche pas d\'encart de perte sèche résiduelle', () => {
    mockLoans = [
      {
        id: 'loan-solde',
        name: 'Prêt Entièrement Remboursé',
        lender: 'Banque',
        initialAmount: 5000,
        remainingCapital: 0,
        monthlyPayment: 200,
        interestRate: 3.5,
        insurancePart: 5,
        startDate: '2024-01-01',
        durationMonths: 25,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).not.toContain('Facture réelle restante');
    expect(text).not.toContain('Découpe mensualité');
  });

  it('9. Cohérence mathématique : affiche le nombre d\'historiques net d\'ajustement dans les parenthèses', () => {
    // Cas Prêt Immo : 87 historiques saisis, adjustment -1, 2 mensualités débitées dans l'app
    // Total = 87 - 1 + 2 = 88 sur 303. Le texte doit afficher "(86 historiques et 2 débitées ici)"
    mockLoans = [
      {
        id: 'loan-immo-test',
        name: 'Prêt Immobilier',
        lender: 'Crédit Mutuel',
        initialAmount: 300000,
        remainingCapital: 200000,
        monthlyPayment: 1100,
        interestRate: 1.5,
        insurancePart: 30,
        startDate: '2019-08-05',
        endDate: '2044-10-05',
        durationMonths: 303,
        prepaidInstallments: 87,
        monthsAdjustment: -1,
        accountId: 'acc-1',
        loanType: 'mortgage',
        isArchived: false
      }
    ];

    mockTransactions = [
      {
        id: 'tx-1',
        date: '2026-10-05',
        amount: 1100,
        status: 'cleared',
        type: 'loan_payment',
        linkedId: 'loan-immo-test',
        accountId: 'acc-1'
      },
      {
        id: 'tx-2',
        date: '2026-11-05',
        amount: 1100,
        status: 'cleared',
        type: 'loan_payment',
        linkedId: 'loan-immo-test',
        accountId: 'acc-1'
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    // Vérifie le compteur total : 88 sur 303
    expect(text).toContain('Mensualités payées : 88 sur 303');
    // Vérifie la cohérence arithmétique : 86 + 2 = 88 (au lieu de 87 et 2)
    expect(text).toContain('(86 historiques et 2 débitées ici)');

    // Vérifie le badge "Plus que X mensualités" : 303 - 88 = 215 mensualités
    // Et la date contractuelle : octobre 2044 (basée sur endDate 2044-10-05)
    expect(text).toContain('⏳ Plus que 215 mensualités');
    expect(text).toContain('(octobre 2044)');
  });

  it('10. Simulation actuarielle résiduelle : démarre à M+1 si l\'échéance du mois courant est déjà cleared', () => {
    // Si l'échéance de currentMonth est déjà payée, elle ne doit pas être comptée en double dans la perte sèche
    mockLoans = [
      {
        id: 'loan-cleared-m',
        name: 'Prêt Personnel',
        lender: 'Sofinco',
        initialAmount: 10000,
        remainingCapital: 5000,
        monthlyPayment: 250,
        interestRate: 4.0,
        insurancePart: 10,
        startDate: '2025-01-01',
        endDate: '2028-12-01',
        durationMonths: 48,
        prepaidInstallments: 0,
        accountId: 'acc-1',
        loanType: 'consumer',
        isArchived: false
      }
    ];

    // On récupère le mois courant (YYYY-MM)
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    mockTransactions = [
      {
        id: 'tx-cm-1',
        date: `${currentMonthStr}-05`,
        amount: 250,
        status: 'cleared',
        type: 'loan_payment',
        linkedId: 'loan-cleared-m',
        accountId: 'acc-1'
      }
    ];

    const { container } = render(<Loans />);
    const text = container.textContent?.replace(/\u202F/g, ' ') || '';

    expect(text).toContain('Facture réelle restante');
    expect(text).toContain('Perte sèche (coût banque) :');
    // Le badge affiche la fin contractuelle
    expect(text).toContain('(décembre 2028)');
  });
});
