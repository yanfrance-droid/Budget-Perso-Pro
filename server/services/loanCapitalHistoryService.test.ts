import { test, describe, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { 
  getAllLoanCapitalHistory, 
  saveLoanCapitalRecord, 
  deleteLoanCapitalRecord, 
  clearLoanCapitalHistory, 
  exportLoanCapitalHistory, 
  importLoanCapitalHistory 
} from './loanCapitalHistoryService.ts';

describe('LoanCapitalHistoryService (isolated in-memory)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    // Base de données SQLite purement en mémoire pour isoler totalement les tests
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE loan_capital_history (
        month TEXT PRIMARY KEY,
        real_estate_capital REAL,
        real_estate_monthly_payment REAL,
        consumer_capital REAL,
        consumer_monthly_payment REAL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_loan_capital_history_month ON loan_capital_history(month);
    `);
  });

  afterEach(() => {
    db.close();
  });

  test('enregistre et récupère un enregistrement avec succès', () => {
    const saved = saveLoanCapitalRecord(db, {
      month: '2024-05',
      realEstateCapital: 150000,
      realEstateMonthlyPayment: 950,
      consumerCapital: 12000,
      consumerMonthlyPayment: 320,
      notes: 'Test mai 2024'
    });

    expect(saved.month).toBe('2024-05');
    expect(saved.realEstateCapital).toBe(150000);
    expect(saved.consumerCapital).toBe(12000);

    const all = getAllLoanCapitalHistory(db);
    expect(all.length).toBe(1);
    expect(all[0].month).toBe('2024-05');
  });

  test('gère les valeurs nulles correctement (ex: pas de crédit conso avant décembre 2023)', () => {
    saveLoanCapitalRecord(db, {
      month: '2019-07',
      realEstateCapital: 185000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const all = getAllLoanCapitalHistory(db);
    expect(all[0].consumerCapital).toBeNull();
    expect(all[0].consumerMonthlyPayment).toBeNull();
    expect(all[0].realEstateCapital).toBe(185000);
  });

  test('rejette un format de mois invalide', () => {
    expect(() => {
      saveLoanCapitalRecord(db, {
        month: 'invalid-date',
        realEstateCapital: 100000,
        realEstateMonthlyPayment: 500,
        consumerCapital: null,
        consumerMonthlyPayment: null
      });
    }).toThrow(/Format de mois invalide/);
  });

  test('exporte au format structuré PersonalBudgetPro_LoanCapitalHistory', () => {
    saveLoanCapitalRecord(db, {
      month: '2023-12',
      realEstateCapital: 160000,
      realEstateMonthlyPayment: 950,
      consumerCapital: 15000,
      consumerMonthlyPayment: 350
    });

    const exported = exportLoanCapitalHistory(db);
    expect(exported.format).toBe('PersonalBudgetPro_LoanCapitalHistory');
    expect(exported.version).toBe(1);
    expect(exported.metadata.totalRecords).toBe(1);
    expect(exported.metadata.startMonth).toBe('2023-12');
    expect(exported.records.length).toBe(1);
  });

  test('importe et remplace dans une transaction atomique', () => {
    saveLoanCapitalRecord(db, {
      month: '2020-01',
      realEstateCapital: 180000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const payload = {
      format: 'PersonalBudgetPro_LoanCapitalHistory',
      version: 1,
      records: [
        {
          month: '2023-12',
          realEstateCapital: 160000,
          realEstateMonthlyPayment: 950,
          consumerCapital: 15000,
          consumerMonthlyPayment: 350
        },
        {
          month: '2024-01',
          realEstateCapital: 159000,
          realEstateMonthlyPayment: 950,
          consumerCapital: 14700,
          consumerMonthlyPayment: 350
        }
      ]
    };

    const res = importLoanCapitalHistory(db, payload, 'replace');
    expect(res.importedCount).toBe(2);

    const all = getAllLoanCapitalHistory(db);
    expect(all.length).toBe(2);
    expect(all[0].month).toBe('2023-12');
    expect(all[1].month).toBe('2024-01');
  });

  test('annule intégralement l\'import si un doublon ou une erreur survient (Rollback)', () => {
    saveLoanCapitalRecord(db, {
      month: '2020-01',
      realEstateCapital: 180000,
      realEstateMonthlyPayment: 950,
      consumerCapital: null,
      consumerMonthlyPayment: null
    });

    const invalidPayload = {
      format: 'PersonalBudgetPro_LoanCapitalHistory',
      version: 1,
      records: [
        { month: '2024-01', realEstateCapital: 100000 },
        { month: '2024-01', realEstateCapital: 99000 } // Doublon
      ]
    };

    expect(() => {
      importLoanCapitalHistory(db, invalidPayload, 'replace');
    }).toThrow(/Doublon détecté/);

    // Vérifie que l'enregistrement initial n'a pas été supprimé par le Rollback
    const all = getAllLoanCapitalHistory(db);
    expect(all.length).toBe(1);
    expect(all[0].month).toBe('2020-01');
  });
});
