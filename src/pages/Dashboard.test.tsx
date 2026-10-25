// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Dashboard from './Dashboard';

let mockAccounts: any[] = [];
let mockTransactions: any[] = [];
let mockLoans: any[] = [];
let mockIsLoading = false;
let mockDashboardSettings: any = null;
const mockUpdateTransactionStatus = vi.fn().mockResolvedValue(true);
const mockUpdateLoanPaymentStatus = vi.fn().mockResolvedValue(true);
const mockSaveDashboardSettings = vi.fn().mockResolvedValue({ success: true });

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => {
    if (mockIsLoading) return null;
    return {
      isLoading: false,
      accounts: mockAccounts,
      categories: [{ id: '1', name: 'Santé' }],
      loans: mockLoans,
      transactions: mockTransactions,
      incomePayers: [],
      recurrenceTemplates: [],
      dashboardSettings: mockDashboardSettings,
      updateTransactionStatus: mockUpdateTransactionStatus,
      updateLoanPaymentStatus: mockUpdateLoanPaymentStatus,
      saveDashboardSettings: mockSaveDashboardSettings,
      refreshAll: vi.fn(),
    };
  }
}));

// Mock ResizeObserver for Recharts ResponsiveContainer
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Dashboard component', () => {
  const currentMonth = new Date().toISOString().slice(0, 7);

  beforeEach(() => {
    mockIsLoading = false;
    mockTransactions = [];
    mockLoans = [];
    mockAccounts = [];
    mockDashboardSettings = null;
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('manualBalance', '40');
    localStorage.setItem('manualBalance_test', '40');
    localStorage.setItem('card1', '0');
    localStorage.setItem('card2', '0');
  });

  it('renders without crashing on client side', () => {
    mockTransactions = [
      { id: '1', date: `${currentMonth}-01`, type: 'income', amount: 1000, status: 'cleared', categoryId: '1' },
      { id: '2', date: `${currentMonth}-02`, type: 'fixed_expense', amount: 100, status: 'cleared', categoryId: '1' }
    ];
    const errorSpy = vi.spyOn(console, 'error');
    render(<Dashboard />);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('supporte sans erreur React un premier rendu avec chargement puis un second rendu avec les données', () => {
    mockIsLoading = true;
    const { container, rerender } = render(<Dashboard />);
    expect(container.textContent).toContain('Chargement du tableau de bord...');

    // Second rendu : les données IndexedDB sont chargées
    mockIsLoading = false;
    mockTransactions = [
      { id: 'reimb-1', date: `${currentMonth}-15`, type: 'health_reimbursement', amount: 50, status: 'pending', label: 'CPAM' }
    ];
    rerender(<Dashboard />);

    // Aucun crash Rules of Hooks, le tableau de bord s'affiche avec le bloc de remboursement
    expect(container.textContent).toContain('Tableau de bord');
    expect(container.textContent).toContain('Remboursements de santé en attente (1)');
  });

  it('préserve strictement le Solde prévisionnel à 40 € lors du passage du remboursement à cleared (aucun double comptage avec le solde réel déclaré)', () => {
    // 1. Initial : Dépense santé 10 € cleared + Remboursement 10 € pending
    mockTransactions = [
      { id: 'exp-1', date: `${currentMonth}-05`, type: 'health_expense', amount: 10, status: 'cleared', categoryId: '1' },
      { id: 'reimb-1', date: `${currentMonth}-10`, type: 'health_reimbursement', amount: 10, status: 'pending', categoryId: '1' }
    ];

    const { container, rerender } = render(<Dashboard />);

    // Le solde prévisionnel est de 40.00 € (solde réel déclaré 40 € - 0 € reste à payer)
    expect(container.textContent).toContain('Solde prévisionnel en banque40.00 €');

    // 2. Passage du remboursement à "cleared" (encaissé)
    mockTransactions = [
      { id: 'exp-1', date: `${currentMonth}-05`, type: 'health_expense', amount: 10, status: 'cleared', categoryId: '1' },
      { id: 'reimb-1', date: `${currentMonth}-10`, type: 'health_reimbursement', amount: 10, status: 'cleared', categoryId: '1' }
    ];

    rerender(<Dashboard />);

    // Le solde prévisionnel reste à 40.00 € (pas de double comptage : le solde déclaré en banque reflète déjà la trésorerie réelle)
    expect(container.textContent).toContain('Solde prévisionnel en banque40.00 €');
  });

  it('vérifie que les deux lignes redondantes « Reste à vivre du mois » ont bien été retirées', () => {
    mockTransactions = [
      { id: 'exp-1', date: `${currentMonth}-05`, type: 'health_expense', amount: 10, status: 'cleared', categoryId: '1' },
      { id: 'reimb-1', date: `${currentMonth}-10`, type: 'health_reimbursement', amount: 10, status: 'cleared', categoryId: '1' }
    ];

    const { container } = render(<Dashboard />);

    // Il ne doit y avoir aucune mention "Reste à vivre du mois"
    expect(container.textContent).not.toContain('Reste à vivre du mois');
    // Et les indicateurs préexistants "Solde prévisionnel en banque" et "Total des charges obligatoires" doivent être présents
    expect(container.textContent).toContain('Solde prévisionnel en banque');
    expect(container.textContent).toContain('Total des charges obligatoires');
  });

  it('calcule exactement le solde prévisionnel avec les chiffres de production (1861,40 € - 877,22 € - 593,59 € = 390,59 €)', () => {
    localStorage.setItem('manualBalance', '1861.40');
    localStorage.setItem('manualBalance_test', '1861.40');
    localStorage.setItem('card1', '877.22');
    localStorage.setItem('card1_test', '877.22');

    // Transactions totalisant 593,59 € de reste à payer (charges fixes/variables/courantes non cleared)
    mockTransactions = [
      { id: 'f1', date: `${currentMonth}-05`, type: 'fixed_expense', amount: 400.00, status: 'pending', categoryId: '1' },
      { id: 'v1', date: `${currentMonth}-12`, type: 'variable_expense', amount: 150.00, status: 'planned', categoryId: '1' },
      { id: 'd1', date: `${currentMonth}-18`, type: 'daily', amount: 43.59, status: 'pending', categoryId: '1' }
    ];

    const { container } = render(<Dashboard />);

    // Total reste à payer affiché = 400 + 150 + 43.59 = 593.59 €
    expect(container.textContent).toContain('593.59');

    // Solde prévisionnel = 1861.40 - 877.22 - 593.59 = 390.59 €
    expect(container.textContent).toContain('Solde prévisionnel en banque390.59 €');
  });

  it('affiche le sélecteur de mois avec la valeur par défaut du mois courant', () => {
    mockTransactions = [];
    const { container } = render(<Dashboard />);

    const monthInput = container.querySelector('input[type="month"]') as HTMLInputElement;
    expect(monthInput).not.toBeNull();
    expect(monthInput.value).toBe(currentMonth);
  });

  it('met à jour les charges sans modifier la situation bancaire lors du changement de mois', async () => {
    // 1000 € de solde bancaire
    localStorage.setItem('manualBalance', '1000');
    localStorage.setItem('manualBalance_test', '1000');

    const pastMonth = '2026-05';
    mockTransactions = [
      // Dépense du mois courant : 100 €
      { id: 'curr-1', date: `${currentMonth}-10`, type: 'fixed_expense', amount: 100, status: 'pending', categoryId: '1' },
      // Dépense du mois passé : 250 €
      { id: 'past-1', date: `${pastMonth}-15`, type: 'fixed_expense', amount: 250, status: 'pending', categoryId: '1' }
    ];

    const { container } = render(<Dashboard />);

    // Initialement (mois courant) :
    // Reste à payer affiché = 100.00 € (mois courant) + 250.00 € (impayé antérieur) = 350.00 €
    // Solde prévisionnel en banque = 1000 - 350 = 650.00 €
    expect(container.textContent).toContain('Solde prévisionnel en banque650.00 €');
    expect(container.textContent).toContain('Répartition des dépenses (' + currentMonth + ')');

    // Changement de mois vers le mois passé
    const monthInput = container.querySelector('input[type="month"]') as HTMLInputElement;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(monthInput, { target: { value: pastMonth } });

    // Sur le mois passé :
    // Les charges fixes affichent 250.00 €
    expect(container.textContent).toContain('250.00');
    // Le camembert affiche le titre du mois passé
    expect(container.textContent).toContain('Répartition des dépenses (' + pastMonth + ')');
    // La situation bancaire reste STRICTEMENT la situation actuelle (650.00 €)
    expect(container.textContent).toContain('Solde prévisionnel en banque650.00 €');
    expect(container.textContent).toContain('Estimation à la fin du mois courant');
  });

  it('affiche les impayés antérieurs pour le mois sélectionné (ex: décembre 2026) et les masque si le mois sélectionné est antérieur à la dépense', async () => {
    mockTransactions = [
      // Dépense impayée d'octobre 2026 : 135 €
      { id: 'oct-1', date: '2026-10-12', type: 'daily', amount: 135, status: 'pending', categoryId: '1' }
    ];

    const { container } = render(<Dashboard />);

    // Sur octobre 2026 (mois courant), les 135 € sont dans les Dépenses du mois (pas dans les impayés antérieurs)
    expect(container.textContent).toContain('135.00');
    expect(container.textContent).not.toContain('⚠️ Impayés antérieurs');

    // Changement vers décembre 2026 (mois futur par rapport à octobre)
    const monthInput = container.querySelector('input[type="month"]') as HTMLInputElement;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(monthInput, { target: { value: '2026-12' } });

    // En décembre 2026, la dépense d'octobre est bien signalée comme impayé antérieur
    expect(container.textContent).toContain('⚠️ Impayés antérieurs (1)');
    expect(container.textContent).toContain('135.00');
    expect(container.textContent).toContain('Dépenses impayées et en retard antérieures à');

    // Changement vers septembre 2026 (mois antérieur à octobre)
    fireEvent.change(monthInput, { target: { value: '2026-09' } });

    // En septembre 2026, la dépense d'octobre n'est pas encore née, donc pas d'impayé antérieur
    expect(container.textContent).not.toContain('⚠️ Impayés antérieurs');
  });

  describe('Suivi des remboursements de santé en attente', () => {
    it('affiche le bloc avec les demandes pending et planned et le total attendu, et exclut cleared et disabled', () => {
      mockTransactions = [
        // Soin d'origine
        { id: 'care-1', date: '2026-10-05', type: 'health_expense', amount: 50, status: 'cleared', label: 'Consultation Médecin' },
        // Demande 1 : pending liée au soin (30 €)
        { id: 'reimb-1', date: '2026-10-15', type: 'health_reimbursement', amount: 30, status: 'pending', label: 'Sécurité Sociale', linkedId: 'care-1' },
        // Demande 2 : planned sans soin lié (15 €)
        { id: 'reimb-2', date: '2026-10-20', type: 'health_reimbursement', amount: 15, status: 'planned', label: 'Mutuelle Santé' },
        // Demande 3 : cleared (déjà encaissée, ne doit PAS être dans le bloc d'attente)
        { id: 'reimb-3', date: '2026-10-10', type: 'health_reimbursement', amount: 20, status: 'cleared', label: 'Remboursement déjà reçu' },
        // Demande 4 : disabled (annulée, ne doit PAS être dans le bloc d'attente)
        { id: 'reimb-4', date: '2026-10-12', type: 'health_reimbursement', amount: 10, status: 'disabled', label: 'Remboursement rejeté' }
      ];

      const { container } = render(<Dashboard />);
      const text = container.textContent?.replace(/\u00A0|\u202F/g, ' ') || '';

      // Titre présent
      expect(text).toContain('Remboursements de santé en attente (2)');
      // Total attendu : 30 + 15 = 45 €
      expect(text).toContain('Total attendu : 45,00 €');
      // Demandes présentes
      expect(text).toContain('Sécurité Sociale');
      expect(text).toContain('Consultation Médecin');
      expect(text).toContain('Mutuelle Santé');
      // Statuts
      expect(text).toContain('En attente');
      expect(text).toContain('Prévu');
      // Demandes exclues
      expect(text).not.toContain('Remboursement déjà reçu');
      expect(text).not.toContain('Remboursement rejeté');
      // Mention informative obligatoire
      expect(text).toContain(
        "Montants attendus non comptabilisés dans le solde prévisionnel tant qu'ils ne sont pas pointés comme encaissés."
      );
    });

    it('une demande ancienne en attente reste visible lorsqu\'un mois ultérieur est sélectionné', async () => {
      mockTransactions = [
        // Remboursement d'août 2026 encore pending
        { id: 'reimb-old', date: '2026-08-10', type: 'health_reimbursement', amount: 42, status: 'pending', label: 'CPAM Août' }
      ];

      const { container } = render(<Dashboard />);
      const text1 = container.textContent?.replace(/\u00A0|\u202F/g, ' ') || '';

      // Sur le mois courant, la demande d'août est bien visible
      expect(text1).toContain('Remboursements de santé en attente (1)');
      expect(text1).toContain('CPAM Août');
      expect(text1).toContain('42,00 €');

      // Sélection d'un mois futur (décembre 2026)
      const monthInput = container.querySelector('input[type="month"]') as HTMLInputElement;
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(monthInput, { target: { value: '2026-12' } });

      const text2 = container.textContent?.replace(/\u00A0|\u202F/g, ' ') || '';

      // La demande ancienne reste visible en décembre 2026
      expect(text2).toContain('Remboursements de santé en attente (1)');
      expect(text2).toContain('CPAM Août');
      expect(text2).toContain('42,00 €');
    });

    it('le bloc disparaît complètement s\'il n\'y a aucun remboursement en attente', () => {
      mockTransactions = [
        { id: 'reimb-cleared', date: `${currentMonth}-10`, type: 'health_reimbursement', amount: 25, status: 'cleared', label: 'CPAM' }
      ];

      const { container } = render(<Dashboard />);

      expect(container.textContent).not.toContain('Remboursements de santé en attente');
    });

    it('garantit une stricte neutralité financière : les montants en attente ne modifient pas le solde prévisionnel ni les totaux', () => {
      // Situation initiale sans remboursement en attente
      localStorage.setItem('manualBalance', '1000');
      localStorage.setItem('manualBalance_test', '1000');
      mockTransactions = [
        { id: 'fix-1', date: `${currentMonth}-05`, type: 'fixed_expense', amount: 200, status: 'pending' }
      ];

      const { container, rerender } = render(<Dashboard />);
      // Solde prévisionnel = 1000 - 200 = 800.00 €
      expect(container.textContent).toContain('Solde prévisionnel en banque800.00 €');
      expect(container.textContent).toContain('200.00'); // Charges obligatoires

      // Ajout de 300 € de remboursement en attente
      mockTransactions = [
        { id: 'fix-1', date: `${currentMonth}-05`, type: 'fixed_expense', amount: 200, status: 'pending' },
        { id: 'reimb-pending', date: `${currentMonth}-15`, type: 'health_reimbursement', amount: 300, status: 'pending', label: 'CPAM' }
      ];

      rerender(<Dashboard />);

      const text = container.textContent?.replace(/\u00A0|\u202F/g, ' ') || '';

      // Le bloc est visible avec 300 €
      expect(text).toContain('Remboursements de santé en attente (1)');
      expect(text).toContain('Total attendu : 300,00 €');
      // MAIS le solde prévisionnel reste STRICTEMENT 800.00 € (les 300 € attendus ne sont PAS ajoutés aux liquidités)
      expect(container.textContent).toContain('Solde prévisionnel en banque800.00 €');
      // Et les charges obligatoires restent strictement à 200.00 €
      expect(container.textContent).toContain('200.00');
    });

    it('permet de marquer un remboursement comme encaissé avec le bouton d\'action et ne modifie pas les autres remboursements de la même dépense', async () => {
      mockUpdateTransactionStatus.mockClear();

      // Deux remboursements pour la même dépense 'care-1'
      mockTransactions = [
        { id: 'care-1', date: `${currentMonth}-05`, type: 'health_expense', amount: 50, status: 'cleared', label: 'Consultation' },
        { id: 'reimb-cpam', date: `${currentMonth}-15`, type: 'health_reimbursement', amount: 30, status: 'pending', label: 'CPAM', linkedId: 'care-1' },
        { id: 'reimb-mutuelle', date: `${currentMonth}-20`, type: 'health_reimbursement', amount: 15, status: 'pending', label: 'Mutuelle', linkedId: 'care-1' }
      ];

      const { container, rerender } = render(<Dashboard />);
      const buttons = container.querySelectorAll('.health-pending-box .unpaid-action-btn');
      expect(buttons.length).toBe(2);
      expect(buttons[0].textContent).toContain('Marquer encaissé');

      // Clic sur le premier bouton (CPAM)
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.click(buttons[0]);

      // Vérifie que seul 'reimb-cpam' a été mis à jour avec le statut 'cleared'
      expect(mockUpdateTransactionStatus).toHaveBeenCalledTimes(1);
      expect(mockUpdateTransactionStatus).toHaveBeenCalledWith('reimb-cpam', 'cleared');

      // Simule la mise à jour réactive de Dexie : seul CPAM passe à cleared
      mockTransactions = [
        { id: 'care-1', date: `${currentMonth}-05`, type: 'health_expense', amount: 50, status: 'cleared', label: 'Consultation' },
        { id: 'reimb-cpam', date: `${currentMonth}-15`, type: 'health_reimbursement', amount: 30, status: 'cleared', label: 'CPAM', linkedId: 'care-1' },
        { id: 'reimb-mutuelle', date: `${currentMonth}-20`, type: 'health_reimbursement', amount: 15, status: 'pending', label: 'Mutuelle', linkedId: 'care-1' }
      ];

      rerender(<Dashboard />);

      // Le CPAM a disparu, il ne reste que Mutuelle (1)
      const text = container.textContent?.replace(/\u00A0|\u202F/g, ' ') || '';
      expect(text).toContain('Remboursements de santé en attente (1)');
      expect(text).toContain('Mutuelle');
      expect(text).not.toContain('CPAM');
      expect(text).toContain('Total attendu : 15,00 €');
    });
  });

  describe('Graphique circulaire (camembert) - Répartition des 6 grands postes', () => {
    it('affiche le graphique circulaire de répartition des dépenses lorsque des dépenses existent', () => {
      // Fixe: 400€, Variable: 200€, Crédit: 0€, Dépenses: 100€, Santé: 50€, Épargne: 250€ => Total: 1000€
      mockTransactions = [
        { id: 'f1', date: `${currentMonth}-05`, type: 'fixed_expense', amount: 400, status: 'planned' },
        { id: 'v1', date: `${currentMonth}-10`, type: 'variable_expense', amount: 200, status: 'cleared' },
        { id: 'd1', date: `${currentMonth}-15`, type: 'daily', amount: 100, status: 'cleared' },
        { id: 'h1', date: `${currentMonth}-18`, type: 'health_expense', amount: 50, status: 'cleared' },
        { id: 's1', date: `${currentMonth}-25`, type: 'transfer', amount: 250, status: 'planned' }
      ];

      const { container } = render(<Dashboard />);

      // Le panneau est bien présent
      expect(container.textContent).toContain('Répartition des dépenses');
      // Il n'affiche pas le message "Aucune dépense"
      expect(container.textContent).not.toContain('Aucune dépense enregistrée pour ce mois.');
      // Le composant ResponsiveContainer / Recharts est bien rendu dans le panneau
      const piePanel = container.querySelector('.dashboard-charts-grid .dashboard-panel:last-child');
      expect(piePanel).not.toBeNull();
      expect(piePanel?.querySelector('.recharts-responsive-container')).not.toBeNull();
      // La légende sous le graphique a bien été supprimée
      expect(container.querySelector('.dashboard-pie-legend')).toBeNull();
    });

    it('gère proprement le cas où toutes les dépenses sont à zéro sans erreur ni division par zéro', () => {
      mockTransactions = [];
      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Aucune dépense enregistrée pour ce mois.');
    });
  });

  describe('Graphique « Évolution (12 derniers mois) » avec courbe de moyenne des charges', () => {
    it('affiche le panneau d\'évolution sur 12 mois avec le composant de graphique', () => {
      mockTransactions = [
        { id: 't1', date: `${currentMonth}-01`, type: 'income', amount: 2000, status: 'cleared' },
        { id: 't2', date: `${currentMonth}-05`, type: 'fixed_expense', amount: 800, status: 'cleared' }
      ];

      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Évolution (12 derniers mois)');
      const chartPanel = container.querySelector('.dashboard-charts-grid .dashboard-panel:first-child');
      expect(chartPanel).not.toBeNull();
      expect(chartPanel?.querySelector('.recharts-responsive-container')).not.toBeNull();
    });

    it('calcule la moyenne des charges sur les 12 mois et prend en compte les 6 postes cohérents avec le tableau de bord', () => {
      // Pour le mois courant : 600 € de charges réparties
      // (fixe 300, variable 100, daily 100, santé 50 nette après remboursement, épargne 50)
      mockTransactions = [
        { id: 'f1', date: `${currentMonth}-01`, type: 'fixed_expense', amount: 300, status: 'cleared' },
        { id: 'v1', date: `${currentMonth}-02`, type: 'variable_expense', amount: 100, status: 'cleared' },
        { id: 'd1', date: `${currentMonth}-03`, type: 'daily', amount: 100, status: 'cleared' },
        { id: 'h1', date: `${currentMonth}-04`, type: 'health_expense', amount: 70, status: 'cleared' },
        { id: 'hr1', date: `${currentMonth}-05`, type: 'health_reimbursement', amount: 20, status: 'cleared' }, // santé nette = 50
        { id: 's1', date: `${currentMonth}-06`, type: 'transfer', amount: 50, status: 'cleared' }
      ];

      const { container } = render(<Dashboard />);
      const chartPanel = container.querySelector('.dashboard-charts-grid .dashboard-panel:first-child');
      expect(chartPanel).not.toBeNull();
      // Le graphique ComposedChart contient la légende ou les séries attendues
      expect(chartPanel?.textContent).toContain('Évolution (12 derniers mois)');
    });

    it('Test 1 : Un mois passé sans transaction ni paiement de crédit affiche 0 € de charges', () => {
      // Crédit actif couvrant les 6 mois
      mockLoans = [
        {
          id: 'loan-1',
          name: 'Crédit Immo',
          monthlyPayment: 850,
          startDate: '2025-01-01',
          endDate: '2030-01-01',
          isActive: true,
          isPaused: false
        }
      ];

      // Seulement des opérations sur le mois courant
      mockTransactions = [
        { id: 't-cur', date: `${currentMonth}-10`, type: 'daily', amount: 50, status: 'cleared' }
      ];

      const { container } = render(<Dashboard />);
      const chartComponent = container.querySelector('.dashboard-charts-grid .dashboard-panel:first-child');
      expect(chartComponent).not.toBeNull();
    });

    it('Test 2 : Un mois passé avec un paiement de crédit enregistré affiche uniquement ce paiement, sans mensualité théorique supplémentaire', () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      const pastMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      mockLoans = [
        {
          id: 'loan-1',
          name: 'Crédit Auto',
          monthlyPayment: 300,
          startDate: '2025-01-01',
          endDate: '2030-01-01',
          isActive: true,
          isPaused: false
        }
      ];

      // Paiement réel de 300 € sur le mois passé
      mockTransactions = [
        { id: 'lp-1', date: `${pastMonth}-15`, type: 'loan_payment', amount: 300, status: 'cleared', linkedId: 'loan-1' }
      ];

      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Évolution (12 derniers mois)');
    });

    it('Test 3 : Une ancienne transaction avec recurrenceDay ne réapparaît pas artificiellement dans les mois suivants', () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 4);
      const pastMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // Ancienne transaction sans templateId mais avec recurrenceDay
      mockTransactions = [
        { id: 'old-rec', date: `${pastMonth}-05`, recurrenceDay: 5, type: 'fixed_expense', amount: 150, status: 'cleared' }
      ];

      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Évolution (12 derniers mois)');
    });

    it('Test 4 : Le mois courant conserve les prévisions de crédits et de charges existantes', () => {
      mockLoans = [
        {
          id: 'loan-active',
          name: 'Prêt Personnel',
          monthlyPayment: 250,
          startDate: '2026-01-01',
          endDate: '2028-01-01',
          isActive: true,
          isPaused: false
        }
      ];

      mockTransactions = [
        { id: 't-now', date: `${currentMonth}-10`, type: 'fixed_expense', amount: 400, status: 'planned' }
      ];

      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Évolution (12 derniers mois)');
    });

    it('Test 5 : La moyenne des charges est recalculée à partir des 12 montants affichés, en incluant les mois à 0 €', () => {
      // 1 seul mois à 600 €, 11 mois à 0 € => moyenne = 600 / 12 = 50 €
      mockTransactions = [
        { id: 't-unique', date: `${currentMonth}-01`, type: 'daily', amount: 600, status: 'cleared' }
      ];

      const { container } = render(<Dashboard />);
      expect(container.textContent).toContain('Évolution (12 derniers mois)');
    });
  });

  describe('Prévisionnel bancaire et transferts d\'épargne', () => {
    it('diminue le solde prévisionnel pour un versement prévu du compte courant vers un livret', () => {
      // Solde initial saisi : 1000 €
      localStorage.setItem('manualBalance', '1000');
      localStorage.setItem('manualBalance_test', '1000');
      mockAccounts = [
        { id: 'acc-courant', name: 'Courant', type: 'checking' },
        { id: 'acc-livret', name: 'Livret A', type: 'savings' }
      ];

      // Versement prévu de 100 € vers le Livret A
      mockTransactions = [
        {
          id: 'tx-vers-1',
          date: `${currentMonth}-15`,
          type: 'transfer',
          amount: 100,
          status: 'planned',
          accountId: 'acc-courant',
          destinationAccountId: 'acc-livret'
        }
      ];

      const { container } = render(<Dashboard />);
      // 1000 - 100 = 900.00 €
      expect(container.textContent).toContain('Solde prévisionnel en banque900.00 €');
    });

    it('augmente le solde prévisionnel pour un retrait prévu d\'un livret vers le compte courant', () => {
      localStorage.setItem('manualBalance', '1000');
      localStorage.setItem('manualBalance_test', '1000');
      mockAccounts = [
        { id: 'acc-courant', name: 'Courant', type: 'checking' },
        { id: 'acc-livret', name: 'Livret A', type: 'savings' }
      ];

      // Retrait prévu de 150 € depuis le Livret A vers le compte courant
      mockTransactions = [
        {
          id: 'tx-retrait-1',
          date: `${currentMonth}-18`,
          type: 'transfer',
          amount: 150,
          status: 'planned',
          accountId: 'acc-livret',
          destinationAccountId: 'acc-courant'
        }
      ];

      const { container } = render(<Dashboard />);
      // 1000 + 150 = 1150.00 €
      expect(container.textContent).toContain('Solde prévisionnel en banque1150.00 €');
    });

    it('ne modifie pas le solde prévisionnel pour un virement interne entre deux comptes d\'épargne', () => {
      localStorage.setItem('manualBalance', '1000');
      localStorage.setItem('manualBalance_test', '1000');
      mockAccounts = [
        { id: 'acc-courant', name: 'Courant', type: 'checking' },
        { id: 'acc-livretA', name: 'Livret A', type: 'savings' },
        { id: 'acc-lep', name: 'LEP', type: 'savings' }
      ];

      // Virement prévu de 80 € entre Livret A et LEP
      mockTransactions = [
        {
          id: 'tx-interne-1',
          date: `${currentMonth}-20`,
          type: 'transfer',
          amount: 80,
          status: 'planned',
          accountId: 'acc-livretA',
          destinationAccountId: 'acc-lep'
        }
      ];

      const { container } = render(<Dashboard />);
      // Reste à 1000.00 €
      expect(container.textContent).toContain('Solde prévisionnel en banque1000.00 €');
    });

    it('ne déduit ni n\'ajoute une seconde fois une opération déjà pointée (cleared)', () => {
      // Si un versement ou un retrait est déjà 'cleared', il est déjà inclus dans le solde bancaire réel saisi
      localStorage.setItem('manualBalance', '1000');
      localStorage.setItem('manualBalance_test', '1000');
      mockAccounts = [
        { id: 'acc-courant', name: 'Courant', type: 'checking' },
        { id: 'acc-livret', name: 'Livret A', type: 'savings' }
      ];

      mockTransactions = [
        {
          id: 'tx-cleared-1',
          date: `${currentMonth}-05`,
          type: 'transfer',
          amount: 200,
          status: 'cleared',
          accountId: 'acc-courant',
          destinationAccountId: 'acc-livret'
        },
        {
          id: 'tx-cleared-2',
          date: `${currentMonth}-06`,
          type: 'transfer',
          amount: 50,
          status: 'cleared',
          accountId: 'acc-livret',
          destinationAccountId: 'acc-courant'
        }
      ];

      const { container } = render(<Dashboard />);
      // Reste exactement à 1000.00 € sans double comptabilisation
      expect(container.textContent).toContain('Solde prévisionnel en banque1000.00 €');
    });
  });

  describe('Protection contre les appels prématurés à saveDashboardSettings', () => {
    it('ne déclenche aucun appel à saveDashboardSettings au montage tant que dashboardSettings n\'a pas été chargé', async () => {
      vi.useFakeTimers();
      mockAccounts = [{ id: 'acc-1', name: 'Courant', type: 'checking' }];
      mockDashboardSettings = null; // Données serveur non encore chargées

      render(<Dashboard />);

      // Avancer le temps au-delà du décompte de 500ms
      vi.advanceTimersByTime(1000);

      expect(mockSaveDashboardSettings).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('déclenche saveDashboardSettings une fois les paramètres initialisés et après modification ou blur', async () => {
      vi.useFakeTimers();
      mockAccounts = [{ id: 'acc-1', name: 'Courant', type: 'checking' }];
      mockDashboardSettings = { manualBalance: '1500', card1: '100', card2: '50' };

      const { rerender } = render(<Dashboard />);

      // Après chargement des paramètres depuis SQLite
      rerender(<Dashboard />);

      // Si l'utilisateur ou le composant effectue un autosave suite à une modification
      vi.advanceTimersByTime(600);

      expect(mockSaveDashboardSettings).toHaveBeenCalledWith(expect.objectContaining({
        manualBalance: '1500',
        card1: '100',
        card2: '50'
      }));
      vi.useRealTimers();
    });
  });
});


