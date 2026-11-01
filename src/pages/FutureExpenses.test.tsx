// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import FutureExpenses, { isFutureExpense, getLocalTodayString, formatMonthTitle, formatDateDisplay, addMonthsToKey } from './FutureExpenses';
import type { Transaction, Category, Account } from '../db/database';

let mockTransactions: Transaction[] = [];
let mockCategories: Category[] = [];
let mockAccounts: Account[] = [];
const mockSaveTransaction = vi.fn().mockImplementation(async (item: Transaction) => item);
const mockDeleteTransaction = vi.fn().mockResolvedValue(true);

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: mockCategories,
    accounts: mockAccounts,
    transactions: mockTransactions,
    saveTransaction: mockSaveTransaction,
    deleteTransaction: mockDeleteTransaction,
    refreshAll: vi.fn(),
  })
}));

describe('FutureExpenses - Logique de sélection (isFutureExpense)', () => {
  const today = '2026-11-01';

  it('inclut une dépense journalière d\'un mois futur et statut planned ou pending', () => {
    const txPlanned: Transaction = {
      id: 'tx-1',
      date: '2026-12-15',
      label: 'Assurance',
      amount: 150,
      status: 'planned',
      accountId: 'acc-1',
      type: 'daily'
    };
    const txPending: Transaction = {
      id: 'tx-2',
      date: '2027-01-01',
      label: 'Contrôle technique',
      amount: 80,
      status: 'pending',
      accountId: 'acc-1',
      type: 'daily'
    };

    expect(isFutureExpense(txPlanned, today)).toBe(true);
    expect(isFutureExpense(txPending, today)).toBe(true);
  });

  it('exclut une dépense du mois en cours même avec statut planned ou pending', () => {
    const txThisMonth: Transaction = {
      id: 'tx-this-month',
      date: '2026-11-15',
      label: 'Facture de ce mois',
      amount: 50,
      status: 'planned',
      accountId: 'acc-1',
      type: 'daily'
    };

    expect(isFutureExpense(txThisMonth, today)).toBe(false);
  });

  it('exclut les dépenses ayant le statut cleared ou disabled même si leur date est future', () => {
    const txCleared: Transaction = {
      id: 'tx-cleared',
      date: '2026-11-20',
      label: 'Payée d\'avance',
      amount: 100,
      status: 'cleared',
      accountId: 'acc-1',
      type: 'daily'
    };
    const txDisabled: Transaction = {
      id: 'tx-disabled',
      date: '2026-11-20',
      label: 'Annulée',
      amount: 100,
      status: 'disabled',
      accountId: 'acc-1',
      type: 'daily'
    };

    expect(isFutureExpense(txCleared, today)).toBe(false);
    expect(isFutureExpense(txDisabled, today)).toBe(false);
  });

  it('exclut les dépenses récurrentes (templateId ou recurrenceDay)', () => {
    const txRecurring1: Transaction = {
      id: 'tx-rec1',
      date: '2026-11-15',
      label: 'Loyer récurrent',
      amount: 600,
      status: 'planned',
      accountId: 'acc-1',
      type: 'daily',
      templateId: 'tmpl-123'
    };
    const txRecurring2: Transaction = {
      id: 'tx-rec2',
      date: '2026-11-15',
      label: 'Abonnement',
      amount: 30,
      status: 'planned',
      accountId: 'acc-1',
      type: 'daily',
      recurrenceDay: 15
    };

    expect(isFutureExpense(txRecurring1, today)).toBe(false);
    expect(isFutureExpense(txRecurring2, today)).toBe(false);
  });

  it('exclut tous les types autres que daily (income, fixed_expense, variable_expense, transfer, health_expense, health_reimbursement, loan_payment)', () => {
    const types: Transaction['type'][] = ['income', 'fixed_expense', 'variable_expense', 'transfer', 'health_expense', 'health_reimbursement', 'loan_payment'];
    types.forEach(type => {
      const tx: Transaction = {
        id: `tx-${type}`,
        date: '2026-12-01',
        label: `Opération ${type}`,
        amount: 200,
        status: 'planned',
        accountId: 'acc-1',
        type
      };
      expect(isFutureExpense(tx, today)).toBe(false);
    });
  });

  it('inclut une dépense passée UNIQUEMENT si expectedDate est renseigné (dépense planifiée en retard)', () => {
    const txOverdue: Transaction = {
      id: 'tx-overdue',
      date: '2026-10-15',
      label: 'Dépense prévue en retard',
      amount: 120,
      status: 'planned',
      accountId: 'acc-1',
      type: 'daily',
      expectedDate: '2026-10-15'
    };

    expect(isFutureExpense(txOverdue, today)).toBe(true);
  });

  it('exclut formellement une dépense passée ordinaire sans expectedDate même si en attente', () => {
    const txPastOrdinary: Transaction = {
      id: 'tx-past-ord',
      date: '2026-10-15',
      label: 'Dépense courante oubliée',
      amount: 45,
      status: 'pending',
      accountId: 'acc-1',
      type: 'daily'
      // expectedDate non renseigné
    };

    expect(isFutureExpense(txPastOrdinary, today)).toBe(false);
  });
});

