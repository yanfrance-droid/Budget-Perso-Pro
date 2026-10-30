// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import Savings from './Savings';

let mockSavings: any[] = [];
let mockAccounts: any[] = [];
let mockCategories: any[] = [];
let mockAllTransactions: any[] = [];
let mockRecurrenceTemplates: any[] = [];

export const mockSaveAccount = vi.fn().mockImplementation(async (item: any) => item);
export const mockDeleteAccount = vi.fn().mockResolvedValue(true);
export const mockSaveCategory = vi.fn().mockImplementation(async (item: any) => item);
export const mockSaveTransaction = vi.fn().mockImplementation(async (item: any) => item);
export const mockDeleteTransaction = vi.fn().mockResolvedValue(true);
export const mockSaveRecurrenceTemplate = vi.fn().mockImplementation(async (item: any) => item);
export const mockDeleteRecurrenceTemplate = vi.fn().mockResolvedValue(true);

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    accounts: mockAccounts,
    categories: mockCategories,
    transactions: mockSavings.length > 0 ? mockSavings : mockAllTransactions,
    recurrenceTemplates: mockRecurrenceTemplates,
    incomePayers: [],
    saveAccount: mockSaveAccount,
    deleteAccount: mockDeleteAccount,
    saveCategory: mockSaveCategory,
    saveTransaction: mockSaveTransaction,
    deleteTransaction: mockDeleteTransaction,
    saveRecurrenceTemplate: mockSaveRecurrenceTemplate,
    deleteRecurrenceTemplate: mockDeleteRecurrenceTemplate,
    generateMonthlyOccurrences: vi.fn().mockResolvedValue({ success: true }),
    updateTransactionStatus: vi.fn().mockResolvedValue({ success: true }),
    refreshAll: vi.fn(),
  })
}));

