// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ExpenseModal from './ExpenseModal';
import type { Category, Account, Transaction } from '../../db/database';

describe('ExpenseModal Component', () => {
  const mockCategories: Category[] = [
    { id: 'cat-1', name: 'Alimentation', type: 'daily', isArchived: false },
    { id: 'cat-2', name: 'Loisirs', type: 'daily', isArchived: false }
  ];

  const mockAccounts: Account[] = [
    { id: 'acc-1', name: 'Compte Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' }
  ];

  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('ne s\'affiche pas si isOpen est false', () => {
    render(
      <ExpenseModal
        isOpen={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    expect(screen.queryByText('Ajouter une dépense')).toBeNull();
  });

  it('affiche le formulaire d\'ajout avec valeurs par défaut quand isOpen est true', () => {
    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    expect(screen.getByText('Ajouter une dépense')).toBeDefined();
    expect(screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i)).toBeDefined();
    expect(screen.getByTestId('payment-method-select')).toBeDefined();
  });

  it('remplit les champs avec la transaction existante en mode modification', () => {
    const existingTx: Transaction = {
      id: 'tx-1',
      date: '2026-10-15',
      label: 'Supermarché',
      amount: 85.5,
      status: 'cleared',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily',
      paymentMethod: 'Chèque',
      checkNumber: '001245',
      notes: 'Courses de la semaine'
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={existingTx}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    expect(screen.getByText('Modifier la dépense')).toBeDefined();
    expect((screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement).value).toBe('Supermarché');
    expect((screen.getByTestId('check-number-input') as HTMLInputElement).value).toBe('001245');
  });

  it('soumet la transaction avec données nettoyées lors de la validation', async () => {
    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i), {
      target: { value: 'Boulangerie' }
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '12.50' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Boulangerie',
        amount: 12.5,
        type: 'daily'
      }));
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('définit expectedDate lorsque isFutureMode est vrai ou la date est future', async () => {
    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
        isFutureMode={true}
        defaultDate="2027-05-10"
        defaultStatus="planned"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i), {
      target: { value: 'Assurance annuelle' }
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '450' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Assurance annuelle',
        amount: 450,
        expectedDate: '2027-05-10',
        status: 'planned'
      }));
    });
  });

  it('ne définit pas expectedDate pour une dépense passée ordinaire sans isFutureMode', async () => {
    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
        defaultDate="2020-01-01"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i), {
      target: { value: 'Ancienne dépense' }
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '25' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
      const savedTx = mockOnSave.mock.calls[0][0];
      expect(savedTx.expectedDate).toBeUndefined();
    });
  });

  it('actualise expectedDate lorsque la date d\'une dépense future existante est modifiée', async () => {
    const existingFutureTx: Transaction = {
      id: 'tx-fut-orig',
      date: '2027-03-15',
      expectedDate: '2027-03-15',
      label: 'Contrôle technique',
      amount: 85,
      status: 'planned',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={existingFutureTx}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    // Modifier la date pour le 2027-04-20
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2027-04-20' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-fut-orig',
        date: '2027-04-20',
        expectedDate: '2027-04-20'
      }));
    });
  });

  it('ne définit aucun expectedDate lorsqu\'on modifie le libellé ou montant d\'une dépense ordinaire passée existante', async () => {
    const existingPastOrdinaryTx: Transaction = {
      id: 'tx-past-ordinary',
      date: '2025-06-10',
      label: 'Courses anciennes',
      amount: 55,
      status: 'pending',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
      // expectedDate absent
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={existingPastOrdinaryTx}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    // Modifier uniquement le libellé et le montant sans toucher à la date passée
    fireEvent.change(screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i), {
      target: { value: 'Courses anciennes corrigées' }
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '62.50' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
      const savedTx = mockOnSave.mock.calls[0][0];
      expect(savedTx.id).toBe('tx-past-ordinary');
      expect(savedTx.label).toBe('Courses anciennes corrigées');
      expect(savedTx.amount).toBe(62.5);
      expect(savedTx.expectedDate).toBeUndefined();
    });
  });

  it('actualise expectedDate lorsqu\'une dépense en retard est reportée à une nouvelle date', async () => {
    const existingOverdueTx: Transaction = {
      id: 'tx-overdue-1',
      date: '2026-08-01',
      expectedDate: '2026-08-01',
      label: 'Facture en retard',
      amount: 110,
      status: 'planned',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={existingOverdueTx}
        categories={mockCategories}
        accounts={mockAccounts}
        isFutureMode={true}
      />
    );

    // Reporter la date au 2027-01-15
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2027-01-15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-overdue-1',
        date: '2027-01-15',
        expectedDate: '2027-01-15'
      }));
    });
  });

  it('préserve expectedDate lorsqu\'on modifie le statut d\'une dépense future sans modifier sa date', async () => {
    const existingFutureTx: Transaction = {
      id: 'tx-status-change',
      date: '2027-06-01',
      expectedDate: '2027-06-01',
      label: 'Abonnement',
      amount: 40,
      status: 'planned',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={existingFutureTx}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    // Modifier le statut de 'planned' vers 'pending'
    const statusSelect = screen.getByDisplayValue('Prévu');
    fireEvent.change(statusSelect, { target: { value: 'pending' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-status-change',
        status: 'pending',
        date: '2027-06-01',
        expectedDate: '2027-06-01'
      }));
    });
  });

  it('attribue expectedDate lorsqu\'une dépense ordinaire passée voit sa date modifiée vers le futur', async () => {
    const pastOrdinaryTx: Transaction = {
      id: 'tx-past-to-future',
      date: '2025-01-01',
      label: 'Projet reporté',
      amount: 200,
      status: 'planned',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
    };

    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={pastOrdinaryTx}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    // Modifier la date pour une date future
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2027-09-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-past-to-future',
        date: '2027-09-01',
        expectedDate: '2027-09-01'
      }));
    });
  });

  it('préserve la saisie du libellé et des montants lorsque categories ou accounts changent de référence en arrière-plan', () => {
    const { rerender } = render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    const labelInput = screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement;
    const amountInput = screen.getByRole('spinbutton') as HTMLInputElement;

    fireEvent.change(labelInput, { target: { value: 'Courses de la semaine' } });
    fireEvent.change(amountInput, { target: { value: '75.50' } });

    expect(labelInput.value).toBe('Courses de la semaine');
    expect(amountInput.value).toBe('75.50');

    // Simulation d'un rafraîchissement ServerDataContext produisant de nouvelles références
    rerender(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={[...mockCategories, { id: 'cat-3', name: 'Transport', type: 'daily', isArchived: false }]}
        accounts={[...mockAccounts]}
      />
    );

    // Vérifier que la saisie de l'utilisateur reste intacte et n'est pas effacée
    expect(labelInput.value).toBe('Courses de la semaine');
    expect(amountInput.value).toBe('75.50');
  });

  it('réinitialise correctement le formulaire lors de la fermeture puis de la réouverture', () => {
    const { rerender } = render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    const labelInput = screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Texte temporaire' } });
    expect(labelInput.value).toBe('Texte temporaire');

    // Fermeture de la modale
    rerender(
      <ExpenseModal
        isOpen={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    // Réouverture de la modale
    rerender(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    const reloadedLabelInput = screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement;
    expect(reloadedLabelInput.value).toBe('');
  });

  it('charge bien les nouvelles données lors du changement de transaction en mode édition', () => {
    const txA: Transaction = {
      id: 'tx-A',
      date: '2026-10-10',
      label: 'Achat Librairie',
      amount: 30,
      status: 'cleared',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      type: 'daily'
    };

    const txB: Transaction = {
      id: 'tx-B',
      date: '2026-10-12',
      label: 'Pharmacie',
      amount: 15,
      status: 'cleared',
      categoryId: 'cat-2',
      accountId: 'acc-1',
      type: 'daily'
    };

    const { rerender } = render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={txA}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    expect((screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement).value).toBe('Achat Librairie');

    // Changement de la transaction éditée vers txB
    rerender(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingTransaction={txB}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );

    expect((screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement).value).toBe('Pharmacie');
  });

  it('préserve le libellé lors de l\'ajout d\'une catégorie à la volée', async () => {
    const onAddCatMock = vi.fn();

    const { rerender } = render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
        onAddCategory={onAddCatMock}
      />
    );

    const labelInput = screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Mon libellé précieux' } });
    expect(labelInput.value).toBe('Mon libellé précieux');

    // Clic sur le bouton d'ajout de catégorie
    const addCatBtn = document.querySelector('button[title="Ajouter une catégorie"]') || document.querySelector('form button.btn-outline');
    expect(addCatBtn).not.toBeNull();
    fireEvent.click(addCatBtn!);
    expect(onAddCatMock).toHaveBeenCalledTimes(1);

    // Même si categories est ensuite mis à jour par le parent :
    rerender(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={[...mockCategories, { id: 'cat-new', name: 'Nouvelle Catégorie', type: 'daily', isArchived: false }]}
        accounts={mockAccounts}
        onAddCategory={onAddCatMock}
      />
    );

    expect((screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement).value).toBe('Mon libellé précieux');
  });

  it('supporte le mode standard (Dépenses) et le mode futur (Dépenses futures) avec les bons statuts par défaut', () => {
    // 1. Mode Dépenses courantes (standard)
    const { unmount } = render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
      />
    );
    expect((screen.getByDisplayValue('Débité') as HTMLSelectElement).value).toBe('cleared');
    unmount();

    // 2. Mode Dépenses futures
    render(
      <ExpenseModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        categories={mockCategories}
        accounts={mockAccounts}
        isFutureMode={true}
        defaultStatus="planned"
      />
    );
    expect((screen.getByDisplayValue('Prévu') as HTMLSelectElement).value).toBe('planned');
  });
});