describe('FutureExpenses - Fonctions utilitaires', () => {
  it('formate correctement le titre d\'un mois en français', () => {
    expect(formatMonthTitle('2026-11')).toBe('Novembre 2026');
    expect(formatMonthTitle('2027-01')).toBe('Janvier 2027');
  });

  it('formate correctement la date en DD/MM/YYYY', () => {
    expect(formatDateDisplay('2026-11-25')).toBe('25/11/2026');
    expect(formatDateDisplay('2027-03-05')).toBe('05/03/2027');
  });

  it('calcule correctement la clé de fin d\'horizon sur N mois', () => {
    expect(addMonthsToKey('2026-11', 12)).toBe('2027-10');
    expect(addMonthsToKey('2026-01', 12)).toBe('2026-12');
  });
});

describe('FutureExpenses - Composant de page', () => {
  const today = getLocalTodayString();
  const currentMonthKey = today.slice(0, 7);
  // Générer des dates dynamiques futures et passées
  const [currYearStr, currMonthStr] = currentMonthKey.split('-');
  const currYear = parseInt(currYearStr, 10);
  const currMonth = parseInt(currMonthStr, 10);

  const nextMonthKey = currMonth === 12 
    ? `${currYear + 1}-01` 
    : `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
  
  const inTwoMonthsKey = currMonth >= 11
    ? `${currYear + 1}-${String(currMonth + 2 - 12).padStart(2, '0')}`
    : `${currYear}-${String(currMonth + 2).padStart(2, '0')}`;

  const pastDateStr = '2020-05-15';

  beforeEach(() => {
    vi.clearAllMocks();

    mockCategories = [
      { id: 'cat-auto', name: 'Véhicule', type: 'daily', isArchived: false },
      { id: 'cat-home', name: 'Logement', type: 'daily', isArchived: false }
    ];

    mockAccounts = [
      { id: 'acc-main', name: 'Compte Courant', type: 'checking', initialBalance: 2000, referenceDate: '2026-01-01' },
      { id: 'acc-sec', name: 'Livret A', type: 'savings', initialBalance: 5000, referenceDate: '2026-01-01' }
    ];

    mockTransactions = [
      // 1. Dépense future mois prochain
      {
        id: 'tx-fut-1',
        date: `${nextMonthKey}-10`,
        label: 'Entretien chaudière',
        amount: 140.0,
        status: 'planned',
        categoryId: 'cat-home',
        accountId: 'acc-main',
        type: 'daily',
        expectedDate: `${nextMonthKey}-10`
      },
      // 2. Dépense future dans 2 mois
      {
        id: 'tx-fut-2',
        date: `${inTwoMonthsKey}-20`,
        label: 'Pneus hiver',
        amount: 320.0,
        status: 'pending',
        categoryId: 'cat-auto',
        accountId: 'acc-main',
        type: 'daily',
        expectedDate: `${inTwoMonthsKey}-20`
      },
      // 3. Dépense en retard (passée avec expectedDate)
      {
        id: 'tx-overdue',
        date: pastDateStr,
        label: 'Contrôle technique en retard',
        amount: 85.0,
        status: 'planned',
        categoryId: 'cat-auto',
        accountId: 'acc-main',
        type: 'daily',
        expectedDate: pastDateStr
      },
      // 4. Dépense passée ordinaire (expectedDate ABSENT) -> DOIT ÊTRE EXCLUE
      {
        id: 'tx-past-ordinary',
        date: pastDateStr,
        label: 'Restaurant passé ordinaire',
        amount: 45.0,
        status: 'pending',
        categoryId: 'cat-auto',
        accountId: 'acc-main',
        type: 'daily'
      },
      // 5. Dépense future réglée (cleared) -> DOIT ÊTRE EXCLUE
      {
        id: 'tx-cleared',
        date: `${nextMonthKey}-15`,
        label: 'Abonnement déjà réglé',
        amount: 25.0,
        status: 'cleared',
        categoryId: 'cat-home',
        accountId: 'acc-main',
        type: 'daily'
      },
      // 6. Charge fixe -> DOIT ÊTRE EXCLUE
      {
        id: 'tx-fixed',
        date: `${nextMonthKey}-01`,
        label: 'Loyer mensuel',
        amount: 700.0,
        status: 'planned',
        categoryId: 'cat-home',
        accountId: 'acc-main',
        type: 'fixed_expense'
      }
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('affiche le titre de la page, la description et les boutons d\'action', () => {
    render(<FutureExpenses />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dépenses futures' })).toBeDefined();
    expect(screen.getByText('Dépenses ponctuelles programmées et échéances à venir')).toBeDefined();
    expect(screen.getByRole('button', { name: /Ajouter une dépense future/i })).toBeDefined();
  });

  it('calcule correctement les indicateurs KPI', () => {
    render(<FutureExpenses />);

    // Total prévisionnel affiché = 140 (fut-1) + 320 (fut-2) + 85 (overdue) = 545,00 €
    // Note: les dépenses exclues (restaurant 45, abonnement 25, loyer 700) ne doivent pas être comptées.
    expect(screen.getByText(/-545,00\s?€/)).toBeDefined();

    // Dépenses en retard : 85,00 € et 1 dépense à régulariser
    expect(screen.getAllByText(/-85,00\s?€/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 dépense à régulariser')).toBeDefined();

    // Total des opérations : 3 (fut-1, fut-2, overdue)
    expect(screen.getByText('3')).toBeDefined();
  });

  it('affiche les dépenses en retard dans le bloc dédié avec la mention "⚠️ Date dépassée"', () => {
    render(<FutureExpenses />);

    const overdueBlock = screen.getByTestId('overdue-expenses-block');
    expect(overdueBlock).toBeDefined();
    expect(within(overdueBlock).getByText('Contrôle technique en retard')).toBeDefined();
    expect(within(overdueBlock).getAllByText(/⚠️ Date dépassée/).length).toBeGreaterThan(0);
    expect(within(overdueBlock).getAllByText(/-85,00\s?€/).length).toBeGreaterThanOrEqual(1);
  });

  it('exclut formellement les opérations non éligibles', () => {
    render(<FutureExpenses />);

    // Restaurant passé ordinaire non éligible
    expect(screen.queryByText('Restaurant passé ordinaire')).toBeNull();
    // Dépense future réglée (cleared) non éligible
    expect(screen.queryByText('Abonnement déjà réglé')).toBeNull();
    // Charge fixe non éligible
    expect(screen.queryByText('Loyer mensuel')).toBeNull();
  });

  it('regroupe les dépenses futures par mois avec libellé, sous-total et nombre d\'opérations', () => {
    render(<FutureExpenses />);

    const group1 = screen.getByTestId(`month-group-${nextMonthKey}`);
    expect(group1).toBeDefined();
    expect(within(group1).getByText(formatMonthTitle(nextMonthKey))).toBeDefined();
    expect(within(group1).getByText('1 opération')).toBeDefined();
    expect(within(group1).getByText('Entretien chaudière')).toBeDefined();
    expect(within(group1).getAllByText(/-140,00\s?€/).length).toBeGreaterThanOrEqual(1);

    const group2 = screen.getByTestId(`month-group-${inTwoMonthsKey}`);
    expect(group2).toBeDefined();
    expect(within(group2).getByText(formatMonthTitle(inTwoMonthsKey))).toBeDefined();
    expect(within(group2).getByText('Pneus hiver')).toBeDefined();
    expect(within(group2).getAllByText(/-320,00\s?€/).length).toBeGreaterThanOrEqual(1);
  });

  it('permet de replier et déplier un groupe de mois au clic sur son en-tête', () => {
    render(<FutureExpenses />);

    const group1 = screen.getByTestId(`month-group-${nextMonthKey}`);
    // Au départ ouvert : 'Entretien chaudière' est présent
    expect(within(group1).getByText('Entretien chaudière')).toBeDefined();

    // Clic sur l'en-tête du groupe
    fireEvent.click(within(group1).getByText(formatMonthTitle(nextMonthKey)));

    // Maintenant replié : 'Entretien chaudière' ne doit plus être dans le DOM
    expect(within(group1).queryByText('Entretien chaudière')).toBeNull();

    // Clic à nouveau pour redéplier
    fireEvent.click(within(group1).getByText(formatMonthTitle(nextMonthKey)));
    expect(within(group1).getByText('Entretien chaudière')).toBeDefined();
  });

  it('filtre par compte bancaire', () => {
    render(<FutureExpenses />);

    const accountSelect = screen.getByTestId('account-filter');
    // Sélectionner un compte sans dépense correspondante (acc-sec)
    fireEvent.change(accountSelect, { target: { value: 'acc-sec' } });

    // Plus aucune dépense affichée (toutes étaient sur acc-main)
    expect(screen.queryByText('Entretien chaudière')).toBeNull();
    expect(screen.queryByText('Pneus hiver')).toBeNull();
    expect(screen.queryByText('Contrôle technique en retard')).toBeNull();

    // Le bouton de réinitialisation apparaît
    const resetBtn = screen.getByTestId('reset-filters-btn');
    expect(resetBtn).toBeDefined();

    // Clic sur réinitialiser
    fireEvent.click(resetBtn);
    expect(screen.getByText('Entretien chaudière')).toBeDefined();
  });

  it('filtre par catégorie', () => {
    render(<FutureExpenses />);

    const catSelect = screen.getByTestId('category-filter');
    // Filtrer sur 'Véhicule' (cat-auto)
    fireEvent.change(catSelect, { target: { value: 'cat-auto' } });

    // Pneus hiver et Contrôle technique sont dans cat-auto
    expect(screen.getByText('Pneus hiver')).toBeDefined();
    expect(screen.getByText('Contrôle technique en retard')).toBeDefined();
    // Entretien chaudière (cat-home) doit être filtré
    expect(screen.queryByText('Entretien chaudière')).toBeNull();
  });

  it('filtre par mois spécifique', () => {
    render(<FutureExpenses />);

    const periodSelect = screen.getByTestId('period-filter');
    // Filtrer sur le mois prochain uniquement
    fireEvent.change(periodSelect, { target: { value: nextMonthKey } });

    expect(screen.getByText('Entretien chaudière')).toBeDefined();
    // Dépense dans 2 mois ne doit pas être affichée
    expect(screen.queryByText('Pneus hiver')).toBeNull();
  });

  it('ouvre la modale en mode ajout au clic sur "Ajouter une dépense future"', () => {
    render(<FutureExpenses />);

    const addBtn = screen.getByRole('button', { name: /Ajouter une dépense future/i });
    fireEvent.click(addBtn);

    // Titre de la modale en mode ajout futur
    expect(screen.getByRole('heading', { level: 2, name: 'Ajouter une dépense future' })).toBeDefined();
  });

  it('ouvre la modale en mode modification au clic sur une dépense', () => {
    render(<FutureExpenses />);

    // Clic sur la ligne de dépense 'Entretien chaudière'
    fireEvent.click(screen.getByText('Entretien chaudière'));

    // Titre de la modale en mode modification
    expect(screen.getByText('Modifier la dépense future')).toBeDefined();
    // Vérifier que le libellé est pré-rempli dans le champ
    const input = screen.getByPlaceholderText(/Ex: Courses, Restaurant.../i) as HTMLInputElement;
    expect(input.value).toBe('Entretien chaudière');
  });

  it('enregistre le passage au statut cleared et disparaît de la page sans affecter l\'historique', async () => {
    const { rerender } = render(<FutureExpenses />);

    // Clic pour modifier 'Entretien chaudière'
    fireEvent.click(screen.getByText('Entretien chaudière'));

    // Sélectionner le statut 'cleared' (Débité)
    const statusSelect = screen.getByDisplayValue('Prévu');
    fireEvent.change(statusSelect, { target: { value: 'cleared' } });

    // Enregistrer
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockSaveTransaction).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-fut-1',
        label: 'Entretien chaudière',
        status: 'cleared'
      }));
    });

    // Mettre à jour la transaction dans les mocks pour simuler la mise à jour serveur
    mockTransactions = mockTransactions.map(t => 
      t.id === 'tx-fut-1' ? { ...t, status: 'cleared' as const } : t
    );

    // Re-rendre la page
    rerender(<FutureExpenses />);

    // 'Entretien chaudière' a désormais disparu de la liste des dépenses futures
    expect(screen.queryByText('Entretien chaudière')).toBeNull();
  });

  it('déplace immédiatement une dépense vers le bon groupe mensuel lors de la modification de sa date', async () => {
    const { rerender } = render(<FutureExpenses />);

    // 'Entretien chaudière' est initialement dans nextMonthKey
    const group1 = screen.getByTestId(`month-group-${nextMonthKey}`);
    expect(within(group1).getByText('Entretien chaudière')).toBeDefined();

    // Clic pour modifier 'Entretien chaudière'
    fireEvent.click(screen.getByText('Entretien chaudière'));

    // Modifier la date pour la reporter dans 2 mois (inTwoMonthsKey-15)
    const newTargetDate = `${inTwoMonthsKey}-15`;
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: newTargetDate } });

    // Enregistrer
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(mockSaveTransaction).toHaveBeenCalledWith(expect.objectContaining({
        id: 'tx-fut-1',
        date: newTargetDate,
        expectedDate: newTargetDate
      }));
    });

    // Simuler la réactivité des données serveur
    mockTransactions = mockTransactions.map(t =>
      t.id === 'tx-fut-1' ? { ...t, date: newTargetDate, expectedDate: newTargetDate } : t
    );

    // Re-rendre
    rerender(<FutureExpenses />);

    // Vérifier que 'Entretien chaudière' n'est plus dans nextMonthKey
    expect(screen.queryByTestId(`month-group-${nextMonthKey}`)).toBeNull();

    // Et qu'elle est maintenant bien dans inTwoMonthsKey aux côtés de Pneus hiver
    const updatedGroup2 = screen.getByTestId(`month-group-${inTwoMonthsKey}`);
    expect(within(updatedGroup2).getByText('Entretien chaudière')).toBeDefined();
    expect(within(updatedGroup2).getByText('Pneus hiver')).toBeDefined();
    expect(within(updatedGroup2).getByText('2 opérations')).toBeDefined();
  });

  it('affiche un état vide convivial lorsqu\'aucune dépense future n\'est programmée', () => {
    mockTransactions = [];
    render(<FutureExpenses />);

    expect(screen.getByText('Aucune dépense future programmée')).toBeDefined();
    expect(screen.getByText(/Planifiez vos dépenses ponctuelles futures/i)).toBeDefined();
  });
});
