import { describe, it, expect } from 'vitest';
import {
  analyzeCharges,
  generateMonthHorizon,
  formatMonthShortFr,
  formatMonthLongFr
} from './chargesAnalysisEngine';
import type { Transaction, RecurrenceTemplate, Category } from '../db/database';

describe('chargesAnalysisEngine', () => {
  describe('generateMonthHorizon & formatters', () => {
    it('génère 12 mois consécutifs jusqu’au mois de référence inclus', () => {
      const months = generateMonthHorizon('2026-11', 12);
      expect(months).toHaveLength(12);
      expect(months[0]).toBe('2025-12');
      expect(months[11]).toBe('2026-11');
    });

    it('génère 6 mois consécutifs jusqu’au mois de référence inclus', () => {
      const months = generateMonthHorizon('2026-11', 6);
      expect(months).toHaveLength(6);
      expect(months[0]).toBe('2026-06');
      expect(months[5]).toBe('2026-11');
    });

    it('formate correctement les libellés de mois en français', () => {
      expect(formatMonthShortFr('2026-11')).toBe('nov. 26');
      expect(formatMonthLongFr('2026-11')).toBe('Novembre 2026');
    });
  });

  describe('Volet Charges Fixes (Contrats incompressibles)', () => {
    const mockCategories: Category[] = [
      { id: 'cat-housing', name: 'Logement', type: 'fixed_expense' } as any,
      { id: 'cat-telecom', name: 'Télécom', type: 'fixed_expense' } as any
    ];

    it('calcule le Taux d’Effort Fixe réel sur les rentrées constatées', () => {
      const transactions: Transaction[] = [
        // Rentrées réelles (cleared) sur nov 2026 : 2 500 €
        { id: 'inc-1', type: 'income', amount: 2500, status: 'cleared', date: '2026-11-05' } as any,
        // Charges fixes nov 2026 : 1 000 € (Loyer 800 + Box 50 + Assur 150)
        { id: 'fix-1', type: 'fixed_expense', amount: 800, status: 'cleared', date: '2026-11-05', label: 'Loyer', categoryId: 'cat-housing' } as any,
        { id: 'fix-2', type: 'fixed_expense', amount: 50, status: 'pending', date: '2026-11-10', label: 'Internet', categoryId: 'cat-telecom' } as any,
        { id: 'fix-3', type: 'fixed_expense', amount: 150, status: 'planned', date: '2026-11-15', label: 'Assurance' } as any,
      ];

      const res = analyzeCharges({
        transactions,
        categories: mockCategories,
        referenceMonth: '2026-11',
        horizon: 6
      });

      expect(res.currentTotalFixed).toBe(1000);
      expect(res.currentRealIncomes).toBe(2500);
      // Taux d'effort = (1000 / 2500) * 100 = 40.0 %
      expect(res.currentEffortRate).toBe(40);
      expect(res.previousMonth).toBe('2026-10');
    });

    it('gère proprement un mois sans rentrées réelles (effortRate = 0 sans division par zéro)', () => {
      const transactions: Transaction[] = [
        { id: 'fix-1', type: 'fixed_expense', amount: 800, status: 'cleared', date: '2026-11-05', label: 'Loyer' } as any
      ];

      const res = analyzeCharges({
        transactions,
        referenceMonth: '2026-11',
        horizon: 6
      });

      expect(res.currentTotalFixed).toBe(800);
      expect(res.currentRealIncomes).toBe(0);
      expect(res.currentEffortRate).toBe(0);
    });

    it('détecte automatiquement une hausse tarifaire entre M et M-1 (+3,50 € / +8 %)', () => {
      const transactions: Transaction[] = [
        // Octobre 2026 (M-1) : Box Internet à 43.99 €
        { id: 'fix-oct', type: 'fixed_expense', amount: 43.99, status: 'cleared', date: '2026-10-10', label: 'Abonnement Internet Fibre', templateId: 'tpl-box' } as any,
        // Novembre 2026 (M) : Box Internet passe à 47.49 € (+3.50 €)
        { id: 'fix-nov', type: 'fixed_expense', amount: 47.49, status: 'cleared', date: '2026-11-10', label: 'Abonnement Internet Fibre', templateId: 'tpl-box' } as any,
        // Contrat stable (Loyer 750 € sur les 2 mois)
        { id: 'loyer-oct', type: 'fixed_expense', amount: 750, status: 'cleared', date: '2026-10-05', label: 'Loyer Résidence' } as any,
        { id: 'loyer-nov', type: 'fixed_expense', amount: 750, status: 'cleared', date: '2026-11-05', label: 'Loyer Résidence' } as any
      ];

      const res = analyzeCharges({
        transactions,
        referenceMonth: '2026-11',
        horizon: 6
      });

      // 1 hausse détectée sur la Box Internet
      expect(res.tariffIncreases).toHaveLength(1);
      const alert = res.tariffIncreases[0];
      expect(alert.contractName).toBe('Abonnement Internet Fibre');
      expect(alert.previousAmount).toBe(43.99);
      expect(alert.newAmount).toBe(47.49);
      expect(alert.increaseAmount).toBe(3.5);
      // ((47.49 - 43.99) / 43.99) * 100 = 7.96 % -> arrondi 7.96%
      expect(alert.increasePercentage).toBeCloseTo(7.96, 1);
      expect(alert.annualImpact).toBe(42); // 3.50 * 12

      // Vérifier le tri : le contrat avec hausse est classé en premier
      expect(res.fixedContracts[0].name).toBe('Abonnement Internet Fibre');
      expect(res.fixedContracts[0].hasIncreased).toBe(true);
      expect(res.fixedContracts[0].annualizedImpact).toBe(42);

      // Le loyer n'a pas augmenté
      const loyer = res.fixedContracts.find(c => c.name === 'Loyer Résidence');
      expect(loyer?.hasIncreased).toBe(false);
      expect(loyer?.diffMvsM1).toBe(0);
    });
  });

  describe('Volet Charges Variables (Enveloppes)', () => {
    it('compare mois par mois le budget prévisionnel alloué et le réel consommé', () => {
      const templates: RecurrenceTemplate[] = [
        { id: 'tpl-fuel', label: 'Carburant', amount: 150, type: 'variable_expense' } as any
      ];

      const transactions: Transaction[] = [
        // Octobre : 140 € consommés sur 150 € prévus (-10 €)
        { id: 'v-oct-1', type: 'variable_expense', amount: 140, status: 'cleared', date: '2026-10-12', label: 'Carburant', templateId: 'tpl-fuel' } as any,
        // Novembre : 180 € consommés sur 150 € prévus (+30 €)
        { id: 'v-nov-1', type: 'variable_expense', amount: 180, status: 'cleared', date: '2026-11-14', label: 'Carburant', templateId: 'tpl-fuel' } as any
      ];

      const res = analyzeCharges({
        transactions,
        templates,
        referenceMonth: '2026-11',
        horizon: 6
      });

      const fuelEnvelope = res.variableEnvelopes.find(e => e.id === 'tpl_tpl-fuel');
      expect(fuelEnvelope).toBeDefined();
      expect(fuelEnvelope?.currentAllocated).toBe(150);
      expect(fuelEnvelope?.currentConsumed).toBe(180);
      expect(fuelEnvelope?.currentVariance).toBe(30);
      expect(fuelEnvelope?.currentVarianceRate).toBe(20); // +20%
    });

    it('détecte une enveloppe structurellement sous-évaluée (> 15% de dépassement sur 3 mois consécutifs)', () => {
      const templates: RecurrenceTemplate[] = [
        { id: 'tpl-carburant', label: 'Carburant', amount: 100, type: 'variable_expense' } as any
      ];

      // 3 mois consécutifs avec dépassement > 15% (ex: 125 € consommés chaque mois vs 100 € prévus)
      const transactions: Transaction[] = [
        { id: 'tx-sep', type: 'variable_expense', amount: 125, status: 'cleared', date: '2026-09-10', label: 'Carburant', templateId: 'tpl-carburant' } as any,
        { id: 'tx-oct', type: 'variable_expense', amount: 130, status: 'cleared', date: '2026-10-15', label: 'Carburant', templateId: 'tpl-carburant' } as any,
        { id: 'tx-nov', type: 'variable_expense', amount: 120, status: 'cleared', date: '2026-11-20', label: 'Carburant', templateId: 'tpl-carburant' } as any
      ];

      const res = analyzeCharges({
        transactions,
        templates,
        referenceMonth: '2026-11',
        horizon: 6
      });

      expect(res.underEstimatedEnvelopesCount).toBe(1);
      const fuel = res.variableEnvelopes[0];
      expect(fuel.isUnderEstimated).toBe(true);
      expect(fuel.underEstimatedMonths).toEqual(['2026-09', '2026-10', '2026-11']);
      // Recommande d'augmenter le budget nominal (ex: 125 €)
      expect(fuel.recommendedBudget).toBeGreaterThanOrEqual(125);
    });

    it('ne signale pas de sous-évaluation si le dépassement n’atteint pas 3 mois consécutifs', () => {
      const templates: RecurrenceTemplate[] = [
        { id: 'tpl-resto', label: 'Restaurants', amount: 100, type: 'variable_expense' } as any
      ];

      // Seulement 2 mois consécutifs de dépassement
      const transactions: Transaction[] = [
        { id: 'tx-aug', type: 'variable_expense', amount: 90, status: 'cleared', date: '2026-08-10', label: 'Restaurants', templateId: 'tpl-resto' } as any,
        { id: 'tx-sep', type: 'variable_expense', amount: 125, status: 'cleared', date: '2026-09-10', label: 'Restaurants', templateId: 'tpl-resto' } as any,
        { id: 'tx-oct', type: 'variable_expense', amount: 120, status: 'cleared', date: '2026-10-15', label: 'Restaurants', templateId: 'tpl-resto' } as any,
        { id: 'tx-nov', type: 'variable_expense', amount: 95, status: 'cleared', date: '2026-11-20', label: 'Restaurants', templateId: 'tpl-resto' } as any
      ];

      const res = analyzeCharges({
        transactions,
        templates,
        referenceMonth: '2026-11',
        horizon: 6
      });

      const resto = res.variableEnvelopes.find(e => e.id === 'tpl_tpl-resto');
      expect(resto?.isUnderEstimated).toBe(false);
      expect(res.underEstimatedEnvelopesCount).toBe(0);
    });

    it('détecte un pic de saisonnalité (> 1.4x la moyenne)', () => {
      const transactions: Transaction[] = [
        { id: 'tx-jun', type: 'variable_expense', amount: 50, status: 'cleared', date: '2026-06-10', label: 'Entretien maison' } as any,
        { id: 'tx-jul', type: 'variable_expense', amount: 50, status: 'cleared', date: '2026-07-10', label: 'Entretien maison' } as any,
        { id: 'tx-aug', type: 'variable_expense', amount: 50, status: 'cleared', date: '2026-08-10', label: 'Entretien maison' } as any,
        { id: 'tx-sep', type: 'variable_expense', amount: 50, status: 'cleared', date: '2026-09-10', label: 'Entretien maison' } as any,
        { id: 'tx-oct', type: 'variable_expense', amount: 50, status: 'cleared', date: '2026-10-10', label: 'Entretien maison' } as any,
        // Pic en novembre (ramonage/entretien chaudière) : 180 € vs moyenne habituelle de 50 €
        { id: 'tx-nov', type: 'variable_expense', amount: 180, status: 'cleared', date: '2026-11-10', label: 'Entretien maison' } as any
      ];

      const res = analyzeCharges({
        transactions,
        referenceMonth: '2026-11',
        horizon: 6
      });

      const envelope = res.variableEnvelopes.find(e => e.name === 'Entretien maison');
      expect(envelope).toBeDefined();
      expect(envelope?.seasonalPeaks).toHaveLength(1);
      expect(envelope?.seasonalPeaks[0].month).toBe('2026-11');
      expect(envelope?.seasonalPeaks[0].amount).toBe(180);
    });
  });

  describe('Cas limites et résilience', () => {
    it('gère une liste vide de transactions sans lever d’exception', () => {
      const res = analyzeCharges({
        transactions: [],
        referenceMonth: '2026-11',
        horizon: 12
      });

      expect(res.fixedMonthlySeries).toHaveLength(12);
      expect(res.fixedContracts).toHaveLength(0);
      expect(res.tariffIncreases).toHaveLength(0);
      expect(res.currentTotalFixed).toBe(0);
      expect(res.currentRealIncomes).toBe(0);
      expect(res.currentEffortRate).toBe(0);
      expect(res.averageEffortRate).toBe(0);
      expect(res.variableEnvelopes).toHaveLength(0);
      expect(res.underEstimatedEnvelopesCount).toBe(0);
    });
  });
});
