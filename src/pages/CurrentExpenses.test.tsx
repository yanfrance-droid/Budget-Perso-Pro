// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import CurrentExpenses, { PAYMENT_METHODS } from './CurrentExpenses';

let mockExpenses: any[] = [];
let mockCategories: any[] = [];
let mockAccounts: any[] = [];
const mockSaveTransaction = vi.fn().mockImplementation(async (item: any) => item);
const mockDeleteTransaction = vi.fn().mockResolvedValue(true);
const mockSaveCategory = vi.fn().mockResolvedValue(true);

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: mockCategories,
    accounts: mockAccounts,
    transactions: mockExpenses,
    saveTransaction: mockSaveTransaction,
    deleteTransaction: mockDeleteTransaction,
    saveCategory: mockSaveCategory,
    refreshAll: vi.fn(),
  })
}));

describe('CurrentExpenses - Moyen de paiement et numéro de chèque', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  beforeEach(() => {
    mockCategories = [
      { id: 'cat-1', name: 'Alimentation', type: 'daily', isArchived: false }
    ];
    mockAccounts = [
      { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' }
    ];
    mockExpenses = [
      {
        id: 'tx-history',
        date: `${currentMonth}-05`,
        label: 'Courses historiques',
        amount: 50.0,
        status: 'cleared',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily'
        // Pas de paymentMethod ni de checkNumber
      }
    ];

    mockSaveTransaction.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('propose exactement les 8 moyens de paiement demandés dans le formulaire', () => {
    render(<CurrentExpenses />);

    // Ouvrir le modal d'ajout
    fireEvent.click(screen.getByText('Ajouter une dépense'));

    const paymentSelect = screen.getByTestId('payment-method-select') as HTMLSelectElement;
    expect(paymentSelect).toBeDefined();

    // Vérifier les 8 options
    const options = Array.from(paymentSelect.options).map(o => o.value).filter(Boolean);
    expect(options).toEqual([
      'Carte bancaire',
      'Virement',
      'Prélèvement automatique',
      'Espèces',
      'Chèque',
      'PayPal',
      'Paiement mobile',
      'Autre'
    ]);
  });

  it('n’affiche le champ "Numéro de chèque" QUE lorsque "Chèque" est sélectionné', () => {
    render(<CurrentExpenses />);

    fireEvent.click(screen.getByText('Ajouter une dépense'));
    const paymentSelect = screen.getByTestId('payment-method-select');

    // Par défaut : non spécifié -> pas de champ numéro de chèque
    expect(screen.queryByTestId('check-number-group')).toBeNull();

    // Tester les 7 autres modes : jamais de champ chèque
    const nonCheckMethods = [
      'Carte bancaire',
      'Virement',
      'Prélèvement automatique',
      'Espèces',
      'PayPal',
      'Paiement mobile',
      'Autre'
    ];

    for (const method of nonCheckMethods) {
      fireEvent.change(paymentSelect, { target: { value: method } });
      expect(screen.queryByTestId('check-number-group')).toBeNull();
    }

    // Sélectionner 'Chèque' -> le champ apparaît immédiatement
    fireEvent.change(paymentSelect, { target: { value: 'Chèque' } });
    expect(screen.getByTestId('check-number-group')).toBeDefined();
    expect(screen.getByTestId('check-number-input')).toBeDefined();
  });

  it('préserve les zéros initiaux du numéro de chèque et les enregistre fidèlement', async () => {
    render(<CurrentExpenses />);

    fireEvent.click(screen.getByText('Ajouter une dépense'));

    // Remplir les champs obligatoires
    const modalForm = screen.getByText('Enregistrer').closest('form')!;
    const dateInput = modalForm.querySelector('input[type="date"]') as HTMLInputElement;
    const labelInput = screen.getByPlaceholderText(/Ex: Courses/i);
    const amountInput = modalForm.querySelector('input[role="spinbutton"], input[type="number"]') as HTMLInputElement;
    const paymentSelect = screen.getByTestId('payment-method-select');

    fireEvent.change(dateInput, { target: { value: `${currentMonth}-10` } });
    fireEvent.change(labelInput, { target: { value: 'Paiement artisan' } });
    fireEvent.change(amountInput, { target: { value: '150.00' } });
    fireEvent.change(paymentSelect, { target: { value: 'Chèque' } });

    // Saisir un numéro avec zéros initiaux
    const checkInput = screen.getByTestId('check-number-input') as HTMLInputElement;
    fireEvent.change(checkInput, { target: { value: '001245' } });
    expect(checkInput.value).toBe('001245');

    // Enregistrer
    fireEvent.click(screen.getByText('Enregistrer'));

    expect(mockSaveTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'daily',
      label: 'Paiement artisan',
      amount: 150,
      paymentMethod: 'Chèque',
      checkNumber: '001245'
    }));
  });

  it('efface le numéro de chèque si l’utilisateur change pour un autre moyen de paiement', async () => {
    render(<CurrentExpenses />);

    fireEvent.click(screen.getByText('Ajouter une dépense'));
    const paymentSelect = screen.getByTestId('payment-method-select');

    // Sélectionner Chèque et renseigner un numéro
    fireEvent.change(paymentSelect, { target: { value: 'Chèque' } });
    const checkInput = screen.getByTestId('check-number-input');
    fireEvent.change(checkInput, { target: { value: '004589' } });

    // Changer pour Carte bancaire
    fireEvent.change(paymentSelect, { target: { value: 'Carte bancaire' } });
    expect(screen.queryByTestId('check-number-group')).toBeNull();

    // Remplir les autres champs obligatoires et enregistrer
    const modalForm = screen.getByText('Enregistrer').closest('form')!;
    const dateInput = modalForm.querySelector('input[type="date"]') as HTMLInputElement;
    const amountInput = modalForm.querySelector('input[role="spinbutton"], input[type="number"]') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: `${currentMonth}-11` } });
    fireEvent.change(screen.getByPlaceholderText(/Ex: Courses/i), { target: { value: 'Supermarché' } });
    fireEvent.change(amountInput, { target: { value: '45.00' } });

    fireEvent.click(screen.getByText('Enregistrer'));

    // Le numéro de chèque ne doit pas avoir été sauvegardé
    expect(mockSaveTransaction).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'Carte bancaire'
    }));
    const savedArg = (mockSaveTransaction as any).mock.calls[0][0];
    expect(savedArg.checkNumber).toBeUndefined();
  });

  it('restitue fidèlement le moyen de paiement et le numéro de chèque lors de la modification', () => {
    mockExpenses = [
      {
        id: 'tx-cheque',
        date: `${currentMonth}-08`,
        label: 'Facture Plombier',
        amount: 220.0,
        status: 'pending',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily',
        paymentMethod: 'Chèque',
        checkNumber: '000789'
      }
    ];

    render(<CurrentExpenses />);

    // Clic sur le bouton d'édition (premier bouton Edit2)
    const editBtns = screen.getAllByRole('button').filter(b => b.className.includes('btn-icon'));
    fireEvent.click(editBtns[0]);

    // Vérifier les valeurs dans le modal ouvert
    const paymentSelect = screen.getByTestId('payment-method-select') as HTMLSelectElement;
    expect(paymentSelect.value).toBe('Chèque');

    const checkInput = screen.getByTestId('check-number-input') as HTMLInputElement;
    expect(checkInput.value).toBe('000789');
  });

  it('affiche discrètement le moyen de paiement et le numéro de chèque dans le tableau', () => {
    mockExpenses = [
      {
        id: 'tx-carte',
        date: `${currentMonth}-02`,
        label: 'Carrefour Express',
        amount: 25.0,
        status: 'cleared',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily',
        paymentMethod: 'Carte bancaire'
      },
      {
        id: 'tx-cheque',
        date: `${currentMonth}-03`,
        label: 'Médecin spécialiste',
        amount: 60.0,
        status: 'cleared',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily',
        paymentMethod: 'Chèque',
        checkNumber: '009876'
      }
    ];

    render(<CurrentExpenses />);

    // Carte bancaire
    const badgeCarte = screen.getByTestId('payment-method-badge-tx-carte');
    expect(badgeCarte.textContent).toContain('Carte bancaire');

    // Chèque avec numéro
    const badgeCheque = screen.getByTestId('payment-method-badge-tx-cheque');
    expect(badgeCheque.textContent).toContain('Chèque n° 009876');
  });

  it('conserve une parfaite rétrocompatibilité avec les dépenses historiques sans moyen de paiement', () => {
    render(<CurrentExpenses />);

    // L'opération historique s'affiche sans badge de paiement et sans erreur
    expect(screen.getByText('Courses historiques')).toBeDefined();
    expect(screen.queryByTestId('payment-method-badge-tx-history')).toBeNull();

    // Cliquer sur édition de cette dépense historique
    const editBtns = screen.getAllByRole('button').filter(b => b.className.includes('btn-icon'));
    fireEvent.click(editBtns[0]);

    const paymentSelect = screen.getByTestId('payment-method-select') as HTMLSelectElement;
    expect(paymentSelect.value).toBe('');
    expect(screen.queryByTestId('check-number-group')).toBeNull();
  });

  it('préserve la neutralité financière : les totaux et calculs budgétaires restent identiques', () => {
    mockExpenses = [
      {
        id: 'tx-1',
        date: `${currentMonth}-02`,
        label: 'Courses 1',
        amount: 80.0,
        status: 'cleared',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily',
        paymentMethod: 'Carte bancaire'
      },
      {
        id: 'tx-2',
        date: `${currentMonth}-03`,
        label: 'Courses 2',
        amount: 40.0,
        status: 'pending',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        type: 'daily',
        paymentMethod: 'Chèque',
        checkNumber: '001122'
      }
    ];

    render(<CurrentExpenses />);

    // Total mensuel = 80 + 40 = 120,00 €
    expect(screen.getByText('120,00 €')).toBeDefined();
  });
});
