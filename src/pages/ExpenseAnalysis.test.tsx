// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ExpenseAnalysis, { History12TooltipContent } from './ExpenseAnalysis';

let mockExpenses: any[] = [];
let mockCategories: any[] = [];
let mockAccounts: any[] = [];

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => ({
    categories: mockCategories,
    accounts: mockAccounts,
    transactions: mockExpenses,
    updateTransactionStatus: vi.fn(),
    refreshAll: vi.fn(),
  })
}));

// Mock ResizeObserver pour Recharts ResponsiveContainer dans l'environnement jsdom
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ExpenseAnalysis - Onglet Analyse des dépenses', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockCategories = [
      { id: 'cat-courses', name: 'Courses & Alimentation', type: 'daily' },
      { id: 'cat-resto', name: 'Restaurants & Sorties', type: 'daily' }
    ];
    mockAccounts = [
      { id: 'acc-courant', name: 'Compte Courant' },
      { id: 'acc-carte', name: 'Carte Débit' }
    ];
    mockExpenses = [
      {
        id: 'tx-1',
        date: `${currentMonth}-02`,
        label: 'Supermarché Carrefour',
        type: 'daily',
        amount: 85.50,
        status: 'cleared',
        categoryId: 'cat-courses',
        accountId: 'acc-courant'
      },
      {
        id: 'tx-2',
        date: `${currentMonth}-05`,
        label: 'Boulangerie Artisanale',
        type: 'daily',
        amount: 14.50,
        status: 'pending',
        categoryId: 'cat-courses',
        accountId: 'acc-courant'
      },
      {
        id: 'tx-3',
        date: `${currentMonth}-10`,
        label: 'Primeur Bio',
        type: 'daily',
        amount: 25.00,
        status: 'planned',
        categoryId: 'cat-courses',
        accountId: 'acc-carte'
      },
      {
        id: 'tx-4',
        date: `${currentMonth}-12`,
        label: 'Pizzeria Bella',
        type: 'daily',
        amount: 45.00,
        status: 'cleared',
        categoryId: 'cat-resto',
        accountId: 'acc-carte'
      },
      {
        id: 'tx-5',
        date: `${currentMonth}-15`,
        label: 'Dépense annulée',
        type: 'daily',
        amount: 30.00,
        status: 'disabled',
        categoryId: 'cat-courses',
        accountId: 'acc-courant'
      }
    ];
  });

  it('affiche les 4 cartes de synthèse avec les calculs budgétaires exacts', () => {
    render(<ExpenseAnalysis />);

    // Débité = 85.50 + 45.00 = 130.50 €
    // En attente = 14.50 €
    // Prévu = 25.00 €
    // Total budgétaire = 130.50 + 14.50 + 25.00 = 170.00 € (30.00 désactivé exclu !)
    expect(screen.getByTestId('kpi-debite-amount').textContent).toContain('130,50');
    expect(screen.getByTestId('kpi-attente-amount').textContent).toContain('14,50');
    expect(screen.getByTestId('kpi-prevu-amount').textContent).toContain('25,00');
    expect(screen.getByTestId('kpi-total-amount').textContent).toContain('170,00');
  });

  it('conserve les cartes de synthèse intactes même si on filtre par statut (ex: cleared uniquement)', () => {
    render(<ExpenseAnalysis />);

    const statusSelect = screen.getByTestId('status-filter-select');
    fireEvent.change(statusSelect, { target: { value: 'cleared' } });

    // Les cartes de synthèse NE DOIVENT PAS être réduites par le filtre de statut
    expect(screen.getByTestId('kpi-debite-amount').textContent).toContain('130,50');
    expect(screen.getByTestId('kpi-attente-amount').textContent).toContain('14,50');
    expect(screen.getByTestId('kpi-prevu-amount').textContent).toContain('25,00');
    expect(screen.getByTestId('kpi-total-amount').textContent).toContain('170,00');

    // En revanche, le total du tableau reflète les opérations filtrées (85.50 + 45.00 = 130.50 €)
    expect(screen.getByTestId('table-grand-total-amount').textContent).toContain('130,50');
    // Le badge ou titre indique les opérations affichées
    expect(screen.getByTestId('table-grand-total-label').textContent).toContain('Total des opérations affichées');
  });

  it('regroupe les opérations par catégorie avec sous-totaux et compte d’opérations corrects', () => {
    render(<ExpenseAnalysis />);

    // Catégorie Courses & Alimentation :
    // Opérations actives : 85.50 + 14.50 + 25.00 = 125.00 € (+ 30 désactivé)
    // Sous-total affiché (sans disabled) = 125,00 €
    const coursesSubtotal = screen.getByTestId('subtotal-amount-cat-courses');
    expect(coursesSubtotal.textContent).toContain('125,00');

    // Catégorie Restaurants : 45.00 €
    const restoSubtotal = screen.getByTestId('subtotal-amount-cat-resto');
    expect(restoSubtotal.textContent).toContain('45,00');

    // Total général du tableau (toutes opérations actives) : 125 + 45 = 170.00 €
    expect(screen.getByTestId('table-grand-total-amount').textContent).toContain('170,00');

    // Compteur d'opérations affiché pour Courses : 4 opérations (3 actives + 1 désactivée)
    expect(screen.getByTestId('subtotal-count-cat-courses').textContent).toContain('4');
    expect(screen.getByTestId('subtotal-count-cat-resto').textContent).toContain('1');
  });

  it('replie toutes les catégories par défaut à l’ouverture tout en gardant les sous-totaux et compteurs visibles', () => {
    render(<ExpenseAnalysis />);

    // L'en-tête de catégorie est visible avec son nom, nombre d'opérations et sous-total
    const coursesHeader = screen.getByTestId('category-header-cat-courses');
    expect(coursesHeader.textContent).toContain('Courses & Alimentation');
    expect(screen.getByTestId('subtotal-count-cat-courses').textContent).toContain('4');
    expect(screen.getByTestId('subtotal-amount-cat-courses').textContent).toContain('125,00');

    // Les opérations détaillées ne sont pas affichées par défaut
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();
    expect(screen.queryByText('Pizzeria Bella')).toBeNull();
  });

  it('permet de déplier puis replier une catégorie individuellement', () => {
    render(<ExpenseAnalysis />);

    // Initialement replié
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();

    // Cliquer sur le bandeau de la catégorie Courses pour la déplier
    const coursesHeader = screen.getByTestId('category-header-cat-courses');
    fireEvent.click(coursesHeader);

    // Supermarché Carrefour doit maintenant être visible
    expect(screen.getByText('Supermarché Carrefour')).toBeDefined();
    // Pizzeria Bella (autre catégorie) reste repliée
    expect(screen.queryByText('Pizzeria Bella')).toBeNull();

    // Cliquer à nouveau pour replier
    fireEvent.click(coursesHeader);
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();
  });

  it('permet de tout déplier et tout replier via les boutons globaux', () => {
    render(<ExpenseAnalysis />);

    // Initialement replié
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();
    expect(screen.queryByText('Pizzeria Bella')).toBeNull();

    // Tout déplier
    const expandAllBtn = screen.getByTestId('expand-all-btn');
    fireEvent.click(expandAllBtn);

    expect(screen.getByText('Supermarché Carrefour')).toBeDefined();
    expect(screen.getByText('Pizzeria Bella')).toBeDefined();

    // Tout replier
    const collapseAllBtn = screen.getByTestId('collapse-all-btn');
    fireEvent.click(collapseAllBtn);

    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();
    expect(screen.queryByText('Pizzeria Bella')).toBeNull();
  });

  it('permet de masquer ou réafficher la zone graphique via le bouton dédié', () => {
    render(<ExpenseAnalysis />);

    // Le panneau graphique est visible par défaut
    expect(screen.getByTestId('expense-analysis-charts-panel')).toBeDefined();
    expect(screen.getByTestId('toggle-charts-btn').textContent).toContain('Masquer graphiques');

    // Clic pour masquer
    fireEvent.click(screen.getByTestId('toggle-charts-btn'));
    expect(screen.queryByTestId('expense-analysis-charts-panel')).toBeNull();
    expect(screen.getByTestId('toggle-charts-btn').textContent).toContain('Afficher graphiques');

    // Clic pour réafficher
    fireEvent.click(screen.getByTestId('toggle-charts-btn'));
    expect(screen.getByTestId('expense-analysis-charts-panel')).toBeDefined();
  });

  it('permet de basculer entre l’onglet Répartition par catégorie et l’onglet Évolution 12 mois avec les 3 séries cochées par défaut', () => {
    render(<ExpenseAnalysis />);

    // Par défaut, l'onglet Répartition par catégorie est actif
    expect(screen.getByTestId('chart-tab-category')).toBeDefined();
    expect(screen.getByTestId('chart-tab-history12')).toBeDefined();
    expect(screen.queryByTestId('toggle-cleared-history')).toBeNull();
    expect(screen.queryByTestId('toggle-pending-history')).toBeNull();
    expect(screen.queryByTestId('toggle-planned-history')).toBeNull();

    // Basculer vers Évolution 12 mois
    fireEvent.click(screen.getByTestId('chart-tab-history12'));
    
    // Les 3 séries sont visibles et cochées par défaut
    const clearedCheckbox = screen.getByTestId('toggle-cleared-history') as HTMLInputElement;
    const pendingCheckbox = screen.getByTestId('toggle-pending-history') as HTMLInputElement;
    const plannedCheckbox = screen.getByTestId('toggle-planned-history') as HTMLInputElement;

    expect(clearedCheckbox).toBeDefined();
    expect(pendingCheckbox).toBeDefined();
    expect(plannedCheckbox).toBeDefined();

    expect(clearedCheckbox.checked).toBe(true);
    expect(pendingCheckbox.checked).toBe(true);
    expect(plannedCheckbox.checked).toBe(true);

    // Activer / désactiver individuellement chaque série
    fireEvent.click(pendingCheckbox);
    expect(pendingCheckbox.checked).toBe(false);

    fireEvent.click(clearedCheckbox);
    expect(clearedCheckbox.checked).toBe(false);

    fireEvent.click(plannedCheckbox);
    expect(plannedCheckbox.checked).toBe(false);

    // Revenir à l'onglet Catégorie
    fireEvent.click(screen.getByTestId('chart-tab-category'));
    expect(screen.queryByTestId('toggle-cleared-history')).toBeNull();
    expect(screen.queryByTestId('toggle-pending-history')).toBeNull();
    expect(screen.queryByTestId('toggle-planned-history')).toBeNull();
  });

  it('affiche une infobulle complète avec les 3 montants formatés et le TOTAL DU MOIS survolé, même si une série est décochée', () => {
    // 1. Test du rendu du composant infobulle avec les trois séries et leur total exact
    const payload = [
      {
        payload: {
          monthKey: '2026-10',
          monthLabel: '10/26',
          isCurrentMonth: true,
          cleared: 130.50,
          pending: 14.50,
          planned: 25.00,
          monthTotal: 170.00, // 130.50 + 14.50 + 25.00
          totalVisible: 155.50 // si par exemple planned est décoché
        }
      }
    ];

    const { getByTestId } = render(<History12TooltipContent active={true} payload={payload as any} />);

    expect(getByTestId('history12-tooltip')).toBeDefined();
    expect(getByTestId('tooltip-cleared-amount').textContent).toContain('130,50');
    expect(getByTestId('tooltip-pending-amount').textContent).toContain('14,50');
    expect(getByTestId('tooltip-planned-amount').textContent).toContain('25,00');
    // Le total mensuel correspond à la somme des 3 séries (170,00 €)
    expect(getByTestId('tooltip-total-amount').textContent).toContain('170,00');
  });

  it('affiche explicitement les montants à zéro dans l’infobulle (0,00 €) pour homogénéité entre les mois', () => {
    const payloadZero = [
      {
        payload: {
          monthKey: '2026-05',
          monthLabel: '05/26',
          isCurrentMonth: false,
          cleared: 0,
          pending: 0,
          planned: 0,
          monthTotal: 0,
          totalVisible: 0
        }
      }
    ];

    const { getByTestId } = render(<History12TooltipContent active={true} payload={payloadZero as any} />);

    expect(getByTestId('tooltip-cleared-amount').textContent).toContain('0,00');
    expect(getByTestId('tooltip-pending-amount').textContent).toContain('0,00');
    expect(getByTestId('tooltip-planned-amount').textContent).toContain('0,00');
    expect(getByTestId('tooltip-total-amount').textContent).toContain('0,00');
  });

  it('gère correctement les catégories archivées et les catégories orphelines sous Sans catégorie', () => {
    mockCategories.push({ id: 'cat-archived', name: 'Vêtements Vintage', type: 'daily', isArchived: true });
    mockExpenses.push(
      {
        id: 'tx-archived',
        date: `${currentMonth}-11`,
        label: 'Achat Vintage',
        type: 'daily',
        amount: 50.00,
        status: 'cleared',
        categoryId: 'cat-archived',
        accountId: 'acc-courant'
      },
      {
        id: 'tx-orphan',
        date: `${currentMonth}-12`,
        label: 'Dépense Diverse',
        type: 'daily',
        amount: 20.00,
        status: 'cleared',
        categoryId: 'cat-non-existante',
        accountId: 'acc-courant'
      }
    );

    render(<ExpenseAnalysis />);

    // La catégorie archivée apparaît dans le tableau et son sous-total est correct
    const archivedHeader = screen.getByTestId('category-header-cat-archived');
    expect(archivedHeader.textContent).toContain('Vêtements Vintage');
    expect(screen.getByTestId('subtotal-amount-cat-archived').textContent).toContain('50,00');

    // La catégorie orpheline apparaît sous "Sans catégorie"
    const uncategorizedHeader = screen.getByTestId('category-header-__uncategorized__');
    expect(uncategorizedHeader.textContent).toContain('Sans catégorie');
    expect(screen.getByTestId('subtotal-amount-__uncategorized__').textContent).toContain('20,00');
  });

  it('gère les montants négatifs (remboursements) sans fausser les totaux nets ni créer de pourcentages aberrants', () => {
    // Ajouter un remboursement sur la catégorie Courses de -15 €
    mockExpenses.push({
      id: 'tx-refund',
      date: `${currentMonth}-14`,
      label: 'Remboursement article',
      type: 'daily',
      amount: -15.00,
      status: 'cleared',
      categoryId: 'cat-courses',
      accountId: 'acc-courant'
    });

    render(<ExpenseAnalysis />);

    // Total Courses passe de 125.00 € à 110.00 €
    expect(screen.getByTestId('subtotal-amount-cat-courses').textContent).toContain('110,00');

    // Total budgétaire général passe de 170.00 € à 155.00 €
    expect(screen.getByTestId('kpi-total-amount').textContent).toContain('155,00');
  });

  it('ne fusionne jamais deux opérations ayant le même libellé et même montant lorsqu’on déplie la catégorie', () => {
    mockExpenses.push({
      id: 'tx-dupl',
      date: `${currentMonth}-02`,
      label: 'Supermarché Carrefour',
      type: 'daily',
      amount: 85.50,
      status: 'cleared',
      categoryId: 'cat-courses',
      accountId: 'acc-courant'
    });

    render(<ExpenseAnalysis />);

    // Déplier Courses
    fireEvent.click(screen.getByTestId('category-header-cat-courses'));

    const carrefourRows = screen.getAllByText('Supermarché Carrefour');
    expect(carrefourRows.length).toBe(2);

    expect(screen.getByTestId('kpi-debite-amount').textContent).toContain('216,00');
  });

  it('filtre efficacement par recherche textuelle sur le libellé', () => {
    render(<ExpenseAnalysis />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'pizzeria' } });

    // Déplier Resto
    fireEvent.click(screen.getByTestId('category-header-cat-resto'));

    expect(screen.getByText('Pizzeria Bella')).toBeDefined();
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();

    // Total tableau = 45.00 €
    expect(screen.getByTestId('table-grand-total-amount').textContent).toContain('45,00');

    // Les KPIs restent globaux à la période/catégorie : Total budgétaire = 170.00 €
    expect(screen.getByTestId('kpi-total-amount').textContent).toContain('170,00');
  });

  it('filtre par catégorie', () => {
    render(<ExpenseAnalysis />);

    const categorySelect = screen.getByTestId('category-filter-select');
    fireEvent.change(categorySelect, { target: { value: 'cat-resto' } });

    // Resto seul : 45.00 €
    expect(screen.getByTestId('kpi-debite-amount').textContent).toContain('45,00');
    expect(screen.getByTestId('kpi-total-amount').textContent).toContain('45,00');

    // Déplier Resto
    fireEvent.click(screen.getByTestId('category-header-cat-resto'));
    expect(screen.queryByText('Supermarché Carrefour')).toBeNull();
    expect(screen.getByText('Pizzeria Bella')).toBeDefined();
  });

  it('permet de réinitialiser tous les filtres', () => {
    render(<ExpenseAnalysis />);

    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'pizzeria' } });

    const resetBtn = screen.getByTestId('reset-filters-btn');
    fireEvent.click(resetBtn);

    // Déplier Courses
    fireEvent.click(screen.getByTestId('category-header-cat-courses'));
    expect(screen.getByText('Supermarché Carrefour')).toBeDefined();
  });

  describe('Analyse par moyen de paiement', () => {
    beforeEach(() => {
      // Configuration de transactions de test riches avec différents moyens de paiement, statuts, montants et chèques
      mockExpenses = [
        {
          id: 'tx-pm-1',
          date: `${currentMonth}-02`,
          label: 'Supermarché',
          type: 'daily',
          amount: 100.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Carte bancaire'
        },
        {
          id: 'tx-pm-2',
          date: `${currentMonth}-04`,
          label: 'Boulangerie',
          type: 'daily',
          amount: 20.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Carte bancaire'
        },
        {
          id: 'tx-pm-3',
          date: `${currentMonth}-06`,
          label: 'Loyer garage',
          type: 'daily',
          amount: 80.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Virement'
        },
        {
          id: 'tx-pm-4',
          date: `${currentMonth}-08`,
          label: 'Médecin spécialiste',
          type: 'daily',
          amount: 50.00,
          status: 'pending',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Chèque',
          checkNumber: '001245'
        },
        {
          id: 'tx-pm-5',
          date: `${currentMonth}-10`,
          label: 'Marché primeur',
          type: 'daily',
          amount: 30.00,
          status: 'planned',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Espèces'
        },
        {
          id: 'tx-pm-6',
          date: `${currentMonth}-12`,
          label: 'Ancien achat magasin',
          type: 'daily',
          amount: 40.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant'
          // Pas de paymentMethod -> Non spécifié
        },
        {
          id: 'tx-pm-7',
          date: `${currentMonth}-15`,
          label: 'Opération annulée',
          type: 'daily',
          amount: 60.00,
          status: 'disabled',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Carte bancaire'
        }
      ];
    });

    it('affiche le filtre par moyen de paiement avec les options et permet de filtrer le tableau', () => {
      render(<ExpenseAnalysis />);

      const pmSelect = screen.getByTestId('payment-method-filter-select') as HTMLSelectElement;
      expect(pmSelect).toBeDefined();

      // Options attendues : Tous, Carte bancaire, Virement, etc., et Non spécifié
      expect(pmSelect.options.length).toBeGreaterThanOrEqual(10);
      expect(pmSelect.value).toBe('');

      // Filtrer par "Chèque"
      fireEvent.change(pmSelect, { target: { value: 'Chèque' } });

      // Déplier la catégorie Courses
      fireEvent.click(screen.getByTestId('category-header-cat-courses'));

      // Seule l'opération par chèque doit être affichée dans le tableau
      expect(screen.getByText('Médecin spécialiste')).toBeDefined();
      expect(screen.queryByText('Supermarché')).toBeNull();
      expect(screen.queryByText('Loyer garage')).toBeNull();

      // Total du tableau = 50,00 €
      expect(screen.getByTestId('table-grand-total-amount').textContent).toContain('50,00');
    });

    it('affiche discrètement le moyen de paiement et le numéro de chèque avec préservation des zéros initiaux', () => {
      render(<ExpenseAnalysis />);

      // Déplier la catégorie Courses
      fireEvent.click(screen.getByTestId('category-header-cat-courses'));

      // Vérifier le badge discret de chèque avec son numéro complet "Chèque n° 001245"
      const checkBadge = screen.getByTestId('payment-badge-tx-pm-4');
      expect(checkBadge).toBeDefined();
      expect(checkBadge.textContent).toContain('Chèque n° 001245');

      // Vérifier le badge Carte bancaire
      const cbBadge = screen.getByTestId('payment-badge-tx-pm-1');
      expect(cbBadge.textContent).toContain('Carte bancaire');
    });

    it('permet de filtrer les opérations sans moyen de paiement (Non spécifié)', () => {
      render(<ExpenseAnalysis />);

      const pmSelect = screen.getByTestId('payment-method-filter-select');
      fireEvent.change(pmSelect, { target: { value: '__unspecified__' } });

      // Déplier la catégorie Courses
      fireEvent.click(screen.getByTestId('category-header-cat-courses'));

      // Seule l'opération sans moyen de paiement doit être présente
      expect(screen.getByText('Ancien achat magasin')).toBeDefined();
      expect(screen.queryByText('Supermarché')).toBeNull();
      expect(screen.getByTestId('table-grand-total-amount').textContent).toContain('40,00');
    });

    it('calcule correctement les indicateurs par moyen de paiement (montant net, nombre d’opérations, moyenne par opération, pourcentages)', () => {
      render(<ExpenseAnalysis />);

      // Basculer vers l'onglet Moyen de paiement
      fireEvent.click(screen.getByTestId('chart-tab-paymentMethod'));

      expect(screen.getByTestId('payment-methods-indicators-panel')).toBeDefined();

      // Carte bancaire : 100 + 20 = 120.00 € (disabled 60 € exclu), 2 opérations, moy = 60.00 €
      const cbRow = screen.getByTestId('indicator-row-carte-bancaire');
      expect(cbRow.textContent).toContain('120,00');
      expect(cbRow.textContent).toContain('2');
      expect(cbRow.textContent).toContain('60,00');

      // Virement : 80.00 €, 1 opération, moy = 80.00 €
      const virementRow = screen.getByTestId('indicator-row-virement');
      expect(virementRow.textContent).toContain('80,00');
      expect(virementRow.textContent).toContain('1');
      expect(virementRow.textContent).toContain('80,00');

      // Chèque : 50.00 €, 1 opération, moy = 50.00 €
      const chequeRow = screen.getByTestId('indicator-row-chèque');
      expect(chequeRow.textContent).toContain('50,00');
      expect(chequeRow.textContent).toContain('1');

      // Non spécifié : 40.00 €, 1 opération, moy = 40.00 €
      const unspecRow = screen.getByTestId('indicator-row-non-spécifié');
      expect(unspecRow.textContent).toContain('40,00');
      expect(unspecRow.textContent).toContain('1');
    });

    it('gère correctement les remboursements négatifs dans les indicateurs sans fausser le total net ni générer de pourcentages aberrants', () => {
      // Ajouter un remboursement par Carte bancaire de -30 €
      mockExpenses.push({
        id: 'tx-pm-refund',
        date: `${currentMonth}-18`,
        label: 'Remboursement CB',
        type: 'daily',
        amount: -30.00,
        status: 'cleared',
        categoryId: 'cat-courses',
        accountId: 'acc-courant',
        paymentMethod: 'Carte bancaire'
      });

      render(<ExpenseAnalysis />);

      // Basculer vers l'onglet Moyen de paiement
      fireEvent.click(screen.getByTestId('chart-tab-paymentMethod'));

      // Total Carte bancaire : 120 - 30 = 90.00 €, 3 opérations (100, 20, -30), moyenne = 30.00 €
      const cbRow = screen.getByTestId('indicator-row-carte-bancaire');
      expect(cbRow.textContent).toContain('90,00');
      expect(cbRow.textContent).toContain('3');
      expect(cbRow.textContent).toContain('30,00');
    });

    it('affiche 0 % ou Non calculable lorsque le total net global est nul ou négatif', () => {
      // Écraser les dépenses avec un total net global à 0 €
      mockExpenses = [
        {
          id: 'tx-zero-1',
          date: `${currentMonth}-02`,
          label: 'Achat',
          type: 'daily',
          amount: 50.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Carte bancaire'
        },
        {
          id: 'tx-zero-2',
          date: `${currentMonth}-03`,
          label: 'Remboursement total',
          type: 'daily',
          amount: -50.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Carte bancaire'
        }
      ];

      render(<ExpenseAnalysis />);

      // Basculer vers l'onglet Moyen de paiement
      fireEvent.click(screen.getByTestId('chart-tab-paymentMethod'));

      const cbRow = screen.getByTestId('indicator-row-carte-bancaire');
      // Total net est 0,00 € -> Part relative indique Non calculable ou 0 %
      expect(cbRow.textContent).toMatch(/(Non calculable|0 %)/);
    });

    it('affiche l’évolution sur 12 mois par catégorie avec les commandes d’activation des séries', () => {
      render(<ExpenseAnalysis />);

      // Basculer vers Évolution 12 mois catégories
      fireEvent.click(screen.getByTestId('chart-tab-paymentHistory12'));

      // Les cases à cocher des catégories présentes sont générées et cochées par défaut
      const catToggle = screen.getByTestId('toggle-category-history-cat-courses') as HTMLInputElement;
      expect(catToggle).toBeDefined();
      expect(catToggle.checked).toBe(true);

      // Désactiver la catégorie
      fireEvent.click(catToggle);
      expect(catToggle.checked).toBe(false);

      // Réactiver
      fireEvent.click(catToggle);
      expect(catToggle.checked).toBe(true);
    });

    it('gère les mois sans dépenses (valeurs à zéro) sans crash ni décalage temporel', () => {
      // Une seule dépense il y a 6 mois
      const pastMonth = '2026-04';
      mockExpenses = [
        {
          id: 'tx-past',
          date: `${pastMonth}-15`,
          label: 'Achat ancien',
          type: 'daily',
          amount: 75.00,
          status: 'cleared',
          categoryId: 'cat-courses',
          accountId: 'acc-courant',
          paymentMethod: 'Virement'
        }
      ];

      render(<ExpenseAnalysis />);

      // Basculer vers Évolution 12 mois moyens
      fireEvent.click(screen.getByTestId('chart-tab-paymentHistory12'));

      // Vérifier que la bascule fonctionne et qu'aucune exception n'est levée
      expect(screen.getByTestId('chart-tab-paymentHistory12')).toBeDefined();
    });

    it('réinitialise aussi le filtre par moyen de paiement lors du clic sur Réinitialiser', () => {
      render(<ExpenseAnalysis />);

      const pmSelect = screen.getByTestId('payment-method-filter-select') as HTMLSelectElement;
      fireEvent.change(pmSelect, { target: { value: 'Chèque' } });
      expect(pmSelect.value).toBe('Chèque');

      const resetBtn = screen.getByTestId('reset-filters-btn');
      fireEvent.click(resetBtn);

      expect(pmSelect.value).toBe('');
    });
  });
});
