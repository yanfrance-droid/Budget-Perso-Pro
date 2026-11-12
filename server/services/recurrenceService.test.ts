import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from '../db.ts';
import { 
  saveRecurrenceTemplate, 
  deleteRecurrenceTemplate, 
  generateMonthlyOccurrences,
  getAllRecurrenceTemplates,
  syncRollingHorizon
} from './recurrenceService.ts';
import { saveAccount } from './accountService.ts';
import { getTransactions, saveTransaction, deleteTransaction, restoreTransaction } from './transactionService.ts';
import { rehabilitateOrphanRecurrentTransactions } from '../db.ts';

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

    // 2. Générer les occurrences pour janvier, février et mars 2026 (avec simulation du mois de référence)
    generateMonthlyOccurrences(db, '2026-01', '2026-01');
    generateMonthlyOccurrences(db, '2026-02', '2026-01');
    generateMonthlyOccurrences(db, '2026-03', '2026-01');

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
    generateMonthlyOccurrences(db, '2026-01', '2026-01');
    generateMonthlyOccurrences(db, '2026-02', '2026-01');
    generateMonthlyOccurrences(db, '2026-03', '2026-01');
    generateMonthlyOccurrences(db, '2026-04', '2026-01');

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

  it('garantit l\'atomicité transactionnelle lors de la génération mensuelle des occurrences', () => {
    // Création de 2 modèles
    saveRecurrenceTemplate(db, {
      label: 'Loyer',
      type: 'fixed_expense',
      amount: 800,
      recurrenceDay: 5,
      startDate: '2026-05',
      accountId: 'acc1'
    });

    saveRecurrenceTemplate(db, {
      label: 'Electricite',
      type: 'fixed_expense',
      amount: 75,
      recurrenceDay: 12,
      startDate: '2026-05',
      accountId: 'acc1'
    });

    const count = generateMonthlyOccurrences(db, '2026-05', '2026-05');
    expect(count).toBe(2);

    const txs = getTransactions(db, { month: '2026-05' });
    expect(txs.length).toBe(2);
  });

  it('réhabilite automatiquement les transactions récurrentes orphelines (recurrenceDay sans templateId)', () => {
    // 1. Simuler l'insertion directe d'une transaction orpheline (comme les 5 charges trouvées en base)
    db.prepare(`
      INSERT INTO transactions (id, type, amount, date, accountId, label, recurrenceDay, templateId, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending')
    `).run('tx-orph-1', 'fixed_expense', 29.99, '2026-11-05', 'acc1', 'Abonnement Fibre Orphelin', 5);

    db.prepare(`
      INSERT INTO transactions (id, type, amount, date, accountId, label, recurrenceDay, templateId, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending')
    `).run('tx-orph-2', 'variable_expense', 50.00, '2026-11-12', 'acc1', 'Courses hebdo orphelines', 12);

    // 2. Exécuter la réhabilitation
    const res = rehabilitateOrphanRecurrentTransactions(db);
    expect(res.rehabilitatedCount).toBe(2);
    expect(res.updatedTxsCount).toBe(2);

    // 3. Vérifier que les templates correspondants ont été créés
    const templates = getAllRecurrenceTemplates(db);
    expect(templates.length).toBe(2);

    const fibreTmpl = templates.find(t => t.label === 'Abonnement Fibre Orphelin');
    expect(fibreTmpl).toBeDefined();
    expect(fibreTmpl?.recurrenceDay).toBe(5);
    expect(fibreTmpl?.amount).toBe(29.99);
    expect(Boolean(fibreTmpl?.isActive)).toBe(true);

    // 4. Vérifier que les transactions orphelines ont bien reçu le templateId
    const tx1 = db.prepare("SELECT * FROM transactions WHERE id = 'tx-orph-1'").get() as any;
    expect(tx1.templateId).toBe(fibreTmpl?.id);

    // 5. Ré-exécution idempotente : ne doit rien recréer
    const res2 = rehabilitateOrphanRecurrentTransactions(db);
    expect(res2.rehabilitatedCount).toBe(0);
    expect(res2.updatedTxsCount).toBe(0);
  });

  it('génère automatiquement les occurrences sur l\'horizon glissant M à M+12 (y compris M+3) sans régénérer le passé', () => {
    // Créer un modèle récurrent dont la date de début est antérieure (janvier 2026)
    saveRecurrenceTemplate(db, {
      label: 'Netflix Famille',
      type: 'fixed_expense',
      amount: 19.99,
      recurrenceDay: 15,
      startDate: '2026-01',
      accountId: 'acc1'
    });

    // Exécuter la synchronisation de l'horizon glissant pour 2026-11 (M = 2026-11 à M+12 = 2027-11)
    const result = syncRollingHorizon(db, '2026-11', 0, 12);

    // Le passé (2026-10 et antérieurs) ne doit absolument pas être traité
    expect(result.monthsProcessed).not.toContain('2026-10');
    expect(result.monthsProcessed).toContain('2026-11'); // M
    expect(result.monthsProcessed).toContain('2027-02'); // M+3
    expect(result.monthsProcessed).toContain('2027-11'); // M+12
    expect(result.totalCreated).toBe(13); // 2026-11 à 2027-11 = 13 mois

    // Vérifier qu'aucune transaction n'a été créée pour octobre 2026
    const octTxs = getTransactions(db, { month: '2026-10' });
    expect(octTxs.length).toBe(0);

    // Vérifier en base la présence concrète de l'occurrence M+3 (février 2027)
    const m3Txs = getTransactions(db, { month: '2027-02' });
    expect(m3Txs.length).toBe(1);
    expect(m3Txs[0].label).toBe('Netflix Famille');
    expect(m3Txs[0].date).toBe('2027-02-15');
    expect(m3Txs[0].amount).toBe(19.99);
    expect(m3Txs[0].status).toBe('planned');

    // Deuxième exécution : idempotence absolue, aucune duplication
    const secondRun = syncRollingHorizon(db, '2026-11', 0, 12);
    expect(secondRun.totalCreated).toBe(0);

    const m3TxsAfter = getTransactions(db, { month: '2027-02' });
    expect(m3TxsAfter.length).toBe(1);
  });

  it('préserve strictement le statut (cleared / pending) lors de la restauration par Undo et ne bascule pas en planned', () => {
    // 1. Créer un contrat récurrent
    const tpl = saveRecurrenceTemplate(db, {
      label: 'Box Internet SFR',
      type: 'fixed_expense',
      amount: 29.99,
      recurrenceDay: 5,
      startDate: '2026-11',
      accountId: 'acc1'
    });

    // Générer l'horizon
    syncRollingHorizon(db, '2026-11', 0, 12);

    // Pointer l'occurrence de novembre comme 'cleared'
    const txM = getTransactions(db, { month: '2026-11' }).find(t => t.templateId === tpl.id)!;
    expect(txM).toBeDefined();
    saveTransaction(db, { ...txM, status: 'cleared' });

    const clearedTx = getTransactions(db, { month: '2026-11' }).find(t => t.id === txM.id)!;
    expect(clearedTx.status).toBe('cleared');

    // 2. Supprimer la transaction (soft-delete)
    deleteTransaction(db, clearedTx.id);
    expect(getTransactions(db, { month: '2026-11' }).some(t => t.id === clearedTx.id)).toBe(false);

    // 3. Restaurer la transaction (Undo) en transmettant le statut initial comme le fait le frontend
    const restored = restoreTransaction(db, clearedTx.id, { status: 'cleared' });
    expect(restored.deleted_at).toBeNull();
    expect(restored.status).toBe('cleared');

    // Vérifier en base que la transaction dans le livre des comptes conserve son statut 'cleared'
    const verified = getTransactions(db, { month: '2026-11' }).find(t => t.id === clearedTx.id)!;
    expect(verified).toBeDefined();
    expect(verified.status).toBe('cleared');
  });

  it('valide le cycle vital : Suppression sur M -> Undo sur M -> Présence sur M ET sur M+1 à M+3', () => {
    // 1. Création d'un contrat récurrent avec horizon M-1 à M+12
    const tpl = saveRecurrenceTemplate(db, {
      label: 'Abonnement Salle de Sport',
      type: 'fixed_expense',
      amount: 34.90,
      recurrenceDay: 8,
      startDate: '2026-11',
      accountId: 'acc1'
    });

    // Générer l'horizon
    syncRollingHorizon(db, '2026-11', 1, 12);

    // Vérifier la présence initiale sur M (2026-11), M+1 (2026-12), M+2 (2027-01), M+3 (2027-02)
    const txM = getTransactions(db, { month: '2026-11' }).find(t => t.templateId === tpl.id)!;
    expect(txM).toBeDefined();
    expect(getTransactions(db, { month: '2026-12' }).some(t => t.templateId === tpl.id)).toBe(true);
    expect(getTransactions(db, { month: '2027-01' }).some(t => t.templateId === tpl.id)).toBe(true);
    expect(getTransactions(db, { month: '2027-02' }).some(t => t.templateId === tpl.id)).toBe(true);

    // 2. Simuler la désactivation ou suppression par l'utilisateur du modèle pour les mois futurs et de l'occurrence M
    // Par exemple, désactiver le template à partir de 2026-11 et soft-deleter l'occurrence de M
    saveRecurrenceTemplate(db, {
      ...tpl,
      isActive: false,
      disabledFromMonth: '2026-11'
    });
    deleteTransaction(db, txM.id);

    // Purger les mois futurs pour simuler l'état après suppression
    db.prepare('DELETE FROM transactions WHERE templateId = ? AND date > ?').run(tpl.id, '2026-11-30');

    // Vérifier que M est soft-deleted et que M+1 à M+3 n'existent plus
    expect(getTransactions(db, { month: '2026-11' }).some(t => t.id === txM.id)).toBe(false);
    expect(getTransactions(db, { month: '2026-12' }).some(t => t.templateId === tpl.id)).toBe(false);
    expect(getTransactions(db, { month: '2027-01' }).some(t => t.templateId === tpl.id)).toBe(false);
    expect(getTransactions(db, { month: '2027-02' }).some(t => t.templateId === tpl.id)).toBe(false);

    // 3. ACTION UNDO : Restauration de l'occurrence sur M
    const restored = restoreTransaction(db, txM.id);
    expect(restored.deleted_at).toBeNull();

    // 4. VÉRIFICATION DU CYCLE CONTRACTUEL :
    // a) Le template doit être réactivé en base (isActive = 1, disabledFromMonth = null)
    const tmplAfterUndo = db.prepare('SELECT * FROM recurrence_templates WHERE id = ?').get(tpl.id) as any;
    expect(Boolean(tmplAfterUndo.isActive)).toBe(true);
    expect(tmplAfterUndo.disabledFromMonth).toBeNull();
    expect(tmplAfterUndo.endDate).toBeNull();

    // b) L'occurrence sur M est bien présente et active
    const activeTxM = getTransactions(db, { month: '2026-11' }).find(t => t.templateId === tpl.id);
    expect(activeTxM).toBeDefined();
    expect(activeTxM?.id).toBe(txM.id);

    // c) Les occurrences sur M+1, M+2 et M+3 sont immédiatement recréées dans l'horizon glissant
    const txM1 = getTransactions(db, { month: '2026-12' }).find(t => t.templateId === tpl.id);
    const txM2 = getTransactions(db, { month: '2027-01' }).find(t => t.templateId === tpl.id);
    const txM3 = getTransactions(db, { month: '2027-02' }).find(t => t.templateId === tpl.id);

    expect(txM1).toBeDefined();
    expect(txM1?.amount).toBe(34.90);
    expect(txM2).toBeDefined();
    expect(txM2?.amount).toBe(34.90);
    expect(txM3).toBeDefined();
    expect(txM3?.amount).toBe(34.90);
  });

  describe('Les 3 Invariants d\'Or de la Récurrence & Étanchéité Temporelle', () => {
    it('Invariant 1 : La résiliation d\'un contrat en novembre 2026 ne touche JAMAIS aux transactions du passé (octobre 2026)', () => {
      // 1. Créer un contrat actif depuis octobre 2026
      const tpl = saveRecurrenceTemplate(db, {
        label: 'Abonnement Téléphonique',
        type: 'fixed_expense',
        amount: 19.99,
        recurrenceDay: 15,
        startDate: '2026-10',
        accountId: 'acc1'
      });

      // Générer octobre et novembre
      generateMonthlyOccurrences(db, '2026-10', '2026-10');
      generateMonthlyOccurrences(db, '2026-11');
      generateMonthlyOccurrences(db, '2026-12');

      // Pointer octobre comme débité ('cleared')
      const octTx = getTransactions(db, { month: '2026-10' }).find(t => t.templateId === tpl.id)!;
      expect(octTx).toBeDefined();
      saveTransaction(db, { ...octTx, status: 'cleared' });

      // Novembre est en attente ('pending')
      const novTx = getTransactions(db, { month: '2026-11' }).find(t => t.templateId === tpl.id)!;
      expect(novTx).toBeDefined();
      saveTransaction(db, { ...novTx, status: 'pending' });

      // Décembre est prévu ('planned')
      const decTx = getTransactions(db, { month: '2026-12' }).find(t => t.templateId === tpl.id)!;
      expect(decTx.status).toBe('planned');

      // 2. Action de résiliation à partir du 1er novembre 2026
      deleteRecurrenceTemplate(db, tpl.id, '2026-11-01');

      // 3. VÉRIFICATIONS INVARIANT 1 :
      // a) Décembre (futur planned) a bien été purgé
      const decAfter = getTransactions(db, { month: '2026-12' });
      expect(decAfter.length).toBe(0);

      // b) Octobre (passé < 2026-11-01, cleared) est STRICTEMENT PRÉSERVÉ, intact dans le Grand Livre
      const octAfter = getTransactions(db, { month: '2026-10' });
      expect(octAfter.length).toBe(1);
      expect(octAfter[0].id).toBe(octTx.id);
      expect(octAfter[0].amount).toBe(19.99);
      expect(octAfter[0].status).toBe('cleared');
      expect(octAfter[0].date).toBe('2026-10-15');

      // c) Novembre (mois courant M) a été soft-deleted en 1 clic : la ligne disparaît de l'affichage actif
      const novAfterActive = getTransactions(db, { month: '2026-11' });
      expect(novAfterActive.length).toBe(0);

      // Mais la ligne physique en base est conservée avec son statut exact 'pending' pour l'Undo
      const novRaw = db.prepare('SELECT * FROM transactions WHERE id = ?').get(novTx.id) as any;
      expect(novRaw.deleted_at).not.toBeNull();
      expect(novRaw.status).toBe('pending');
    });

    it('Invariant 2 : Une suppression absolue ne détruit JAMAIS les écritures pointées (cleared) passées', () => {
      const tpl = saveRecurrenceTemplate(db, {
        label: 'Assurance Habitation',
        type: 'fixed_expense',
        amount: 25.00,
        recurrenceDay: 5,
        startDate: '2026-08',
        accountId: 'acc1'
      });

      generateMonthlyOccurrences(db, '2026-08', '2026-08');
      generateMonthlyOccurrences(db, '2026-09', '2026-08');
      generateMonthlyOccurrences(db, '2026-10', '2026-08');

      // Pointer août et septembre
      const augTx = getTransactions(db, { month: '2026-08' })[0];
      const sepTx = getTransactions(db, { month: '2026-09' })[0];
      saveTransaction(db, { ...augTx, status: 'cleared' });
      saveTransaction(db, { ...sepTx, status: 'cleared' });

      // Octobre est planned
      const octTx = getTransactions(db, { month: '2026-10' })[0];
      expect(octTx.status).toBe('planned');

      // Appel sans fromDate (suppression du template)
      deleteRecurrenceTemplate(db, tpl.id);

      // Octobre (planned) doit être supprimé
      expect(getTransactions(db, { month: '2026-10' }).length).toBe(0);

      // Août et Septembre (cleared) DOIVENT ÊTRE CONSERVÉS dans le Grand Livre
      const augAfter = getTransactions(db, { month: '2026-08' });
      const sepAfter = getTransactions(db, { month: '2026-09' });
      expect(augAfter.length).toBe(1);
      expect(augAfter[0].status).toBe('cleared');
      expect(augAfter[0].amount).toBe(25.00);

      expect(sepAfter.length).toBe(1);
      expect(sepAfter[0].status).toBe('cleared');
      expect(sepAfter[0].amount).toBe(25.00);
    });

    it('Invariant 3 : syncRollingHorizon ne traite AUCUN mois antérieur au mois de référence', () => {
      saveRecurrenceTemplate(db, {
        label: 'Prélèvement Énergie',
        type: 'fixed_expense',
        amount: 80.00,
        recurrenceDay: 20,
        startDate: '2026-01',
        accountId: 'acc1'
      });

      // Synchronisation sur novembre 2026 avec pastMonths = 5 (doit être ignoré pour protéger le passé)
      const res = syncRollingHorizon(db, '2026-11', 5, 12);

      // Aucun mois antérieur à 2026-11 ne doit figurer dans les mois traités
      expect(res.monthsProcessed.some(m => m < '2026-11')).toBe(false);
      expect(res.monthsProcessed[0]).toBe('2026-11');

      // La base ne doit avoir AUCUNE transaction en octobre 2026
      expect(getTransactions(db, { month: '2026-10' }).length).toBe(0);
      expect(getTransactions(db, { month: '2026-09' }).length).toBe(0);
    });

    it('Invariant 4 : generateMonthlyOccurrences refuse strictement de générer le passé (< mois système courant)', () => {
      saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 30,
        recurrenceDay: 5,
        startDate: '2026-01',
        accountId: 'acc1',
        label: 'Abonnement passif'
      });

      // Appel sur un mois passé (ex: juillet 2026 alors que le système est en novembre 2026)
      const count = generateMonthlyOccurrences(db, '2026-07');
      expect(count).toBe(0);

      // Aucune transaction créée
      const txs = getTransactions(db, { month: '2026-07' });
      expect(txs.length).toBe(0);
    });
  });
});
