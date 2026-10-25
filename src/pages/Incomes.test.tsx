// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Incomes from './Incomes';

let mockIncomes: any[] = [];
let mockAllTransactions: any[] = [];
let mockLoans: any[] = [];
let mockCategories: any[] = [];
let mockAccounts: any[] = [];
let mockIsLoading = false;

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => {
    if (mockIsLoading) return null;
    return {
      categories: mockCategories,
      accounts: mockAccounts,
      loans: mockLoans,
      transactions: mockAllTransactions.length > 0 ? mockAllTransactions : mockIncomes,
      incomePayers: [],
      recurrenceTemplates: [],
      saveTransaction: vi.fn(),
      saveRecurrenceTemplate: vi.fn(),
      deleteTransaction: vi.fn(),
      deleteRecurrenceTemplate: vi.fn(),
      saveCategory: vi.fn(),
      generateMonthlyOccurrences: vi.fn().mockResolvedValue({ success: true }),
      refreshAll: vi.fn(),
    };
  }
}));

describe('Incomes component - Reste à vivre brut théorique', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  beforeEach(() => {
    mockCategories = [{ id: 'cat-inc-1', name: 'Salaire', type: 'income' }];
    mockAccounts = [{ id: 'acc-1', name: 'Courant' }];
    mockIncomes = [];
    mockAllTransactions = [];
    mockLoans = [];
    mockIsLoading = false;
  });

  it('affiche les quatre cartes d’indicateurs dont le Reste à vivre brut théorique', () => {
    // 2500 € prévus pour le mois (2000 encaissés, 500 en attente)
    mockIncomes = [
      { id: 'inc-1', date: `${currentMonth}-05`, type: 'income', amount: 2000, status: 'cleared', categoryId: 'cat-inc-1', accountId: 'acc-1' },
      { id: 'inc-2', date: `${currentMonth}-25`, type: 'income', amount: 500, status: 'pending', categoryId: 'cat-inc-1', accountId: 'acc-1' }
    ];

    // Charges obligatoires du Dashboard :
    // - Charge fixe : 600 €
    // - Charge variable : 150 €
    // - Épargne (transfer) : 250 €
    // - Dépense de consommation (daily) : 300 € (NE DOIT PAS ÊTRE DÉDUITE)
    // - Santé (health_expense) : 80 € (NE DOIT PAS ÊTRE DÉDUITE)
    // Prêt actif : mensualité 400 €
    mockAllTransactions = [
      ...mockIncomes,
      { id: 'exp-1', date: `${currentMonth}-01`, type: 'fixed_expense', amount: 600, status: 'cleared', categoryId: 'c1' },
      { id: 'exp-2', date: `${currentMonth}-10`, type: 'variable_expense', amount: 150, status: 'planned', categoryId: 'c2' },
      { id: 'sav-1', date: `${currentMonth}-15`, type: 'transfer', amount: 250, status: 'cleared', categoryId: 'c3' },
      { id: 'daily-1', date: `${currentMonth}-12`, type: 'daily', amount: 300, status: 'cleared', categoryId: 'c4' },
      { id: 'health-1', date: `${currentMonth}-14`, type: 'health_expense', amount: 80, status: 'cleared', categoryId: 'c5' }
    ];

    mockLoans = [
      {
        id: 'loan-1',
        name: 'Prêt Immo',
        monthlyPayment: 400,
        startDate: `${currentMonth}-01`,
        endDate: '2030-12-31',
        isArchived: false
      }
    ];

    const { container } = render(<Incomes />);

    // 1. Les 3 indicateurs existants doivent être présents et inchangés
    expect(screen.getByText('Total prévu pour le mois')).toBeDefined();
    expect(screen.getByText('Montant encaissé')).toBeDefined();
    expect(screen.getByText('Restant à percevoir')).toBeDefined();

    // 2. La 4ème carte "Reste à vivre brut théorique"
    expect(screen.getByText('Reste à vivre brut théorique')).toBeDefined();

    // Vérification exacte des valeurs affichées dans les 4 cartes :
    // Carte 0 (Total prévu) : 2500 €
    // Carte 1 (Montant encaissé) : 2000 €
    // Carte 2 (Restant à percevoir) : 500 €
    // Carte 3 (Reste à vivre brut théorique) : 2500 - (600 + 150 + 400 + 250) = 2500 - 1400 = 1100 €
    const kpiValues = Array.from(container.querySelectorAll('.cards-grid .kpi-value')).map(el => el.textContent?.trim());
    expect(kpiValues[0]).toContain('2');
    expect(kpiValues[0]).toContain('500,00');

    expect(kpiValues[1]).toContain('2');
    expect(kpiValues[1]).toContain('000,00');

    expect(kpiValues[2]).toContain('500,00');

    expect(kpiValues[3]).toContain('1');
    expect(kpiValues[3]).toContain('100,00');
  });

  it('actualise correctement le calcul lors d’un changement de mois', () => {
    const monthA = '2026-11';
    const monthB = '2026-12';

    mockIncomes = [
      { id: 'inc-A', date: `${monthA}-01`, type: 'income', amount: 3000, status: 'cleared', categoryId: 'cat-inc-1', accountId: 'acc-1' },
      { id: 'inc-B', date: `${monthB}-01`, type: 'income', amount: 3200, status: 'cleared', categoryId: 'cat-inc-1', accountId: 'acc-1' }
    ];

    mockAllTransactions = [
      ...mockIncomes,
      { id: 'exp-A', date: `${monthA}-05`, type: 'fixed_expense', amount: 1000, status: 'cleared' },
      { id: 'exp-B', date: `${monthB}-05`, type: 'fixed_expense', amount: 1200, status: 'cleared' }
    ];

    const { container } = render(<Incomes />);
    const monthInput = container.querySelector('input[type="month"]') as HTMLInputElement;

    // Sélection du mois A
    fireEvent.change(monthInput, { target: { value: monthA } });
    // Total prévu = 3000, charges obligatoires = 1000 => Reste à vivre brut théorique = 2000 €
    const kpiValuesA = Array.from(container.querySelectorAll('.cards-grid .kpi-value')).map(el => el.textContent?.trim());
    expect(kpiValuesA[0]).toContain('3');
    expect(kpiValuesA[0]).toContain('000,00');
    expect(kpiValuesA[3]).toContain('2');
    expect(kpiValuesA[3]).toContain('000,00');

    // Sélection du mois B
    fireEvent.change(monthInput, { target: { value: monthB } });
    // Total prévu = 3200, charges obligatoires = 1200 => Reste à vivre brut théorique = 2000 €
    const kpiValuesB = Array.from(container.querySelectorAll('.cards-grid .kpi-value')).map(el => el.textContent?.trim());
    expect(kpiValuesB[0]).toContain('3');
    expect(kpiValuesB[0]).toContain('200,00');
    expect(kpiValuesB[3]).toContain('2');
    expect(kpiValuesB[3]).toContain('000,00');
  });
});
