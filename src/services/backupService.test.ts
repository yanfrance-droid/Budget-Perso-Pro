// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  validateBackupData,
  triggerBackupDownload,
  type BackupDataV1
} from './backupService';

describe('backupService - validateBackupData & triggerBackupDownload', () => {
  const validBackup: BackupDataV1 = {
    version: '1.0',
    exportDate: '2026-10-24T10:00:00.000Z',
    appName: 'PersonalBudgetPro',
    tables: {
      accounts: [{ id: 'acc-1', name: 'Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' }],
      categories: [{ id: 'cat-1', name: 'Alimentation', type: 'fixed_expense', isArchived: false }],
      transactions: [{ id: 'tx-1', date: '2026-10-24', amount: 25, type: 'fixed_expense', status: 'cleared', accountId: 'acc-1', categoryId: 'cat-1' }],
      loans: [{ id: 'loan-1', name: 'Immobilier', lender: 'Banque', initialAmount: 150000, remainingCapital: 150000, monthlyPayment: 750, startDate: '2025-01-01', durationMonths: 240, accountId: 'acc-1', isArchived: false }]
    },
    localStorage: {
      manualBalance: '1000',
      card1: '500',
      card2: '200'
    }
  };

  it('valide avec succès une sauvegarde conforme v1.0', () => {
    const result = validateBackupData(validBackup);
    expect(result.isValid).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.summary?.accountsCount).toBe(1);
    expect(result.summary?.categoriesCount).toBe(1);
    expect(result.summary?.transactionsCount).toBe(1);
    expect(result.summary?.loansCount).toBe(1);
  });

  it('valide avec succès une sauvegarde conforme v1.1 avec recurrenceTemplates', () => {
    const backupV11: BackupDataV1 = {
      ...validBackup,
      version: '1.1',
      tables: {
        ...validBackup.tables,
        recurrenceTemplates: [
          { id: 'tpl-1', type: 'fixed_expense', amount: 50, recurrenceDay: 5, accountId: 'acc-1', categoryId: 'cat-1', label: 'Internet', startDate: '2026-01', isActive: true }
        ]
      }
    };
    const result = validateBackupData(backupV11);
    expect(result.isValid).toBe(true);
    expect(result.summary?.recurrenceTemplatesCount).toBe(1);
  });

  it('rejette un objet null, non-objet ou tableau', () => {
    expect(validateBackupData(null).isValid).toBe(false);
    expect(validateBackupData('test').isValid).toBe(false);
    expect(validateBackupData([]).isValid).toBe(false);
  });

  it('rejette une sauvegarde avec appName erroné', () => {
    const result = validateBackupData({ ...validBackup, appName: 'AutreApp' });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('appName');
  });

  it('accepte une version 2.0 valide', () => {
    const backupV20: any = {
      ...validBackup,
      version: '2.0',
      tables: {
        ...validBackup.tables,
        loanCapitalHistory: []
      }
    };
    const result = validateBackupData(backupV20);
    expect(result.isValid).toBe(true);
    expect(result.summary?.version).toBe('2.0');
  });

  it('rejette une version inconnue', () => {
    const result = validateBackupData({ ...validBackup, version: '3.0' as any });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Version de format non prise en charge');
  });

  it('rejette une sauvegarde sans tables', () => {
    const result = validateBackupData({ ...validBackup, tables: null as any });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('tables');
  });

  it('rejette une table contenant des éléments sans ID', () => {
    const corrupted = {
      ...validBackup,
      tables: {
        ...validBackup.tables,
        accounts: [{ name: 'Sans ID', type: 'checking' } as any]
      }
    };
    const result = validateBackupData(corrupted);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('identifiant');
  });

  it('déclenche le téléchargement du fichier via triggerBackupDownload', () => {
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');
    const clickMock = vi.fn();

    const createElementOrig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = createElementOrig(tagName);
      if (tagName === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    triggerBackupDownload(validBackup, 'test_export.json');

    expect(appendChildSpy).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
