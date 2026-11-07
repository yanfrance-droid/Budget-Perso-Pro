import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { saveCategory, getAllCategories, getCategoryById, deleteCategory } from './categoryService.ts';
import { saveAccount } from './accountService.ts';
import { saveTransaction } from './transactionService.ts';
import { savePlannedExpense } from './plannedExpenseService.ts';
import { saveRecurrenceTemplate } from './recurrenceService.ts';

describe('categoryService - Intégrité et Archivage sécurisé', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
    saveAccount(db, {
      id: 'acc1',
      name: 'Compte Courant',
      type: 'checking',
      initialBalance: 1000,
      referenceDate: '2026-01-01'
    });
  });

  afterEach(() => {
    db.close();
  });

  it('supprime définitivement une catégorie non utilisée', () => {
    const cat = saveCategory(db, {
      name: 'Catégorie Libre',
      type: 'variable_expense'
    });

    expect(getCategoryById(db, cat.id!)).not.toBeNull();
    deleteCategory(db, cat.id!);
    expect(getCategoryById(db, cat.id!)).toBeNull();
  });

  it('archive automatiquement une catégorie si utilisée par des transactions', () => {
    const cat = saveCategory(db, {
      name: 'Alimentation',
      type: 'variable_expense'
    });

    saveTransaction(db, {
      date: '2026-11-01',
      amount: 50,
      type: 'variable_expense',
      status: 'cleared',
      accountId: 'acc1',
      categoryId: cat.id
    });

    deleteCategory(db, cat.id!);
    const retrieved = getCategoryById(db, cat.id!);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.isArchived).toBe(true);
  });

  it('archive automatiquement une catégorie si utilisée par une dépense prévisionnelle', () => {
    const cat = saveCategory(db, {
      name: 'Bricolage Devis',
      type: 'variable_expense'
    });

    savePlannedExpense(db, {
      label: 'Perceuse sans fil',
      estimatedAmount: 120,
      categoryId: cat.id,
      urgency: 'medium'
    });

    deleteCategory(db, cat.id!);
    const retrieved = getCategoryById(db, cat.id!);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.isArchived).toBe(true);
  });

  it('archive automatiquement une catégorie si utilisée par un modèle de récurrence', () => {
    const cat = saveCategory(db, {
      name: 'Abonnement Presse',
      type: 'fixed_expense'
    });

    saveRecurrenceTemplate(db, {
      label: 'Presse Hebdo',
      type: 'fixed_expense',
      amount: 15,
      recurrenceDay: 5,
      startDate: '2026-01',
      accountId: 'acc1',
      categoryId: cat.id
    });

    deleteCategory(db, cat.id!);
    const retrieved = getCategoryById(db, cat.id!);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.isArchived).toBe(true);
  });
});
