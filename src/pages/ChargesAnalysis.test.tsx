// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import ChargesAnalysis from './ChargesAnalysis';

let mockTransactions: any[] = [];
let mockCategories: any[] = [];
let mockTemplates: any[] = [];
let mockIsLoading = false;

vi.mock('../contexts/ServerDataContext', () => ({
  useServerDataOptional: () => {
    if (mockIsLoading) return null;
    return {
      isLoading: false,
      categories: mockCategories,
      accounts: [{ id: 'acc-1', name: 'Courant' }],
      recurrenceTemplates: mockTemplates,
      transactions: mockTransactions,
      incomePayers: [],
      refreshAll: vi.fn(),
    };
  }
}));

// Mock ResizeObserver pour Recharts dans jsdom
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ChargesAnalysis Component', () => {
  const refMonth = '2026-11';
  const prevMonth = '2026-10';

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockIsLoading = false;
    mockCategories = [
      { id: 'cat-fix-1', name: 'Logement & Énergie', type: 'fixed_expense' },
      { id: 'cat-fix-2', name: 'Télécoms & Multimédia', type: 'fixed_expense' },
      { id: 'cat-var-1', name: 'Carburant & Transport', type: 'variable_expense' }
    ];
    mockTemplates = [
      { id: 'tpl-box', label: 'Box Internet Fibre', amount: 43.99, type: 'fixed_expense', categoryId: 'cat-fix-2' },
      { id: 'tpl-carburant', label: 'Carburant', amount: 100, type: 'variable_expense', categoryId: 'cat-var-1' }
    ];
    mockTransactions = [
      // Rentrées réelles (cleared) sur nov 2026 : 3 000 €
      { id: 'inc-nov', type: 'income', amount: 3000, status: 'cleared', date: `${refMonth}-05` },

      // Octobre (M-1) : Box 43.99 €, Loyer 700 €
      { id: 'fix-box-oct', type: 'fixed_expense', amount: 43.99, status: 'cleared', date: `${prevMonth}-10`, label: 'Box Internet Fibre', templateId: 'tpl-box', categoryId: 'cat-fix-2' },
      { id: 'fix-loyer-oct', type: 'fixed_expense', amount: 700, status: 'cleared', date: `${prevMonth}-05`, label: 'Loyer', categoryId: 'cat-fix-1' },

      // Novembre (M) : Box passe à 47.49 € (+3.50 €), Loyer stable à 700 €
      { id: 'fix-box-nov', type: 'fixed_expense', amount: 47.49, status: 'cleared', date: `${refMonth}-10`, label: 'Box Internet Fibre', templateId: 'tpl-box', categoryId: 'cat-fix-2' },
      { id: 'fix-loyer-nov', type: 'fixed_expense', amount: 700, status: 'cleared', date: `${refMonth}-05`, label: 'Loyer', categoryId: 'cat-fix-1' },

      // Charges variables : Carburant dépassé 3 mois de suite (125 € > 1.15 * 100 €)
      { id: 'var-sep', type: 'variable_expense', amount: 125, status: 'cleared', date: '2026-09-15', label: 'Carburant', templateId: 'tpl-carburant', categoryId: 'cat-var-1' },
      { id: 'var-oct', type: 'variable_expense', amount: 130, status: 'cleared', date: `${prevMonth}-15`, label: 'Carburant', templateId: 'tpl-carburant', categoryId: 'cat-var-1' },
      { id: 'var-nov', type: 'variable_expense', amount: 120, status: 'cleared', date: `${refMonth}-15`, label: 'Carburant', templateId: 'tpl-carburant', categoryId: 'cat-var-1' }
    ];
  });

  it('affiche l’état de chargement si les données du serveur sont en attente', () => {
    mockIsLoading = true;
    render(<ChargesAnalysis />);
    expect(screen.getByText(/Chargement de l'analyse des charges.../i)).toBeDefined();
  });

  it('affiche le volet Charges Fixes par défaut avec les KPIs et la détection de hausse tarifaire', () => {
    render(<ChargesAnalysis />);

    // On force le mois de référence à 2026-11 via le champ mois
    const monthInput = screen.getByTestId('charges-month-select') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '2026-11' } });

    // Titre et sous-titre
    expect(screen.getByText('Analyse des Charges')).toBeDefined();

    // Onglet Fixes actif
    expect(screen.getByTestId('tab-fixed').className).toContain('active');
    expect(screen.getByTestId('fixed-charges-tab-content')).toBeDefined();

    // Vérification KPI : 1 hausse détectée
    expect(screen.getByText('1 détectée')).toBeDefined();

    // Bandeau d'alerte de hausse tarifaire
    expect(screen.getByTestId('tariff-increase-banner')).toBeDefined();
    expect(screen.getAllByText(/Box Internet Fibre/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\+3[.,]50 €\/mois/i)).toBeDefined();

    // Tableau comparatif : contrat avec hausse en premier
    expect(screen.getAllByText('Box Internet Fibre').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Loyer')).toBeDefined();
    expect(screen.getByText('Hausse (+42,00 €/an)')).toBeDefined();
    expect(screen.getByText('Tarif stable')).toBeDefined();
  });

  it('bascule vers le volet Charges Variables au clic sur l’onglet correspondant', () => {
    render(<ChargesAnalysis />);

    const monthInput = screen.getByTestId('charges-month-select') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '2026-11' } });

    // Clic sur l'onglet Charges Variables
    const varTabBtn = screen.getByTestId('tab-variable');
    fireEvent.click(varTabBtn);

    expect(varTabBtn.className).toContain('active');
    expect(screen.getByTestId('variable-charges-tab-content')).toBeDefined();

    // KPI enveloppes sous-évaluées : 1 à réajuster
    expect(screen.getByText('1 à réajuster')).toBeDefined();

    // Bandeau d'alerte pour sous-évaluation structurelle
    expect(screen.getByTestId('underestimated-alert-banner')).toBeDefined();
    expect(screen.getByText(/dépassement moyen/i)).toBeDefined();

    // Tableau comparatif des enveloppes
    expect(screen.getAllByText('Carburant & Transport').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Sous-évaluée \(>15 % sur 3m\)/i)).toBeDefined();
  });

  it('permet de changer l’horizon temporel entre 6 et 12 mois', () => {
    render(<ChargesAnalysis />);

    const h6Btn = screen.getByTestId('horizon-6');
    const h12Btn = screen.getByTestId('horizon-12');

    expect(h12Btn.className).toContain('active');
    expect(h6Btn.className).not.toContain('active');

    fireEvent.click(h6Btn);
    expect(h6Btn.className).toContain('active');
    expect(h12Btn.className).not.toContain('active');
  });

  it('filtre les lignes du tableau via le champ de recherche textuel', () => {
    render(<ChargesAnalysis />);

    const monthInput = screen.getByTestId('charges-month-select') as HTMLInputElement;
    fireEvent.change(monthInput, { target: { value: '2026-11' } });

    // Tableau fixe contient Box et Loyer
    expect(screen.getAllByText('Box Internet Fibre').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Loyer')).toBeDefined();

    // Filtrer sur "box"
    const searchInput = screen.getByTestId('charges-search-input');
    fireEvent.change(searchInput, { target: { value: 'box' } });

    expect(screen.getAllByText('Box Internet Fibre').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Loyer')).toBeNull();

    // Filtrer sur un terme inexistant
    fireEvent.change(searchInput, { target: { value: 'inexistant' } });
    expect(screen.getByText(/Aucun contrat fixe trouvé pour cette période/i)).toBeDefined();
  });
});
