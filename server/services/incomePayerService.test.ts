import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  getAllIncomePayers, 
  getIncomePayerById, 
  saveIncomePayer, 
  deleteIncomePayer 
} from './incomePayerService.ts';
import { saveAccount } from './accountService.ts';
import { saveTransaction, getTransactions } from './transactionService.ts';
import { saveRecurrenceTemplate, generateMonthlyOccurrences } from './recurrenceService.ts';

describe('incomePayerService & Payer Persistence', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('1. Initialisation : aucun organisme verseur par défaut', () => {
    const payers = getAllIncomePayers(db);
    expect(payers).toEqual([]);
    expect(payers.length).toBe(0);
  });

  it('2. Création, consultation et mise à jour d\'un organisme verseur', () => {
    const created = saveIncomePayer(db, {
      name: 'Entreprise Employeur SAS'
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Entreprise Employeur SAS');
    expect(created.isArchived).toBe(false);
    expect(created.createdAt).toBeDefined();

    const retrieved = getIncomePayerById(db, created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Entreprise Employeur SAS');

    // Mise à jour (renommage et archivage)
    const updated = saveIncomePayer(db, {
      id: created.id,
      name: 'Employeur Global Inc.',
      isArchived: true
    });
    expect(updated.name).toBe('Employeur Global Inc.');
    expect(updated.isArchived).toBe(true);

    const all = getAllIncomePayers(db);
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Employeur Global Inc.');
  });

  it('3. Suppression : autorisée si aucune opération ni modèle n\'y fait référence', () => {
    const payer = saveIncomePayer(db, { name: 'Organisme Temporaire' });
    expect(getAllIncomePayers(db).length).toBe(1);

    deleteIncomePayer(db, payer.id);
    expect(getAllIncomePayers(db).length).toBe(0);
  });

  it('4. Protection : bloque la suppression si une transaction utilise ce payerId', () => {
    const payer = saveIncomePayer(db, { name: 'Caisse Allocations' });
    const acc = getAllAccounts(db)[0];

    saveTransaction(db, {
      id: 'tx_alloc_01',
      date: '2026-10-05',
      type: 'income',
      amount: 450,
      status: 'cleared',
      accountId: acc.id,
      payerId: payer.id,
      label: 'Allocations familiales'
    });

    expect(() => deleteIncomePayer(db, payer.id)).toThrow(/des revenus y sont associés/);
    expect(getAllIncomePayers(db).length).toBe(1);
  });

  it('5. Protection : bloque la suppression si un modèle de récurrence utilise ce payerId', () => {
    const payer = saveIncomePayer(db, { name: 'Client Freelance' });
    const acc = getAllAccounts(db)[0];

    saveRecurrenceTemplate(db, {
      id: 'tmpl_freelance_01',
      type: 'income',
      amount: 1500,
      accountId: acc.id,
      payerId: payer.id,
      label: 'Contrat mensuel Freelance',
      frequency: 'monthly',
      recurrenceDay: 28,
      status: 'active',
      startDate: '2026-01-01'
    });

    expect(() => deleteIncomePayer(db, payer.id)).toThrow(/des revenus récurrents y sont associés/);
  });

  it('6. Récurrence : propage fidèlement le payerId lors de la génération des occurrences mensuelles', () => {
    const payer = saveIncomePayer(db, { name: 'CPAM Indemnités' });
    const acc = getAllAccounts(db)[0];

    saveRecurrenceTemplate(db, {
      id: 'tmpl_cpam_01',
      type: 'income',
      amount: 800,
      accountId: acc.id,
      payerId: payer.id,
      label: 'Indemnités journalières',
      frequency: 'monthly',
      recurrenceDay: 10,
      isActive: true,
      startDate: '2026-01-01'
    });

    const generatedCount = generateMonthlyOccurrences(db, '2026-11');
    expect(generatedCount).toBe(1);

    const txs = getTransactions(db, { type: 'income' });
    expect(txs.length).toBe(1);
    expect(txs[0].payerId).toBe(payer.id);
  });
});

function getAllAccounts(db: DatabaseSync) {
  return db.prepare('SELECT * FROM accounts').all() as any[];
}
