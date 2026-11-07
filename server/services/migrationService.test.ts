import { test, describe, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { importBackupData, exportBackupData, validateBackupPayload } from './migrationService.ts';
import { resetDatabaseData } from './maintenanceService.ts';
import { saveLoanCapitalRecord, getAllLoanCapitalHistory } from './loanCapitalHistoryService.ts';
import { getLoanById } from './loanService.ts';
import { initDatabase } from '../db.ts';

describe('Migration & Maintenance Security (loan_capital_history)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');

    // Initialisation d'un compte de base pour satisfaire les FK
    db.prepare(`
      INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate, isClosed)
      VALUES ('acc_main', 'Compte Principal', 'checking', 'checking', 1000, '2024-01-01', 0);
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  test('1. Préserve l\'historique existant lors d\'un import d\'une ancienne sauvegarde (sans clé loanCapitalHistory)', () => {
    // 1a. On enregistre des données d'historique en base
    saveLoanCapitalRecord(db, {
      month: '2024-05',
      realEstateCapital: 150000,
      realEstateMonthlyPayment: 950,
      consumerCapital: 12000,
      consumerMonthlyPayment: 320
    });
    expect(getAllLoanCapitalHistory(db).length).toBe(1);

    // 1b. Ancienne sauvegarde v1.1 sans la clé loanCapitalHistory
    const oldBackup = {
      version: '1.1',
      appName: 'PersonalBudgetPro',
      exportDate: '2024-05-01T00:00:00.000Z',
      tables: {
        accounts: [{ id: 'acc_main', name: 'Compte Principal', type: 'checking', referenceDate: '2024-01-01' }],
        categories: [{ id: 'cat_1', name: 'Alimentation', type: 'daily' }],
        transactions: [],
        loans: []
      }
    };

    const result = importBackupData(db, oldBackup, { skipSafetyBackup: true });
    expect(result.success).toBe(true);
    expect(result.loanCapitalHistoryStatus).toBe('preserved');

    // Vérifie que l'historique est STRICTEMENT intact
    const after = getAllLoanCapitalHistory(db);
    expect(after.length).toBe(1);
    expect(after[0].month).toBe('2024-05');
    expect(after[0].realEstateCapital).toBe(150000);
  });

  test('2. Préserve l\'historique existant si la clé loanCapitalHistory est une liste vide ou nulle', () => {
    saveLoanCapitalRecord(db, {
      month: '2024-05',
      realEstateCapital: 150000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const backupWithEmpty = {
      version: '2.0',
      appName: 'PersonalBudgetPro',
      exportDate: '2024-05-01T00:00:00.000Z',
      tables: {
        accounts: [{ id: 'acc_main', name: 'Compte Principal', type: 'checking', referenceDate: '2024-01-01' }],
        categories: [],
        transactions: [],
        loans: [],
        loanCapitalHistory: [] // Liste vide
      }
    };

    const resEmpty = importBackupData(db, backupWithEmpty, { skipSafetyBackup: true });
    expect(resEmpty.loanCapitalHistoryStatus).toBe('preserved');
    expect(getAllLoanCapitalHistory(db).length).toBe(1);

    const backupWithNull = {
      ...backupWithEmpty,
      tables: { ...backupWithEmpty.tables, loanCapitalHistory: null }
    };
    const resNull = importBackupData(db, backupWithNull, { skipSafetyBackup: true });
    expect(resNull.loanCapitalHistoryStatus).toBe('preserved');
    expect(getAllLoanCapitalHistory(db).length).toBe(1);
  });

  test('3. Rejette l\'import et préserve les données si loanCapitalHistory contient des données invalides ou doublons', () => {
    saveLoanCapitalRecord(db, {
      month: '2024-05',
      realEstateCapital: 150000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const corruptBackup = {
      version: '2.0',
      appName: 'PersonalBudgetPro',
      exportDate: '2024-05-01T00:00:00.000Z',
      tables: {
        accounts: [{ id: 'acc_main', name: 'Compte Principal', type: 'checking', referenceDate: '2024-01-01' }],
        categories: [],
        transactions: [],
        loans: [],
        loanCapitalHistory: [
          { month: '2024-06', realEstateCapital: 140000 },
          { month: '2024-06', realEstateCapital: 139000 } // Doublon !
        ]
      }
    };

    expect(() => {
      importBackupData(db, corruptBackup, { skipSafetyBackup: true, replaceLoanCapitalHistory: true });
    }).toThrow(/doublon détecté/i);

    // L'historique d'origine est préservé
    const history = getAllLoanCapitalHistory(db);
    expect(history.length).toBe(1);
    expect(history[0].month).toBe('2024-05');
  });

  test('4. Remplace l\'historique UNIQUEMENT lorsque replaceLoanCapitalHistory === true est explicite', () => {
    saveLoanCapitalRecord(db, {
      month: '2020-01',
      realEstateCapital: 180000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const newBackup = {
      version: '2.0',
      appName: 'PersonalBudgetPro',
      exportDate: '2026-10-25T00:00:00.000Z',
      tables: {
        accounts: [{ id: 'acc_main', name: 'Compte Principal', type: 'checking', referenceDate: '2024-01-01' }],
        categories: [],
        transactions: [],
        loans: [],
        loanCapitalHistory: [
          {
            month: '2026-09',
            realEstateCapital: 110000,
            realEstateMonthlyPayment: 950,
            consumerCapital: 5000,
            consumerMonthlyPayment: 300
          }
        ]
      }
    };

    // 4a. Sans option explicite -> préservé
    const resNoOption = importBackupData(db, newBackup, { skipSafetyBackup: true });
    expect(resNoOption.loanCapitalHistoryStatus).toBe('preserved');
    let history = getAllLoanCapitalHistory(db);
    expect(history.length).toBe(1);
    expect(history[0].month).toBe('2020-01');

    // 4b. Avec replaceLoanCapitalHistory: true -> remplacé
    const resReplace = importBackupData(db, newBackup, { skipSafetyBackup: true, replaceLoanCapitalHistory: true });
    expect(resReplace.loanCapitalHistoryStatus).toBe('replaced');
    expect(resReplace.importedLoanCapitalHistory).toBe(1);
    history = getAllLoanCapitalHistory(db);
    expect(history.length).toBe(1);
    expect(history[0].month).toBe('2026-09');
    expect(history[0].realEstateCapital).toBe(110000);
  });

  test('5. Exporte bien loanCapitalHistory dans exportBackupData', () => {
    saveLoanCapitalRecord(db, {
      month: '2024-01',
      realEstateCapital: 155000,
      realEstateMonthlyPayment: 950,
      consumerCapital: 10000,
      consumerMonthlyPayment: 250
    });

    const exported = exportBackupData(db);
    expect(exported.version).toBe('2.0');
    expect(Array.isArray(exported.tables.loanCapitalHistory)).toBe(true);
    expect(exported.tables.loanCapitalHistory!.length).toBe(1);
    expect(exported.tables.loanCapitalHistory![0].month).toBe('2024-01');
  });

  test('6. RAZ applicative : préserve loan_capital_history par défaut', () => {
    saveLoanCapitalRecord(db, {
      month: '2024-01',
      realEstateCapital: 155000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const resetRes = resetDatabaseData(db, true, false); // resetLoanCapitalHistory = false par défaut
    expect(resetRes.success).toBe(true);
    expect(resetRes.loanCapitalHistoryReset).toBe(false);

    // L'historique des crédits est intact
    const historyAfter = getAllLoanCapitalHistory(db);
    expect(historyAfter.length).toBe(1);
    expect(historyAfter[0].month).toBe('2024-01');
  });

  test('7. RAZ applicative : purge loan_capital_history UNIQUEMENT si explicitement demandée', () => {
    saveLoanCapitalRecord(db, {
      month: '2024-01',
      realEstateCapital: 155000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const resetRes = resetDatabaseData(db, true, true); // resetLoanCapitalHistory = true
    expect(resetRes.success).toBe(true);
    expect(resetRes.loanCapitalHistoryReset).toBe(true);

    // L'historique des crédits est désormais purgé
    const historyAfter = getAllLoanCapitalHistory(db);
    expect(historyAfter.length).toBe(0);
  });

  test('8. Restauration JSON : ne redéduit pas le capital déjà amorti sur les crédits (pas de double-amortissement)', () => {
    const backupWithClearedLoanPayments = {
      version: '2.0',
      appName: 'PersonalBudgetPro',
      exportDate: '2026-11-01T00:00:00.000Z',
      tables: {
        accounts: [{ id: 'acc_main', name: 'Compte Principal', type: 'checking', referenceDate: '2024-01-01' }],
        categories: [{ id: 'cat_loan', name: 'Crédit', type: 'fixed_expense' }],
        loans: [{
          id: 'loan_1',
          name: 'Prêt Auto',
          lender: 'Banque',
          initialAmount: 10000,
          remainingCapital: 5000, // Déjà amorti de 5000 € dans le snapshot
          monthlyPayment: 250,
          startDate: '2024-01-01',
          durationMonths: 48,
          accountId: 'acc_main'
        }],
        transactions: [
          // 2 mensualités passées réglées (amorti 250 € chacune)
          { id: 'tx_p1', date: '2024-02-05', type: 'loan_payment', amount: 250, amortizedCapital: 250, status: 'cleared', accountId: 'acc_main', linkedId: 'loan_1' },
          { id: 'tx_p2', date: '2024-03-05', type: 'loan_payment', amount: 250, amortizedCapital: 250, status: 'cleared', accountId: 'acc_main', linkedId: 'loan_1' }
        ]
      }
    };

    const res = importBackupData(db, backupWithClearedLoanPayments, { skipSafetyBackup: true });
    expect(res.success).toBe(true);

    // Le capital restant dû doit être STRICTEMENT 5000 € (et non 4500 €)
    const loan = getLoanById(db, 'loan_1');
    expect(loan).not.toBeNull();
    expect(loan!.remainingCapital).toBe(5000);
  });
});
