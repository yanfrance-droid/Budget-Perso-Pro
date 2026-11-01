import { describe, it, expect } from 'vitest';
import { getCurrentMonth, getCurrentDate } from './dateUtils';

describe('dateUtils', () => {
  it('calcule correctement le mois en cours en heure locale', () => {
    const d = new Date(2026, 10, 1, 0, 30); // 1er novembre 2026 00h30 locale
    expect(getCurrentMonth(d)).toBe('2026-11');
  });

  it('calcule correctement la date en cours en heure locale', () => {
    const d = new Date(2026, 10, 1, 0, 30); // 1er novembre 2026 00h30 locale
    expect(getCurrentDate(d)).toBe('2026-11-01');
  });

  it('gère correctement le 31 décembre à 23h59', () => {
    const d = new Date(2026, 11, 31, 23, 59);
    expect(getCurrentMonth(d)).toBe('2026-12');
    expect(getCurrentDate(d)).toBe('2026-12-31');
  });
});
