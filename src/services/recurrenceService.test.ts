import { describe, it, expect } from 'vitest';
import {
  computeOccurrenceDate,
  getMonthList,
  getOccurrenceId
} from './recurrenceService';

describe('recurrenceService - Date calculations & determinism', () => {
  describe('computeOccurrenceDate', () => {
    it('génère la bonne date pour un jour standard (ex: 15)', () => {
      expect(computeOccurrenceDate(2026, 5, 15)).toBe('2026-05-15');
    });

    it('gère le premier jour du mois (1)', () => {
      expect(computeOccurrenceDate(2026, 1, 1)).toBe('2026-01-01');
    });

    it('ajuste les jours hors-limite pour un mois de 30 jours (ex: 31 avril -> 30 avril)', () => {
      expect(computeOccurrenceDate(2026, 4, 31)).toBe('2026-04-30');
    });

    it('ajuste pour février en année non-bissextile (2025 -> 28)', () => {
      expect(computeOccurrenceDate(2025, 2, 31)).toBe('2025-02-28');
    });

    it('ajuste pour février en année bissextile (2024 -> 29)', () => {
      expect(computeOccurrenceDate(2024, 2, 31)).toBe('2024-02-29');
    });

    it('borne les jours inférieurs à 1', () => {
      expect(computeOccurrenceDate(2026, 3, 0)).toBe('2026-03-01');
      expect(computeOccurrenceDate(2026, 3, -5)).toBe('2026-03-01');
    });
  });

  describe('getMonthList', () => {
    it('génère une séquence consécutive de mois', () => {
      const list = getMonthList('2026-01', 3);
      expect(list).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('franchit correctement le changement d\'année', () => {
      const list = getMonthList('2025-11', 4);
      expect(list).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    });

    it('renvoie un tableau vide pour count = 0', () => {
      expect(getMonthList('2026-01', 0)).toEqual([]);
    });
  });

  describe('getOccurrenceId', () => {
    it('construit un identifiant prévisible templateId_YYYY-MM', () => {
      expect(getOccurrenceId('tmpl-abc', '2026-05')).toBe('tmpl-abc_2026-05');
    });
  });
});