describe('Savings component - Category management', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockCategories = [
      { id: 'cat-sav-1', name: 'Livret A', type: 'transfer', isArchived: false },
      { id: 'cat-sav-archived', name: 'Vieux PEL', type: 'transfer', isArchived: true }
    ];
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livret', name: 'Livret A', type: 'savings', initialBalance: 500 }
    ];
    mockSavings = [];
    mockAllTransactions = [];
    mockRecurrenceTemplates = [];
  });

  it('renders category options and preserves archived category if previously selected', () => {
    render(<Savings />);
    
    // Open add modal
    const addBtn = screen.getByRole('button', { name: /Ajouter une opération d'épargne/i });
    fireEvent.click(addBtn);

    const selects = screen.getAllByRole('combobox');
    // Inside the modal, the category select contains "Sélectionner une catégorie..."
    const categorySelect = selects.find(s => s.textContent?.includes('Sélectionner une catégorie...'))!;
    expect(categorySelect).toBeDefined();

    // The non-archived category is present
    expect(categorySelect.textContent).toContain('Livret A');

    // The archived category should not appear unless selected
    expect(categorySelect.textContent).not.toContain('Vieux PEL');
  });

  it('allows creating a new savings category via the + button in the modal', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Assurance Vie');

    render(<Savings />);

    // Open add modal
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une opération d'épargne/i }));

    const categorySelect = screen.getAllByRole('combobox').find(s => s.textContent?.includes('Sélectionner une catégorie...'))!;
    const categoryGroup = categorySelect.closest('.form-group')!;
    const plusBtn = categoryGroup.querySelector('button')!;
    expect(plusBtn).toBeDefined();

    fireEvent.click(plusBtn);

    expect(promptSpy).toHaveBeenCalledWith("Nom de la nouvelle catégorie d'épargne :");
    expect(mockSaveCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Assurance Vie',
        type: 'transfer',
        isArchived: false
      })
    );

    promptSpy.mockRestore();
  });

  it('detects existing duplicate category and prevents adding it again', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Livret A');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);

    fireEvent.click(screen.getByRole('button', { name: /Ajouter une opération d'épargne/i }));

    const categorySelect = screen.getAllByRole('combobox').find(s => s.textContent?.includes('Sélectionner une catégorie...'))!;
    const categoryGroup = categorySelect.closest('.form-group')!;
    const plusBtn = categoryGroup.querySelector('button')!;
    fireEvent.click(plusBtn);

    expect(alertSpy).toHaveBeenCalledWith('La catégorie "Livret A" existe déjà.');
    expect(mockSaveCategory).not.toHaveBeenCalled();

    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('offers to reactivate an archived category with identical name', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Vieux PEL');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<Savings />);

    fireEvent.click(screen.getByRole('button', { name: /Ajouter une opération d'épargne/i }));

    const categorySelect = screen.getAllByRole('combobox').find(s => s.textContent?.includes('Sélectionner une catégorie...'))!;
    const categoryGroup = categorySelect.closest('.form-group')!;
    const plusBtn = categoryGroup.querySelector('button')!;
    fireEvent.click(plusBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      'La catégorie "Vieux PEL" existe déjà mais est archivée. Voulez-vous la réactiver et la sélectionner ?'
    );
    expect(mockSaveCategory).toHaveBeenCalledWith({ id: 'cat-sav-archived', isArchived: false });

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('displays the permanent section "Mes comptes d\'épargne" with individual savings accounts and their real balances', () => {
    // Add transactions:
    // Livret A (acc-livret): initial 500 € + transfer of 200 € cleared = 700 €
    mockAllTransactions = [
      {
        id: 't-1',
        date: '2026-10-05',
        type: 'transfer',
        amount: 200,
        status: 'cleared',
        accountId: 'acc-courant',
        destinationAccountId: 'acc-livret'
      },
      // Planned transaction should NOT impact real balance
      {
        id: 't-2',
        date: '2026-10-15',
        type: 'transfer',
        amount: 150,
        status: 'planned',
        accountId: 'acc-courant',
        destinationAccountId: 'acc-livret'
      }
    ];

    render(<Savings />);

    // Section header is present
    expect(screen.getByRole('heading', { level: 2, name: /Mes comptes d'épargne/i })).toBeDefined();

    const accountsSection = screen.getByRole('heading', { level: 2, name: /Mes comptes d'épargne/i }).closest('.card')!;
    
    // The savings account "Livret A" is displayed inside the section
    expect(accountsSection.textContent).toContain('Livret A');
    expect(accountsSection.textContent).toContain('Solde initial : 500,00 €');

    // Real balance is 700,00 € (500 initial + 200 cleared)
    expect(accountsSection.textContent).toContain('700,00 €');

    // The checking account "Compte Courant" must NOT appear in this savings accounts section
    expect(accountsSection.textContent).not.toContain('Compte Courant');
  });

  it('shows empty message when no savings accounts exist', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 }
    ];

    render(<Savings />);

    const accountsSection = screen.getByRole('heading', { level: 2, name: /Mes comptes d'épargne/i }).closest('.card')!;
    expect(accountsSection.textContent).toContain("Aucun compte d'épargne configuré");
  });

  it('calculates Versements, Retraits, and Épargne nette properly according to transfer direction and status', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 100 },
      { id: 'acc-lep', name: 'LEP', type: 'savings', initialBalance: 50 }
    ];

    mockSavings = [
      // 1. Versement pointé (courant -> Livret A) : 50 €
      {
        id: 'sav-1',
        date: `${currentMonth}-02`,
        type: 'transfer',
        amount: 50,
        status: 'cleared',
        accountId: 'acc-courant',
        destinationAccountId: 'acc-livretA'
      },
      // 2. Versement prévu (courant -> Livret A) : 30 €
      {
        id: 'sav-2',
        date: `${currentMonth}-15`,
        type: 'transfer',
        amount: 30,
        status: 'planned',
        accountId: 'acc-courant',
        destinationAccountId: 'acc-livretA'
      },
      // 3. Retrait pointé (Livret A -> courant) : 20 €
      {
        id: 'sav-3',
        date: `${currentMonth}-10`,
        type: 'transfer',
        amount: 20,
        status: 'cleared',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-courant'
      },
      // 4. Retrait prévu (Livret A -> courant) : 10 €
      {
        id: 'sav-4',
        date: `${currentMonth}-20`,
        type: 'transfer',
        amount: 10,
        status: 'planned',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-courant'
      },
      // 5. Virement interne entre deux livrets (Livret A -> LEP) : 25 € pointé (neutre sur l'épargne nette)
      {
        id: 'sav-5',
        date: `${currentMonth}-12`,
        type: 'transfer',
        amount: 25,
        status: 'cleared',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-lep'
      }
    ];

    render(<Savings />);

    // Versements du mois : 50 + 30 = 80,00 € (Pointés : 50,00 € · Prévus : 30,00 €)
    const versementsCard = screen.getByText('Versements du mois').closest('.card')!;
    expect(versementsCard.textContent).toContain('80,00 €');
    expect(versementsCard.textContent).toContain('Pointés : 50,00 € · Prévus : 30,00 €');

    // Retraits du mois : 20 + 10 = 30,00 € (Pointés : 20,00 € · Prévus : 10,00 €)
    const retraitsCard = screen.getByText('Retraits du mois').closest('.card')!;
    expect(retraitsCard.textContent).toContain('30,00 €');
    expect(retraitsCard.textContent).toContain('Pointés : 20,00 € · Prévus : 10,00 €');

    // 1. La vignette « Épargne nette du mois » a bien été supprimée
    expect(screen.queryByText('Épargne nette du mois')).toBeNull();

    // 2. Vérification des sections séparées
    // Section A : Virements vers l'épargne
    const depositsHeading = screen.getByRole('heading', { level: 2, name: /Virements vers l'épargne/i });
    const depositsSection = depositsHeading.closest('.card')!;
    expect(depositsSection.textContent).toContain('Compte courant → compte d\'épargne (2)');
    expect(depositsSection.textContent).toContain('+50,00 €');
    expect(depositsSection.textContent).toContain('+30,00 €');
    expect(depositsSection.textContent).not.toContain('-20,00 €');

    // Section B : Virements depuis l'épargne
    const withdrawalsHeading = screen.getByRole('heading', { level: 2, name: /Virements depuis l'épargne/i });
    const withdrawalsSection = withdrawalsHeading.closest('.card')!;
    expect(withdrawalsSection.textContent).toContain('Compte d\'épargne → compte courant (2)');
    expect(withdrawalsSection.textContent).toContain('-20,00 €');
    expect(withdrawalsSection.textContent).toContain('-10,00 €');
    expect(withdrawalsSection.textContent).not.toContain('+50,00 €');

    // Section C : Virements entre comptes d'épargne (transferts internes)
    const internalHeading = screen.getByRole('heading', { level: 2, name: /Virements entre comptes d'épargne/i });
    const internalSection = internalHeading.closest('.card')!;
    expect(internalSection.textContent).toContain('Transferts internes (1)');
    expect(internalSection.textContent).toContain('25,00 €');
  });

  it('correctly organizes the 4 transfer categories and excludes checking-to-checking transfers from savings totals', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    mockAccounts = [
      { id: 'acc-courant-principal', name: 'Compte Courant Principal', type: 'checking', initialBalance: 2000 },
      { id: 'acc-courant-secondaire', name: 'Compte Courant Secondaire', type: 'checking', initialBalance: 500 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 1000 },
      { id: 'acc-ldds', name: 'LDDS', type: 'savings', initialBalance: 800 }
    ];

    mockSavings = [
      // 1. Checking -> Savings (Versement épargne)
      {
        id: 'tx-dep',
        date: `${currentMonth}-05`,
        type: 'transfer',
        amount: 200,
        status: 'cleared',
        accountId: 'acc-courant-principal',
        destinationAccountId: 'acc-livretA'
      },
      // 2. Savings -> Checking (Retrait épargne)
      {
        id: 'tx-with',
        date: `${currentMonth}-08`,
        type: 'transfer',
        amount: 50,
        status: 'cleared',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-courant-principal'
      },
      // 3. Checking -> Checking (Virement entre comptes courants)
      {
        id: 'tx-chk-1',
        date: `${currentMonth}-10`,
        type: 'transfer',
        amount: 150,
        status: 'cleared',
        accountId: 'acc-courant-principal',
        destinationAccountId: 'acc-courant-secondaire'
      },
      // 4. Checking -> Checking retour
      {
        id: 'tx-chk-2',
        date: `${currentMonth}-12`,
        type: 'transfer',
        amount: 40,
        status: 'planned',
        accountId: 'acc-courant-secondaire',
        destinationAccountId: 'acc-courant-principal'
      },
      // 5. Savings -> Savings (Virement entre livrets)
      {
        id: 'tx-sav-sav',
        date: `${currentMonth}-15`,
        type: 'transfer',
        amount: 100,
        status: 'cleared',
        accountId: 'acc-livretA',
        destinationAccountId: 'acc-ldds'
      }
    ];

    render(<Savings />);

    // 1. Cartes de synthèse :
    // - Versements : uniquement tx-dep (200 €). tx-chk-1 (150 €) et tx-chk-2 (40 €) ne doivent PAS être inclus !
    const versementsCard = screen.getByText('Versements du mois').closest('.card')!;
    expect(versementsCard.textContent).toContain('200,00 €');
    expect(versementsCard.textContent).not.toContain('350,00 €');

    // - Retraits : uniquement tx-with (50 €).
    const retraitsCard = screen.getByText('Retraits du mois').closest('.card')!;
    expect(retraitsCard.textContent).toContain('50,00 €');

    // 2. Vérification des 4 sections distinctes dans le DOM
    // Section 1 : Virements vers l'épargne
    const s1Heading = screen.getByRole('heading', { level: 2, name: /Virements vers l'épargne/i });
    const s1Card = s1Heading.closest('.card')!;
    expect(s1Card.textContent).toContain('Compte courant → compte d\'épargne (1)');
    expect(s1Card.textContent).toContain('+200,00 €');

    // Section 2 : Virements depuis l'épargne
    const s2Heading = screen.getByRole('heading', { level: 2, name: /Virements depuis l'épargne/i });
    const s2Card = s2Heading.closest('.card')!;
    expect(s2Card.textContent).toContain('Compte d\'épargne → compte courant (1)');
    expect(s2Card.textContent).toContain('-50,00 €');

    // Section 3 : Virements entre comptes courants
    const s3Heading = screen.getByRole('heading', { level: 2, name: /Virements entre comptes courants/i });
    const s3Card = s3Heading.closest('.card')!;
    expect(s3Card.textContent).toContain('Compte courant ⇄ compte courant (2)');
    expect(s3Card.textContent).toContain('150,00 €');
    expect(s3Card.textContent).toContain('40,00 €');

    // Section 4 : Virements entre comptes d'épargne
    const s4Heading = screen.getByRole('heading', { level: 2, name: /Virements entre comptes d'épargne/i });
    const s4Card = s4Heading.closest('.card')!;
    expect(s4Card.textContent).toContain('Transferts internes (1)');
    expect(s4Card.textContent).toContain('100,00 €');
  });
});

describe('Savings component - Clôture et suppression de comptes d\'épargne', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockCategories = [
      { id: 'cat-1', name: 'Épargne générale', type: 'transfer', isArchived: false }
    ];
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 0 },
      { id: 'acc-lep', name: 'LEP', type: 'savings', initialBalance: 0 }
    ];
    mockSavings = [];
    mockAllTransactions = [];
  });

  it('1. Un compte existant sans isClosed reste actif par défaut dans la liste', () => {
    render(<Savings />);
    const activeSection = screen.getByRole('heading', { level: 2, name: /Mes comptes d'épargne/i }).closest('.card')!;
    expect(activeSection.textContent).toContain('Livret A');
    expect(activeSection.textContent).toContain('LEP');
    // La section des comptes clôturés ne doit pas être visible
    expect(screen.queryByText(/Comptes clôturés/i)).toBeNull();
  });

  it('2. Chaque vignette de compte d\'épargne possède un bouton roue dentée ⚙️ avec aria-label explicite ouvrant son panneau latéral dédié', () => {
    render(<Savings />);
    const livretGearBtn = screen.getByRole('button', { name: /Paramètres du compte Livret A/i });
    const lepGearBtn = screen.getByRole('button', { name: /Paramètres du compte LEP/i });

    expect(livretGearBtn).toBeDefined();
    expect(lepGearBtn).toBeDefined();

    // Cliquer sur les paramètres du Livret A ouvre le drawer avec le nom et le statut
    fireEvent.click(livretGearBtn);
    expect(screen.getByRole('heading', { level: 2, name: /Paramètres du compte/i })).toBeDefined();
    expect(screen.getByText('Livret A', { selector: '.drawer-header div' })).toBeDefined();

    // Boutons de clôture et de suppression présents dans le panneau
    expect(screen.getByRole('button', { name: /Clôturer le compte Livret A/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Supprimer définitivement le compte vierge Livret A/i })).toBeDefined();
  });

  it('3. Une clôture avec un solde non nul est bloquée avec message explicatif', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Livret A avec solde initial de 125.40 €
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 125.40 }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const closeBtn = screen.getByRole('button', { name: /Clôturer le compte Livret A/i });
    fireEvent.click(closeBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Le compte Livret A présente un solde de 125,40 €')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('4 & 5. Une clôture avec une opération en cours (planned ou pending) est bloquée', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Transaction planned reliant le LEP
    mockAllTransactions = [
      { id: 'tx-1', type: 'transfer', amount: 50, status: 'planned', accountId: 'acc-courant', destinationAccountId: 'acc-lep' }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte LEP/i }));

    // Bouton de clôture du LEP
    const closeBtn = screen.getByRole('button', { name: /Clôturer le compte LEP/i });
    fireEvent.click(closeBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('possède 1 opération(s) en cours (prévue(s) ou en attente)')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('6 & 7. Une récurrence active utilisant le compte bloque la clôture', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockRecurrenceTemplates = [
      { id: 'tpl-1', type: 'transfer', amount: 30, recurrenceDay: 5, accountId: 'acc-courant', destinationAccountId: 'acc-livretA', startDate: '2026-01', isActive: true }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const closeBtn = screen.getByRole('button', { name: /Clôturer le compte Livret A/i });
    fireEvent.click(closeBtn);

    // Attendre le traitement asynchrone
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('est associé à 1 virement(s) récurrent(s) actif(s)')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('8. Une clôture valide enregistre isClosed: true et closedDate', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockRecurrenceTemplates = [];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const closeBtn = screen.getByRole('button', { name: /Clôturer le compte Livret A/i });
    fireEvent.click(closeBtn);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Confirmez-vous la clôture du compte Livret A ?')
    );
    expect(mockSaveAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'acc-livretA',
      isClosed: true,
      closedBalance: 0
    }));

    confirmSpy.mockRestore();
  });

  it('9 & 10. Le compte clôturé disparaît des sélecteurs actifs et apparaît dans la section "Comptes clôturés"', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 0 },
      { id: 'acc-lep', name: 'LEP', type: 'savings', initialBalance: 0, isClosed: true, closedDate: '2026-10-17', closedBalance: 0 }
    ];

    render(<Savings />);

    // 1. La section active ne contient que le Livret A
    const activeSection = screen.getByRole('heading', { level: 2, name: /Mes comptes d'épargne/i }).closest('.card')!;
    expect(activeSection.textContent).toContain('Livret A');
    expect(activeSection.textContent).not.toContain('LEP');

    // 2. La section "Comptes clôturés" est visible
    const closedHeading = screen.getByRole('heading', { level: 2, name: /Comptes clôturés/i });
    expect(closedHeading).toBeDefined();

    // Cliquer pour déplier la section
    fireEvent.click(closedHeading);
    const closedCard = closedHeading.closest('.card')!;
    expect(closedCard.textContent).toContain('LEP');
    expect(closedCard.textContent).toContain('Clôturé le : 2026-10-17');

    // 3. Dans le formulaire d'ajout, le compte clôturé n'est pas proposé comme compte destinataire
    fireEvent.click(screen.getByRole('button', { name: /Ajouter une opération d'épargne/i }));
    const destSelect = screen.getAllByRole('combobox').find(s => s.textContent?.includes('Sélectionner le compte destinataire...'))!;
    expect(destSelect.textContent).toContain('Livret A');
    expect(destSelect.textContent).not.toContain('LEP');
  });

  it('11. Les transactions historiques conservent les noms et montants d\'origine même avec un compte clôturé', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-lep', name: 'LEP Ancien', type: 'savings', initialBalance: 0, isClosed: true, closedDate: '2026-09-01' }
    ];
    const currentMonth = new Date().toISOString().slice(0, 7);
    mockSavings = [
      {
        id: 'tx-old',
        date: `${currentMonth}-01`,
        type: 'transfer',
        amount: 100,
        status: 'cleared',
        accountId: 'acc-courant',
        destinationAccountId: 'acc-lep',
        notes: 'Versement ancien'
      }
    ];
    mockAllTransactions = [...mockSavings];

    render(<Savings />);
    const row = screen.getByText('Versement ancien').closest('tr')!;
    expect(row.textContent).toContain('Compte Courant');
    expect(row.textContent).toContain('LEP Ancien');
    expect(row.textContent).toContain('+100,00 €');
  });

  it('13 & 14. La suppression d\'un compte avec historique ou solde non nul est bloquée', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Compte avec transaction
    mockAllTransactions = [
      { id: 'tx-1', type: 'transfer', amount: 50, status: 'cleared', accountId: 'acc-courant', destinationAccountId: 'acc-livretA' }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const deleteBtn = screen.getByRole('button', { name: /Supprimer définitivement le compte Livret A \(action protégée\)/i });
    fireEvent.click(deleteBtn);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('possède 1 opération(s) dans son historique et ne peut pas être supprimé définitivement')
    );
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('15. La suppression d\'un compte vierge est possible après confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Livret A et LEP vierges (solde 0, aucune transaction)
    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const deleteBtn = screen.getByRole('button', { name: /Supprimer définitivement le compte vierge Livret A/i });
    fireEvent.click(deleteBtn);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Voulez-vous vraiment supprimer définitivement le compte vierge "Livret A"')
    );
    expect(mockDeleteAccount).toHaveBeenCalledWith('acc-livretA');

    confirmSpy.mockRestore();
  });

  it('16. Le panneau latéral affiche les informations du compte, solde calculé en lecture seule, taux et objectifs facultatifs', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, interestRate: 3, targetAmount: 12000, isClosed: false }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    // Vérifier les champs dans le panneau
    const nameInput = screen.getByLabelText(/Nom du compte/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Livret A');

    const balanceInput = screen.getByLabelText(/Solde initial de départ \(€\)/i) as HTMLInputElement;
    expect(balanceInput.value).toBe('500');

    expect(screen.getByText(/Solde réel calculé \(lecture seule\)/i)).toBeDefined();

    const rateInput = screen.getByLabelText(/Taux d'intérêt annuel/i) as HTMLInputElement;
    expect(rateInput.value).toBe('3');

    const targetInput = screen.getByLabelText(/Objectif d'épargne/i) as HTMLInputElement;
    expect(targetInput.value).toBe('12000');
  });

  it('17. Permet d\'ajouter un nouveau compte d\'épargne avec sous-type via le bouton Nouveau compte', async () => {
    render(<Savings />);
    // Cliquer sur le bouton « Nouveau compte »
    const openAddBtn = screen.getByRole('button', { name: /Nouveau compte d'épargne/i });
    fireEvent.click(openAddBtn);

    // Remplir le formulaire
    const subTypeSelect = screen.getByLabelText(/Type de compte \*/i);
    fireEvent.change(subTypeSelect, { target: { value: 'lep' } });

    const balanceInput = screen.getByLabelText(/Solde initial \(€\) \*/i);
    fireEvent.change(balanceInput, { target: { value: '300' } });

    const rateInput = screen.getByLabelText(/Taux d'intérêt annuel/i);
    fireEvent.change(rateInput, { target: { value: '4' } });

    const targetInput = screen.getByLabelText(/Objectif d'épargne/i);
    fireEvent.change(targetInput, { target: { value: '10000' } });

    // Soumettre la création
    const createBtn = screen.getByRole('button', { name: /Créer le compte/i });
    fireEvent.click(createBtn);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockSaveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'LEP',
        type: 'savings',
        subType: 'lep',
        initialBalance: 300,
        interestRate: 4,
        targetAmount: 10000
      })
    );
  });

  it('18. Sauvegarde uniquement le compte sélectionné dans le panneau et préserve strictement les autres comptes', async () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'livret_a' },
      { id: 'acc-lep', name: 'LEP', type: 'savings', initialBalance: 200, subType: 'lep' }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    // Modifier le solde du Livret A
    const livretBalanceInput = screen.getByLabelText(/Solde initial de départ \(€\)/i);
    fireEvent.change(livretBalanceInput, { target: { value: '650' } });

    // Soumettre l'enregistrement
    const saveBtn = screen.getByRole('button', { name: /Enregistrer les modifications/i });
    fireEvent.click(saveBtn);

    await new Promise(resolve => setTimeout(resolve, 50));

    // Doit avoir appelé saveAccount UNIQUEMENT pour acc-livretA
    expect(mockSaveAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'acc-livretA',
      initialBalance: 650
    }));
    // Ne doit SURTOUT PAS avoir appelé saveAccount pour acc-lep
    expect(mockSaveAccount).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 'acc-lep'
    }));
  });

  it('19. Bloque l\'enregistrement et prévient l\'utilisateur si un solde est vidé ou invalide (sans le transformer en 0)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500 }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    // Vider le solde initial
    const livretBalanceInput = screen.getByLabelText(/Solde initial de départ \(€\)/i);
    fireEvent.change(livretBalanceInput, { target: { value: '' } });

    // Soumettre le formulaire
    const form = livretBalanceInput.closest('form')!;
    fireEvent.submit(form);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('ne peut pas être vide')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('20. Avertit l\'utilisateur en cas de fermeture avec des modifications non enregistrées', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false); // Refuser d'abandonner

    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500 }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    // Modifier le nom
    const nameInput = screen.getByLabelText(/Nom du compte/i);
    fireEvent.change(nameInput, { target: { value: 'Livret A Modifié' } });

    // Tenter de fermer le drawer via la croix
    const closeBtn = screen.getByRole('button', { name: /Fermer le panneau des paramètres/i });
    fireEvent.click(closeBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Des modifications sont en attente')
    );
    // Le panneau reste ouvert car confirm a retourné false
    expect(screen.getByRole('heading', { level: 2, name: /Paramètres du compte/i })).toBeDefined();

    confirmSpy.mockRestore();
  });

  it('20. Affiche en permanence la roue dentée et le taux annuel d\'intérêt sur la vignette (renseigné ou Non renseigné)', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, interestRate: 2.4 },
      { id: 'acc-lep', name: 'LEP', type: 'savings', initialBalance: 200 } // sans interestRate
    ];

    render(<Savings />);

    // Roues dentées toujours présentes
    const livretGearBtn = screen.getByRole('button', { name: /Paramètres du compte Livret A/i });
    const lepGearBtn = screen.getByRole('button', { name: /Paramètres du compte LEP/i });
    expect(livretGearBtn).toBeDefined();
    expect(lepGearBtn).toBeDefined();
    expect(livretGearBtn.className).toContain('account-card-action-btn');

    // Taux annuel sur Livret A (2,40 %)
    expect(screen.getByText(/Taux annuel : 2,40 %/i)).toBeDefined();

    // Taux annuel sur LEP (Non renseigné)
    expect(screen.getByText(/Taux annuel : Non renseigné/i)).toBeDefined();
  });

  it('21. Propose tous les types prédéfinis requis dans le formulaire Nouveau compte et dans le volet Paramètres', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'livret_a' }
    ];

    render(<Savings />);

    // 1. Dans la modale Nouveau compte
    const openAddBtn = screen.getByRole('button', { name: /Nouveau compte d'épargne/i });
    fireEvent.click(openAddBtn);

    const subTypeSelect = screen.getByLabelText(/Type de compte \*/i) as HTMLSelectElement;
    const modalOptions = Array.from(subTypeSelect.options).map(o => o.text);

    const expectedLabels = [
      'Livret A',
      'LEP — Livret d’épargne populaire',
      'LDDS — Livret de développement durable et solidaire',
      'Livret jeune',
      'Livret bancaire',
      'PEL — Plan d’épargne logement',
      'CEL — Compte épargne logement',
      'Assurance-vie',
      'PEA — Plan d’épargne en actions',
      'Compte à terme',
      'PEE — Plan d’épargne entreprise',
      'PERCO',
      'PERECO — Plan d’épargne retraite d’entreprise collectif',
      'Autre / Personnalisé'
    ];

    expectedLabels.forEach(label => {
      expect(modalOptions).toContain(label);
    });

    // Fermer la modale
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));

    // 2. Dans le volet latéral des paramètres
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));
    const drawerSubTypeSelect = screen.getByLabelText(/Type de compte/i) as HTMLSelectElement;
    const drawerOptions = Array.from(drawerSubTypeSelect.options).map(o => o.text);

    expectedLabels.forEach(label => {
      expect(drawerOptions).toContain(label);
    });
  });

  it('22. Exige un type personnalisé non vide lors de la création d\'un compte avec Autre / Personnalisé', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Nouveau compte d'épargne/i }));

    const subTypeSelect = screen.getByLabelText(/Type de compte \*/i);
    fireEvent.change(subTypeSelect, { target: { value: 'other' } });

    // Le champ "Type de compte personnalisé *" apparaît
    const customSubTypeInput = screen.getByLabelText(/Type de compte personnalisé \*/i);
    expect(customSubTypeInput).toBeDefined();

    // Laisser le champ vide et tenter de créer
    fireEvent.change(customSubTypeInput, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer le compte/i }));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Veuillez renseigner le type de compte personnalisé')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();

    // Renseigner un type personnalisé valide
    fireEvent.change(customSubTypeInput, { target: { value: 'Livret Zesto' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer le compte/i }));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockSaveAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Livret Zesto',
        subType: 'Livret Zesto',
        type: 'savings'
      })
    );

    alertSpy.mockRestore();
  });

  it('23. Permet de modifier un compte vers un type personnalisé, exige le libellé et le restitue après réouverture', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'livret_a' }
    ];

    const { rerender } = render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const drawerSubTypeSelect = screen.getByLabelText(/Type de compte/i);
    fireEvent.change(drawerSubTypeSelect, { target: { value: 'other' } });

    // Champ personnalisé présent
    const customInput = screen.getByLabelText(/Type de compte personnalisé \*/i);
    expect(customInput).toBeDefined();

    // Soumettre à vide -> refus
    fireEvent.change(customInput, { target: { value: '' } });
    fireEvent.submit(customInput.closest('form')!);

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Veuillez renseigner le type de compte personnalisé')
    );
    expect(mockSaveAccount).not.toHaveBeenCalled();

    // Renseigner le type personnalisé
    fireEvent.change(customInput, { target: { value: 'Super Livret Crypto' } });
    fireEvent.submit(customInput.closest('form')!);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockSaveAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'acc-livretA',
      subType: 'Super Livret Crypto'
    }));

    // Simuler la réouverture du compte qui possède maintenant un subType personnalisé
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'Super Livret Crypto' }
    ];

    cleanup();
    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    // Le select doit être positionné sur 'other'
    const reopenedSubTypeSelect = document.getElementById('drawer-subtype-acc-livretA') as HTMLSelectElement;
    expect(reopenedSubTypeSelect.value).toBe('other');

    // Le champ personnalisé doit contenir la valeur enregistrée
    const reopenedCustomInput = screen.getByLabelText(/Type de compte personnalisé \*/i) as HTMLInputElement;
    expect(reopenedCustomInput.value).toBe('Super Livret Crypto');

    alertSpy.mockRestore();
  });

  it('24. Préserve strictement le solde initial, le taux annuel et les autres champs lors du changement de type', async () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-pel', name: 'Mon PEL', type: 'savings', initialBalance: 2500, interestRate: 2.25, targetAmount: 20000, subType: 'pel' }
    ];

    render(<Savings />);
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Mon PEL/i }));

    // Changer uniquement le type de compte vers assurance_vie
    const drawerSubTypeSelect = document.getElementById('drawer-subtype-acc-pel') as HTMLSelectElement;
    fireEvent.change(drawerSubTypeSelect, { target: { value: 'assurance_vie' } });

    fireEvent.submit(drawerSubTypeSelect.closest('form')!);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockSaveAccount).toHaveBeenCalledWith(expect.objectContaining({
      id: 'acc-pel',
      name: 'Mon PEL',
      subType: 'assurance_vie',
      initialBalance: 2500,
      interestRate: 2.25,
      targetAmount: 20000
    }));
  });

  it('25. Rétrocompatibilité : charge correctement les anciens comptes sans subType ou avec ancien libellé', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-old-pel', name: 'Mon PEL Logement', type: 'savings', initialBalance: 1500 }, // pas de subType, contient 'pel'
      { id: 'acc-old-custom', name: 'Compte Rare', type: 'savings', initialBalance: 400, subType: 'AncienTypeInconnu' }
    ];

    render(<Savings />);

    // Ouvrir le compte avec nom PEL
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Mon PEL Logement/i }));
    const selectPel = document.getElementById('drawer-subtype-acc-old-pel') as HTMLSelectElement;
    expect(selectPel.value).toBe('pel');

    // Fermer
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));

    // Ouvrir le compte rare
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Compte Rare/i }));
    const selectRare = document.getElementById('drawer-subtype-acc-old-custom') as HTMLSelectElement;
    expect(selectRare.value).toBe('other');
    const customRare = screen.getByLabelText(/Type de compte personnalisé \*/i) as HTMLInputElement;
    expect(customRare.value).toBe('AncienTypeInconnu');
  });

  it('26. Formulaire Opération d\'épargne : affiche les types de compte prédéfinis et personnalisés dans Compte source et Compte destinataire pour virements ponctuels et récurrents', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant Principal', type: 'checking', subType: 'checking', initialBalance: 1500 },
      { id: 'acc-livretA', name: 'Mon Livret A', type: 'savings', subType: 'livret_a', initialBalance: 1000 },
      { id: 'acc-pea', name: 'Bourse PEA', type: 'savings', subType: 'pea', initialBalance: 5000 },
      { id: 'acc-custom', name: 'Crypto Safe', type: 'savings', subType: 'Coffre Crypto Décentralisé', initialBalance: 200 },
      { id: 'acc-closed', name: 'Ancien Compte', type: 'savings', subType: 'livret_a', initialBalance: 0, isClosed: true }
    ];

    render(<Savings />);

    // Ouvrir la modale "Ajouter une opération d'épargne"
    const addOpBtn = screen.getByRole('button', { name: /Ajouter une opération d'épargne/i });
    fireEvent.click(addOpBtn);

    // MODE 1 : Virement ponctuel (par défaut)
    const sourceSelect = screen.getByLabelText(/Compte source \(débité\)/i) as HTMLSelectElement;
    let sourceOptions = Array.from(sourceSelect.options).map(o => o.text);

    expect(sourceOptions).toContain('Compte Courant Principal (Compte courant principal)');
    expect(sourceOptions).toContain('Mon Livret A (Livret A)');
    expect(sourceOptions).toContain('Bourse PEA (PEA — Plan d’épargne en actions)');
    expect(sourceOptions).toContain('Crypto Safe (Coffre Crypto Décentralisé)');
    // Le compte clôturé ne doit PAS être sélectionnable pour un nouveau virement
    expect(sourceOptions).not.toContain('Ancien Compte (Livret A) (clôturé)');

    // Vérifier les options du Compte destinataire (crédité)
    const destSelect = screen.getByLabelText(/Compte destinataire \(crédité\)/i) as HTMLSelectElement;
    let destOptions = Array.from(destSelect.options).map(o => o.text);

    expect(destOptions).toContain('Mon Livret A (Livret A)');
    expect(destOptions).toContain('Bourse PEA (PEA — Plan d’épargne en actions)');
    expect(destOptions).toContain('Crypto Safe (Coffre Crypto Décentralisé)');
    expect(destOptions).not.toContain('Ancien Compte (Livret A) (clôturé)');

    // MODE 2 : Virement mensuel récurrent
    const recurringRadio = screen.getByLabelText(/Mensuel récurrent/i);
    fireEvent.click(recurringRadio);

    // Vérifier que les sélecteurs sont toujours présents et fonctionnels avec les mêmes comptes
    const sourceSelectRecurring = screen.getByLabelText(/Compte source \(débité\)/i) as HTMLSelectElement;
    sourceOptions = Array.from(sourceSelectRecurring.options).map(o => o.text);
    expect(sourceOptions).toContain('Compte Courant Principal (Compte courant principal)');
    expect(sourceOptions).toContain('Mon Livret A (Livret A)');
    expect(sourceOptions).toContain('Bourse PEA (PEA — Plan d’épargne en actions)');
    expect(sourceOptions).toContain('Crypto Safe (Coffre Crypto Décentralisé)');

    const destSelectRecurring = screen.getByLabelText(/Compte destinataire \(crédité\)/i) as HTMLSelectElement;
    destOptions = Array.from(destSelectRecurring.options).map(o => o.text);
    expect(destOptions).toContain('Mon Livret A (Livret A)');
    expect(destOptions).toContain('Bourse PEA (PEA — Plan d’épargne en actions)');
    expect(destOptions).toContain('Crypto Safe (Coffre Crypto Décentralisé)');

    // Vérifier le changement de sélection source : exclut la nouvelle source de la liste destinataire
    fireEvent.change(sourceSelectRecurring, { target: { value: 'acc-livretA' } });
    const updatedDestOptions = Array.from((screen.getByLabelText(/Compte destinataire \(crédité\)/i) as HTMLSelectElement).options).map(o => o.text);
    expect(updatedDestOptions).not.toContain('Mon Livret A (Livret A)');
    expect(updatedDestOptions).toContain('Bourse PEA (PEA — Plan d’épargne en actions)');
  });

  it('27. Paramètres du compte : affiche « Clôturer le compte » et « Supprimer définitivement » avec un fond rouge plein et du texte/icône blanc', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'livret_a' },
      { id: 'acc-virgin', name: 'Livret Vierge', type: 'savings', initialBalance: 0, subType: 'livret_a' }
    ];

    render(<Savings />);

    // 1. Bouton Clôturer le compte sur Livret A
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret A/i }));

    const closeBtn = screen.getByRole('button', { name: /Clôturer le compte Livret A/i });
    expect(closeBtn).toBeDefined();

    // Fond rouge plein #dc2626, texte blanc #ffffff, bordure #dc2626
    expect(closeBtn.style.backgroundColor).toBe('rgb(220, 38, 38)');
    expect(closeBtn.style.color).toBe('rgb(255, 255, 255)');
    expect(closeBtn.style.borderColor).toBe('rgb(220, 38, 38)');
    const labelSpan = closeBtn.querySelector('span');
    expect(labelSpan?.textContent).toBe('Clôturer le compte');
    expect(labelSpan?.style.color).toBe('rgb(255, 255, 255)');

    // 2. Bouton Supprimer définitivement sur Livret A (avec historique/solde non vierge)
    const deleteBtn = screen.getByRole('button', { name: /Supprimer définitivement le compte Livret A/i });
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn.style.backgroundColor).toBe('rgb(220, 38, 38)');
    expect(deleteBtn.style.color).toBe('rgb(255, 255, 255)');
    expect(deleteBtn.style.borderColor).toBe('rgb(220, 38, 38)');

    // Fermer le tiroir
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));

    // 3. Bouton Supprimer définitivement sur Livret Vierge
    fireEvent.click(screen.getByRole('button', { name: /Paramètres du compte Livret Vierge/i }));
    const deleteVirginBtn = screen.getByRole('button', { name: /Supprimer définitivement le compte vierge Livret Vierge/i });
    expect(deleteVirginBtn).toBeDefined();
    expect(deleteVirginBtn.style.backgroundColor).toBe('rgb(220, 38, 38)');
    expect(deleteVirginBtn.style.color).toBe('rgb(255, 255, 255)');
    expect(deleteVirginBtn.style.borderColor).toBe('rgb(220, 38, 38)');
  });

  it('28. Vignettes : affiche clairement le type réel sous le nom du compte (prédéfini ou personnalisé) pour les comptes actifs et clôturés', () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Principal', type: 'checking', initialBalance: 1500, subType: 'checking' },
      { id: 'acc-livretA', name: 'Livret Bleu', type: 'savings', initialBalance: 500, subType: 'livret_a' },
      { id: 'acc-pea', name: 'PEA Croissance', type: 'savings', initialBalance: 1200, subType: 'pea' },
      { id: 'acc-crypto', name: 'Coffre Crypto', type: 'savings', initialBalance: 300, subType: 'Coffre Décentralisé' },
      { id: 'acc-closed', name: 'Vieux PEL', type: 'savings', initialBalance: 0, subType: 'pel', isClosed: true, closedDate: '2026-01-15' }
    ];

    render(<Savings />);

    // Vérifier les types affichés sur les vignettes actives
    expect(screen.getByText('Type : Livret A')).toBeDefined();
    expect(screen.getByText('Type : PEA — Plan d’épargne en actions')).toBeDefined();
    expect(screen.getByText('Type : Coffre Décentralisé')).toBeDefined();

    // Déplier les comptes clôturés et vérifier le type
    fireEvent.click(screen.getByText(/Comptes clôturés/i));
    expect(screen.getByText('Type : PEL — Plan d’épargne logement')).toBeDefined();
  });

  it('29. Sécurisation virement : refuse le virement si le compte source est inexistant en base sans créer de transaction', async () => {
    mockAccounts = [
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500, subType: 'livret_a' }
    ];

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);

    fireEvent.click(screen.getByText("Ajouter une opération d'épargne"));

    // Remplir les champs avec un compte source qui n'existe pas dans accounts
    fireEvent.change(screen.getByLabelText(/Montant/i), { target: { value: '100' } });

    const sourceSelect = screen.getByLabelText(/Compte source \(débité\)/i);
    // Insérer une option fantôme et la sélectionner
    const ghostOption = document.createElement('option');
    ghostOption.value = 'acc-ghost';
    ghostOption.text = 'Fantôme';
    sourceSelect.appendChild(ghostOption);
    fireEvent.change(sourceSelect, { target: { value: 'acc-ghost' } });

    const destSelect = screen.getByLabelText(/Compte destinataire \(crédité\)/i);
    fireEvent.change(destSelect, { target: { value: 'acc-livretA' } });

    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Virement refusé : le compte source sélectionné n'existe plus ou est introuvable")
      );
    });

    expect(mockSaveTransaction).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it('30. Sécurisation virement : refuse le virement si le compte destinataire est clôturé', async () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500 },
      { id: 'acc-closed', name: 'Livret Clos', type: 'savings', initialBalance: 0, isClosed: true }
    ];

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);

    fireEvent.click(screen.getByText("Ajouter une opération d'épargne"));
    fireEvent.change(screen.getByLabelText(/Montant/i), { target: { value: '50' } });

    const sourceSelect = screen.getByLabelText(/Compte source \(débité\)/i);
    fireEvent.change(sourceSelect, { target: { value: 'acc-courant' } });

    const destSelect = screen.getByLabelText(/Compte destinataire \(crédité\)/i);
    const closedOpt = document.createElement('option');
    closedOpt.value = 'acc-closed';
    closedOpt.text = 'Livret Clos';
    destSelect.appendChild(closedOpt);
    fireEvent.change(destSelect, { target: { value: 'acc-closed' } });

    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Virement refusé : le compte destinataire est clôturé")
      );
    });

    expect(mockSaveTransaction).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it('31. Sécurisation virement : refuse le virement si source et destination sont identiques', async () => {
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant', type: 'checking', initialBalance: 1000 },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500 }
    ];

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);

    fireEvent.click(screen.getByText("Ajouter une opération d'épargne"));
    fireEvent.change(screen.getByLabelText(/Montant/i), { target: { value: '50' } });

    const sourceSelect = screen.getByLabelText(/Compte source \(débité\)/i);
    fireEvent.change(sourceSelect, { target: { value: 'acc-livretA' } });

    const destSelect = screen.getByLabelText(/Compte destinataire \(crédité\)/i);
    const sameOpt = document.createElement('option');
    sameOpt.value = 'acc-livretA';
    sameOpt.text = 'Livret A';
    destSelect.appendChild(sameOpt);
    fireEvent.change(destSelect, { target: { value: 'acc-livretA' } });

    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Virement refusé : le compte source et le compte destinataire doivent être strictement différents")
      );
    });

    expect(mockSaveTransaction).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  it('32. Sécurisation virement : refuse le virement si le compte source est clôturé', async () => {
    mockAccounts = [
      { id: 'acc-courant-closed', name: 'Compte Courant Clos', type: 'checking', initialBalance: 0, isClosed: true },
      { id: 'acc-livretA', name: 'Livret A', type: 'savings', initialBalance: 500 }
    ];

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<Savings />);

    fireEvent.click(screen.getByText("Ajouter une opération d'épargne"));
    fireEvent.change(screen.getByLabelText(/Montant/i), { target: { value: '50' } });

    const sourceSelect = screen.getByLabelText(/Compte source \(débité\)/i);
    const closedSourceOpt = document.createElement('option');
    closedSourceOpt.value = 'acc-courant-closed';
    closedSourceOpt.text = 'Compte Courant Clos (clôturé)';
    sourceSelect.appendChild(closedSourceOpt);
    fireEvent.change(sourceSelect, { target: { value: 'acc-courant-closed' } });

    const destSelect = screen.getByLabelText(/Compte destinataire \(crédité\)/i);
    fireEvent.change(destSelect, { target: { value: 'acc-livretA' } });

    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        expect.stringContaining("Virement refusé : le compte source est clôturé et ne peut plus émettre de virement")
      );
    });

    expect(mockSaveTransaction).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });
});


