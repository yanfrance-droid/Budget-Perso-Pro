// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FixedExpenses from './FixedExpenses';
import VariableExpenses from './VariableExpenses';

let mockAccounts: any[] = [];
let mockCategories: any[] = [];
let mockTransactions: any[] = [];
let mockRecurrenceTemplates: any[] = [];

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    accounts: mockAccounts,
    categories: mockCategories,
    transactions: mockTransactions,
    recurrenceTemplates: mockRecurrenceTemplates,
    incomePayers: [],
    loans: [],
    generateMonthlyOccurrences: vi.fn().mockResolvedValue({ success: true }),
    saveTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    saveRecurrenceTemplate: vi.fn(),
    deleteRecurrenceTemplate: vi.fn(),
    saveCategory: vi.fn(),
    refreshAll: vi.fn(),
  })
}));

describe('Vérification du rendu réel des composants FixedExpenses et VariableExpenses', () => {
  beforeEach(() => {
    mockAccounts = [{
      id: 'acc_1',
      name: 'Compte Courant',
      type: 'checking',
      initialBalance: 2000,
      referenceDate: '2026-10-01'
    }];

    mockCategories = [
      {
        id: 'cat_fixed_1',
        name: 'Logement',
        type: 'fixed_expense',
        isArchived: false
      },
      {
        id: 'cat_var_1',
        name: 'Alimentation',
        type: 'variable_expense',
        isArchived: false
      }
    ];

    mockTransactions = [];
    mockRecurrenceTemplates = [];
  });

  it('Rendu sans crash de FixedExpenses (pas de violation des Rules of Hooks)', async () => {
    mockTransactions = [{
      id: 'tx_fixed_1',
      type: 'fixed_expense',
      amount: 500,
      date: `${new Date().toISOString().slice(0, 7)}-05`,
      recurrenceDay: 5,
      templateId: 'tpl_fixed_1',
      status: 'planned',
      accountId: 'acc_1',
      categoryId: 'cat_fixed_1',
      label: 'Loyer'
    }];

    render(<FixedExpenses />);

    expect(screen.getByText(/Charges fixes/i)).toBeDefined();
    expect(screen.getByText('Loyer')).toBeDefined();
  });

  it('Rendu sans crash de VariableExpenses et ouverture du dialogue de suppression', async () => {
    mockTransactions = [{
      id: 'tx_var_1',
      type: 'variable_expense',
      amount: 150,
      date: `${new Date().toISOString().slice(0, 7)}-10`,
      recurrenceDay: 10,
      templateId: 'tpl_var_1',
      status: 'planned',
      accountId: 'acc_1',
      categoryId: 'cat_var_1',
      label: 'Courses hebdo'
    }];

    const { container } = render(<VariableExpenses />);

    expect(screen.getByText(/Charges variables/i)).toBeDefined();
    expect(screen.getByText('Courses hebdo')).toBeDefined();

    // Cliquer sur le bouton de suppression (icône corbeille)
    const deleteButtons = container.querySelectorAll('button.btn-icon');
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    // Vérifier que le modal de suppression s'ouvre sans erreur
    await waitFor(() => {
      expect(screen.getByText(/Supprimer la charge récurrente/i)).toBeDefined();
      expect(screen.getByText(/Option 1 — Supprimer définitivement/i)).toBeDefined();
      expect(screen.getByText(/Option 2 — Supprimer cette charge pour ce mois uniquement/i)).toBeDefined();
    });
  });
});
