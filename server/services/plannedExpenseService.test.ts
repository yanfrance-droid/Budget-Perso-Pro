import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  getAllPlannedExpenses, 
  savePlannedExpense, 
  deletePlannedExpense, 
  getPlannedExpenseById 
} from './plannedExpenseService.ts';

describe('plannedExpenseService - SQLite Persistence & Business Logic', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    if (db && db.isOpen) {
      db.close();
    }
  });

  it('crée la table planned_expenses et démarre avec une liste vide', () => {
    const list = getAllPlannedExpenses(db);
    expect(list).toEqual([]);
  });

  it('enregistre et restitue une dépense prévisionnelle avec les 3 niveaux d\'urgence', () => {
    const p1 = savePlannedExpense(db, {
      label: 'Changement pneu',
      estimatedAmount: 180.50,
      urgency: 'urgent',
      notes: 'Garage auto'
    });
    expect(p1.id).toBeDefined();
    expect(p1.label).toBe('Changement pneu');
    expect(p1.estimatedAmount).toBe(180.50);
    expect(p1.urgency).toBe('urgent');
    expect(p1.notes).toBe('Garage auto');

    const p2 = savePlannedExpense(db, {
      label: 'Nouvelle TV',
      estimatedAmount: 699,
      urgency: 'medium',
      targetDate: '2026-12-25'
    });
    expect(p2.urgency).toBe('medium');
    expect(p2.targetDate).toBe('2026-12-25');

    const p3 = savePlannedExpense(db, {
      label: 'Livre photo',
      estimatedAmount: 45,
      urgency: 'low'
    });
    expect(p3.urgency).toBe('low');

    const all = getAllPlannedExpenses(db);
    expect(all).toHaveLength(3);
  });

  it('rejette les données invalides (intitulé vide, montant <= 0 ou urgence incorrecte)', () => {
    expect(() => savePlannedExpense(db, {
      label: '',
      estimatedAmount: 100,
      urgency: 'urgent'
    })).toThrowError(/intitulé/i);

    expect(() => savePlannedExpense(db, {
      label: 'Test',
      estimatedAmount: 0,
      urgency: 'urgent'
    })).toThrowError(/montant/i);

    expect(() => savePlannedExpense(db, {
      label: 'Test',
      estimatedAmount: -50,
      urgency: 'urgent'
    })).toThrowError(/montant/i);

    expect(() => savePlannedExpense(db, {
      label: 'Test',
      estimatedAmount: 100,
      urgency: 'inconnue' as any
    })).toThrowError(/urgence/i);
  });

  it('permet de modifier une dépense prévisionnelle existante', () => {
    const created = savePlannedExpense(db, {
      label: 'Canapé',
      estimatedAmount: 800,
      urgency: 'low'
    });

    const updated = savePlannedExpense(db, {
      id: created.id,
      label: 'Canapé d\'angle convertible',
      estimatedAmount: 1100,
      urgency: 'medium',
      notes: 'Promo salon'
    });

    expect(updated.id).toBe(created.id);
    expect(updated.label).toBe('Canapé d\'angle convertible');
    expect(updated.estimatedAmount).toBe(1100);
    expect(updated.urgency).toBe('medium');
    expect(updated.notes).toBe('Promo salon');

    const fetched = getPlannedExpenseById(db, created.id!);
    expect(fetched?.estimatedAmount).toBe(1100);
  });

  it('supprime une dépense prévisionnelle', () => {
    const created = savePlannedExpense(db, {
      label: 'Vélo électrique',
      estimatedAmount: 1500,
      urgency: 'medium'
    });

    expect(getAllPlannedExpenses(db)).toHaveLength(1);
    deletePlannedExpense(db, created.id!);
    expect(getAllPlannedExpenses(db)).toHaveLength(0);
    expect(getPlannedExpenseById(db, created.id!)).toBeNull();
  });

  it('garantit une isolation stricte vis-à-vis des transactions réelles', () => {
    // Ajouter une dépense prévisionnelle
    savePlannedExpense(db, {
      label: 'Projet Cuisine',
      estimatedAmount: 5000,
      urgency: 'urgent'
    });

    // Vérifier que la table des transactions bancaires réelles est totalement vide
    const txRows = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number };
    expect(txRows.count).toBe(0);

    // Vérifier les comptes
    const accRows = db.prepare('SELECT COUNT(*) as count FROM accounts').get() as { count: number };
    // Seul le compte courant par défaut issu du seed est présent
    expect(accRows.count).toBe(1);
  });
});
