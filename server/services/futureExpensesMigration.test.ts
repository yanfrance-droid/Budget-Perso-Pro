import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase, initPreExistingFutureExpenses } from '../db';
import crypto from 'node:crypto';

describe('Migration SQLite : Initialisation unique des dépenses futures préexistantes', () => {
  let db: DatabaseSync;
  const referenceToday = '2026-10-31';

  beforeEach(() => {
    // Initialiser une base vierge en mémoire
    db = initDatabase(':memory:');
    // Supprimer le flag de migration généré à l'initialisation pour tester le comportement de la fonction de migration
    db.prepare("DELETE FROM app_settings WHERE key = 'migration_init_future_expenses_expected_date';").run();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignorer si déjà fermée
    }
  });

  it('initialise les dépenses futures éligibles sans toucher aux dépenses passées, récurrentes ou soldées', () => {
    // Récupérer le compte courant créé par défaut
    const acc = db.prepare('SELECT id FROM accounts LIMIT 1').get() as { id: string };
    const accountId = acc.id;

    const stmt = db.prepare(`
      INSERT INTO transactions (
        id, date, expectedDate, recurrenceDay, type, amount, status,
        accountId, destinationAccountId, categoryId, linkedId, label,
        notes, paymentMethod, checkNumber, amortizedCapital, templateId,
        isCustomized, isReconstituted, payerId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, ?, 0, 0, NULL)
    `);

    // 1. Dépense future éligible 1 (planned, expectedDate NULL)
    stmt.run('tx-fut-1', '2026-11-10', null, null, 'daily', 150.0, 'planned', accountId, 'Assurance', null);
    // 2. Dépense future éligible 2 (pending, expectedDate vide)
    stmt.run('tx-fut-2', '2026-12-01', '', null, 'daily', 80.0, 'pending', accountId, 'Pneus', null);
    // 3. Dépense passée ordinaire (date < referenceToday, pending) -> STRICTEMENT EXCLUE
    stmt.run('tx-past-ord', '2026-10-15', null, null, 'daily', 45.0, 'pending', accountId, 'Courses passées', null);
    // 4. Dépense future déjà dotée d'un expectedDate -> DOIT ÊTRE PRÉSERVÉE
    stmt.run('tx-fut-already', '2026-11-20', '2026-11-20', null, 'daily', 200.0, 'planned', accountId, 'Entretien', null);
    // 5. Dépense future réglée (cleared) -> EXCLUE
    stmt.run('tx-cleared', '2026-11-25', null, null, 'daily', 35.0, 'cleared', accountId, 'Déjà payé', null);
    // 6. Dépense future désactivée (disabled) -> EXCLUE
    stmt.run('tx-disabled', '2026-11-25', null, null, 'daily', 60.0, 'disabled', accountId, 'Annulé', null);
    // 7. Dépense future récurrente avec templateId -> EXCLUE
    stmt.run('tx-rec-tmpl', '2026-11-15', null, null, 'daily', 700.0, 'planned', accountId, 'Loyer récurrent', 'tmpl-1');
    // 8. Dépense future récurrente avec recurrenceDay -> EXCLUE
    stmt.run('tx-rec-day', '2026-11-15', null, 15, 'daily', 30.0, 'planned', accountId, 'Abonnement', null);
    // 9. Opération non-daily (fixed_expense) -> EXCLUE
    stmt.run('tx-fixed', '2026-11-05', null, null, 'fixed_expense', 500.0, 'planned', accountId, 'Charge fixe', null);

    const initialTotalCount = (db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }).count;
    expect(initialTotalCount).toBe(9);

    // Exécuter la migration avec la date de référence
    const result = initPreExistingFutureExpenses(db, referenceToday);

    // Exactement 2 transactions doivent avoir été mises à jour
    expect(result.executed).toBe(true);
    expect(result.updatedCount).toBe(2);

    // Vérifier les transactions mises à jour
    const txFut1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-fut-1') as any;
    expect(txFut1.expectedDate).toBe('2026-11-10');
    expect(txFut1.amount).toBe(150.0);
    expect(txFut1.label).toBe('Assurance');

    const txFut2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-fut-2') as any;
    expect(txFut2.expectedDate).toBe('2026-12-01');

    // Vérifier que la dépense passée ordinaire n'a PAS reçu d'expectedDate
    const txPastOrd = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-past-ord') as any;
    expect(txPastOrd.expectedDate).toBeNull();

    // Vérifier que la dépense déjà initialisée n'a pas été modifiée
    const txAlready = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-fut-already') as any;
    expect(txAlready.expectedDate).toBe('2026-11-20');

    // Vérifier que les dépenses exclues n'ont pas reçu d'expectedDate
    const txCleared = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-cleared') as any;
    expect(txCleared.expectedDate).toBeNull();

    const txDisabled = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-disabled') as any;
    expect(txDisabled.expectedDate).toBeNull();

    const txRecTmpl = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-rec-tmpl') as any;
    expect(txRecTmpl.expectedDate).toBeNull();

    const txRecDay = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-rec-day') as any;
    expect(txRecDay.expectedDate).toBeNull();

    const txFixed = db.prepare('SELECT * FROM transactions WHERE id = ?').get('tx-fixed') as any;
    expect(txFixed.expectedDate).toBeNull();

    // Vérifier qu'aucune transaction n'a été créée ni supprimée
    const finalTotalCount = (db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number }).count;
    expect(finalTotalCount).toBe(9);

    // Vérifier l'indicateur persistant dans app_settings
    const settingRow = db.prepare("SELECT value FROM app_settings WHERE key = 'migration_init_future_expenses_expected_date'").get() as any;
    expect(settingRow).toBeDefined();
    const parsedSetting = JSON.parse(settingRow.value);
    expect(parsedSetting.updatedCount).toBe(2);
    expect(parsedSetting.referenceDate).toBe(referenceToday);

    // Seconde exécution : DOIT ÊTRE STRICTEMENT SANS EFFET (Idempotence)
    const secondResult = initPreExistingFutureExpenses(db, referenceToday);
    expect(secondResult.executed).toBe(false);
    expect(secondResult.updatedCount).toBe(0);
  });
});
