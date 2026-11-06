import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  saveRecurrenceTemplate, 
  deleteRecurrenceTemplate, 
  generateMonthlyOccurrences,
  getAllRecurrenceTemplates
} from './recurrenceService.ts';
import { saveAccount } from './accountService.ts';
import { getTransactions, saveTransaction } from './transactionService.ts';

describe('recurrenceService - Propagation et Suppression sécurisée (CRITIQUE-01, 07, MOYEN-01)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
    saveAccount(db, {
      id: 'acc1',
      name: 'Compte Courant',
      type: 'checking',
      initialBalance: 2000,
      referenceDate: '2026-01-01'
    });
  });

  afterEach(() => {
    db.close();
  });

  it('propage la modification d\'une charge récurrente sur les occurrences futures non personnalisées et non pointées', () => {
    // 1. Créer un modèle récurrent mensuel
    const tpl = saveRecurrenceTemplate(db, {
      label: 'Internet Fibre',
      type: 'fixed_expense',
      amount: 39.99,
      recurrenceDay: 10,
      startDate: '2026-01',
      accountId: 'acc1'
    });

    // 2. Générer les occurrences pour janvier, février et mars 2026
    generateMonthlyOccurrences(db, '2026-01');
    generateMonthlyOccurrences(db, '2026-02');
    generateMonthlyOccurrences(db, '2026-03');

    let txs = getTransactions(db);
    expect(txs.length).toBe(3);

    // Pointer janvier comme payée (cleared)
    const janTx = txs.find(t => t.date.startsWith('2026-01'))!;
    saveTransaction(db, { ...janTx, status: 'cleared' });

    // Personnaliser février (isCustomized = 1, ex: montant modifié spécifiquement ce mois-ci)
    const febTx = txs.find(t => t.date.startsWith('2026-02'))!;
    saveTransaction(db, { ...febTx, amount: 45.0, isCustomized: 1 });

    // Mars est non pointée (planned) et non personnalisée
    const marTx = txs.find(t => t.date.startsWith('2026-03'))!;
    expect(marTx.amount).toBe(39.99);

    // 3. Modifier le modèle en appliquant aux mois futurs à partir de février (2026-02-10) : nouveau prix 42.99 €
    saveRecurrenceTemplate(db, {
      id: tpl.id,
      label: 'Internet Fibre Pro',
      type: 'fixed_expense',
      amount: 42.99,
      recurrenceDay: 15,
      startDate: '2026-01',
      accountId: 'acc1',
      updateFutureOccurrencesFromDate: '2026-02-10'
    });

    txs = getTransactions(db);
    const updatedJan = txs.find(t => t.date.startsWith('2026-01'))!;
    const updatedFeb = txs.find(t => t.date.startsWith('2026-02'))!;
    const updatedMar = txs.find(t => t.date.startsWith('2026-03'))!;

    // Janvier (passé et cleared) reste totalement intact
    expect(updatedJan.amount).toBe(39.99);
    expect(updatedJan.status).toBe('cleared');
    expect(updatedJan.date).toBe('2026-01-10');

    // Février (isCustomized = 1) est préservé et non écrasé
    expect(updatedFeb.amount).toBe(45.0);

    // Mars (date > 2026-02-10, non cleared, non customized) a bien été mis à jour avec le nouveau montant et le nouveau jour
    expect(updatedMar.amount).toBe(42.99);
    expect(updatedMar.label).toBe('Internet Fibre Pro');
    expect(updatedMar.date).toBe('2026-03-15');
  });

  it('ne détruit pas les transactions passées impayées lors de la suppression d\'un modèle récurrent', () => {
    // 1. Créer un modèle récurrent
    const tpl = saveRecurrenceTemplate(db, {
      label: 'Salle de sport',
      type: 'fixed_expense',
      amount: 29.99,
      recurrenceDay: 5,
      startDate: '2026-01',
      accountId: 'acc1'
    });

    // 2. Générer occurrences janvier (passé), février (passé impayé), mars (mois courant) et avril (futur)
    generateMonthlyOccurrences(db, '2026-01');
    generateMonthlyOccurrences(db, '2026-02');
    generateMonthlyOccurrences(db, '2026-03');
    generateMonthlyOccurrences(db, '2026-04');

    let txs = getTransactions(db);
    expect(txs.length).toBe(4);

    // Janvier est cleared
    const janTx = txs.find(t => t.date.startsWith('2026-01'))!;
    saveTransaction(db, { ...janTx, status: 'cleared' });

    // Février est resté en retard / impayé (pending)
    const febTx = txs.find(t => t.date.startsWith('2026-02'))!;
    saveTransaction(db, { ...febTx, status: 'pending' });

    // 3. Supprimer le modèle à partir du mois courant Mars (fromDate = '2026-03-01')
    deleteRecurrenceTemplate(db, tpl.id, '2026-03-01');

    txs = getTransactions(db);

    // Mars et Avril (>= 2026-03-01 et non cleared) doivent être supprimés
    expect(txs.some(t => t.date.startsWith('2026-03'))).toBe(false);
    expect(txs.some(t => t.date.startsWith('2026-04'))).toBe(false);

    // Janvier (passé cleared) et Février (passé pending/impayé) DOIVENT être conservés
    const remainingJan = txs.find(t => t.date.startsWith('2026-01'));
    const remainingFeb = txs.find(t => t.date.startsWith('2026-02'));

    expect(remainingJan).toBeDefined();
    expect(remainingJan?.status).toBe('cleared');
    expect(remainingJan?.templateId).toBeNull(); // templateId détaché

    expect(remainingFeb).toBeDefined();
    expect(remainingFeb?.status).toBe('pending');
    expect(remainingFeb?.amount).toBe(29.99);
    expect(remainingFeb?.templateId).toBeNull(); // templateId détaché

    // Le modèle est bien supprimé
    expect(getAllRecurrenceTemplates(db).length).toBe(0);
  });
});
