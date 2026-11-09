import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { 
  writeTechnicalLog, 
  getRecentTechnicalLogs, 
  clearTechnicalLogs, 
  getLogFilePath 
} from './loggerService.ts';

describe('loggerService - Journalisation technique', () => {
  const logPath = getLogFilePath();

  beforeEach(() => {
    clearTechnicalLogs();
  });

  afterEach(() => {
    clearTechnicalLogs();
  });

  it('1. écrit un log technique et le restitue dans les logs récents', () => {
    writeTechnicalLog('INFO', 'Test de journalisation réussie.');
    writeTechnicalLog('WARN', 'Avertissement de test.');
    writeTechnicalLog('ERROR', 'Erreur de test.');

    const logs = getRecentTechnicalLogs(10);
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.some(l => l.includes('Test de journalisation réussie.'))).toBe(true);
    expect(logs.some(l => l.includes('[WARN ]'))).toBe(true);
    expect(logs.some(l => l.includes('[ERROR]'))).toBe(true);
  });

  it('2. limite les lignes retournées selon le paramètre maxLines', () => {
    for (let i = 1; i <= 20; i++) {
      writeTechnicalLog('INFO', `Message numéro ${i}`);
    }

    const limited = getRecentTechnicalLogs(5);
    expect(limited.length).toBe(5);
    expect(limited.some(l => l.includes('Message numéro 20'))).toBe(true);
  });

  it('3. efface proprement les logs', () => {
    writeTechnicalLog('INFO', 'Ligne avant effacement');
    clearTechnicalLogs();

    const logs = getRecentTechnicalLogs(10);
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('Journal technique réinitialisé');
  });
});
