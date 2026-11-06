import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  saveAccount, 
  deleteAccount, 
  getAccountById, 
  getAllAccounts 
} from './accountService.ts';
import { saveTransaction } from './transactionService.ts';
import { saveLoan } from './loanService.ts';
import { saveRecurrenceTemplate } from './recurrenceService.ts';

describe('accountService - Sécurité lors de la suppression de compte (CRITIQUE-05)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('bloque la suppression si des opérations (transactions) sont rattachées au compte', () => {
    const acc = saveAccount(db, {
      name: 'Compte Courant',
      type: 'checking',
      initialBalance: 1000,
      referenceDate: '2026-01-01'
    });

    saveTransaction(db, {
      accountId: acc.id,
      date: '2026-01-15',
      type: 'daily',
      amount: 45.0,
      status: 'cleared'
    });

    expect(() => deleteAccount(db, acc.id!)).toThrow(
      'Impossible de supprimer ce compte : des opérations financières y sont associées.'
    );
  });

  it('bloque la suppression si un prêt est rattaché au compte', () => {
    const acc = saveAccount(db, {
      name: 'Compte Prêt',
      type: 'checking',
      initialBalance: 500,
      referenceDate: '2026-01-01'
    });

    saveLoan(db, {
      name: 'Prêt Auto',
      lender: 'Banque',
      initialAmount: 5000,
      remainingCapital: 4000,
      monthlyPayment: 150,
      startDate: '2026-01-01',
      durationMonths: 36,
      accountId: acc.id!
    });

    expect(() => deleteAccount(db, acc.id!)).toThrow(
      'Impossible de supprimer ce compte : un prêt en cours y est associé.'
    );
  });

  it('bloque la suppression si un modèle récurrent est rattaché au compte (CRITIQUE-05)', () => {
    const acc = saveAccount(db, {
      name: 'Compte Débit Prélèvements',
      type: 'checking',
      initialBalance: 500,
      referenceDate: '2026-01-01'
    });

    saveRecurrenceTemplate(db, {
      label: 'Abonnement Téléphonique',
      type: 'fixed_expense',
      amount: 19.99,
      recurrenceDay: 5,
      startDate: '2026-01',
      accountId: acc.id!
    });

    expect(() => deleteAccount(db, acc.id!)).toThrow(
      "Impossible de supprimer ce compte : un modèle d'opération récurrente y est associé."
    );
  });

  it('bloque la suppression si un modèle récurrent pointe vers le compte en destinationAccountId (virement épargne)', () => {
    const mainAcc = saveAccount(db, {
      name: 'Compte Courant Principal',
      type: 'checking',
      initialBalance: 2000,
      referenceDate: '2026-01-01'
    });

    const savingsAcc = saveAccount(db, {
      name: 'Livret A',
      type: 'savings',
      initialBalance: 5000,
      referenceDate: '2026-01-01'
    });

    saveRecurrenceTemplate(db, {
      label: 'Virement mensuel épargne',
      type: 'transfer',
      amount: 200,
      recurrenceDay: 1,
      startDate: '2026-01',
      accountId: mainAcc.id!,
      destinationAccountId: savingsAcc.id!
    });

    expect(() => deleteAccount(db, savingsAcc.id!)).toThrow(
      "Impossible de supprimer ce compte : un modèle d'opération récurrente y est associé."
    );
  });

  it('supprime proprement un compte lorsqu\'aucune transaction, prêt ni modèle récurrent n\'y est associé', () => {
    const acc = saveAccount(db, {
      name: 'Compte Temporaire Inutilisé',
      type: 'checking',
      initialBalance: 0,
      referenceDate: '2026-01-01'
    });

    expect(getAccountById(db, acc.id!)).not.toBeNull();
    expect(() => deleteAccount(db, acc.id!)).not.toThrow();
    expect(getAccountById(db, acc.id!)).toBeNull();
  });
});
