import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from './db.ts';
import { createServer } from './app.ts';
import { apiClient } from '../src/services/apiClient.ts';

describe('Server & API Integration - SQLite Centralized Backend', () => {
  let db: DatabaseSync;
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeEach(async () => {
    // 1. Initialisation d'une base SQLite complètement isolée en mémoire
    db = initDatabase(':memory:');
    server = createServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        apiClient.setBaseUrl(baseUrl);
        apiClient.setToken(null);
        resolve();
      });
    });
  });

  afterEach(async () => {
    apiClient.setToken(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  describe('1. Authentification, Sécurité & Gestion des sessions', () => {
    it('sans utilisateur, toutes les routes privées de lecture et d\'écriture sont strictement refusées (401)', async () => {
      // 1. Lecture (GET)
      const resGetAccounts = await fetch(`${baseUrl}/api/accounts`);
      expect(resGetAccounts.status).toBe(401);
      const errGet = await resGetAccounts.json();
      expect(errGet.error).toBe('Accès non autorisé : configuration initiale requise.');

      const resGetTxs = await fetch(`${baseUrl}/api/transactions`);
      expect(resGetTxs.status).toBe(401);

      const resGetLoans = await fetch(`${baseUrl}/api/loans`);
      expect(resGetLoans.status).toBe(401);

      // 2. Écriture / Modification métier (POST, PATCH, DELETE)
      const resPostAcc = await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Piratage', type: 'checking', initialBalance: 1000 })
      });
      expect(resPostAcc.status).toBe(401);

      const resDeleteAcc = await fetch(`${baseUrl}/api/accounts/acc_test`, {
        method: 'DELETE'
      });
      expect(resDeleteAcc.status).toBe(401);

      const resPostTx = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100, type: 'variable_expense' })
      });
      expect(resPostTx.status).toBe(401);

      const resPatchStatus = await fetch(`${baseUrl}/api/transactions/tx_123/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cleared' })
      });
      expect(resPatchStatus.status).toBe(401);

      // 3. Importation, Restauration et Maintenance système (POST, DELETE)
      const resImport = await fetch(`${baseUrl}/api/migration/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '1.1', appName: 'PersonalBudgetPro', tables: {}, localStorage: {} })
      });
      expect(resImport.status).toBe(401);

      const resReset = await fetch(`${baseUrl}/api/maintenance/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reseedDefaults: false })
      });
      expect(resReset.status).toBe(401);

      const resRestoreDb = await fetch(`${baseUrl}/api/maintenance/restore-db`, {
        method: 'POST'
      });
      expect(resRestoreDb.status).toBe(401);

      const resDeleteLogs = await fetch(`${baseUrl}/api/maintenance/logs`, {
        method: 'DELETE'
      });
      expect(resDeleteLogs.status).toBe(401);
    });

    it('la route /api/health est publique et indique qu\'aucun utilisateur n\'existe au départ', async () => {
      const health = await apiClient.health();
      expect(health.status).toBe('ok');
      expect(health.hasUsers).toBe(false);
    });

    it('permet l\'initialisation du premier compte administrateur via /api/auth/setup et le verrouille ensuite', async () => {
      // 1. Initialisation réussie du premier compte
      const setupRes = await apiClient.auth.setup('admin', 'monSuperMotDePasse123');
      expect(setupRes.user.username).toBe('admin');
      expect(setupRes.token).toBeDefined();

      // 2. Health confirme que des utilisateurs existent désormais
      const health = await apiClient.health();
      expect(health.hasUsers).toBe(true);

      // 3. Une seconde tentative d'initialisation est immédiatement refusée (403)
      const secondAttempt = await fetch(`${baseUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', password: 'password123' })
      });
      expect(secondAttempt.status).toBe(403);
    });

    it('avec un utilisateur existant, toute requête sans session est rejetée (401)', async () => {
      // Création du compte
      await apiClient.auth.setup('admin', 'monSuperMotDePasse123');

      // Tentatives sans jeton d'authentification
      const resGet = await fetch(`${baseUrl}/api/accounts`);
      expect(resGet.status).toBe(401);
      const errGet = await resGet.json();
      expect(errGet.error).toBe('Accès non autorisé : authentification requise.');

      const resPost = await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50, type: 'variable_expense' })
      });
      expect(resPost.status).toBe(401);

      const resDelete = await fetch(`${baseUrl}/api/categories/cat_123`, {
        method: 'DELETE'
      });
      expect(resDelete.status).toBe(401);
    });

    it('avec une session valide, les accès autorisés continuent de fonctionner parfaitement', async () => {
      const setupRes = await apiClient.auth.setup('admin', 'monSuperMotDePasse123');
      apiClient.setToken(setupRes.token);

      // 1. Consultation profil
      const me = await apiClient.auth.me();
      expect(me.user.username).toBe('admin');

      // 2. Opérations métier
      const newAcc = await apiClient.accounts.save({
        name: 'Compte Principal',
        type: 'checking',
        initialBalance: 2500,
        referenceDate: '2026-10-01'
      });
      expect(newAcc.id).toBeDefined();

      const allAccounts = await apiClient.accounts.getAll();
      expect(allAccounts.length).toBeGreaterThanOrEqual(1);

      const newTx = await apiClient.transactions.save({
        date: '2026-10-24',
        amount: 45.5,
        type: 'variable_expense',
        status: 'cleared',
        accountId: newAcc.id,
        label: 'Courses'
      });
      expect(newTx.id).toBeDefined();

      const allTxs = await apiClient.transactions.getAll();
      expect(allTxs.find(t => t.id === newTx.id)).toBeDefined();
    });

    it('refuse une connexion avec des identifiants invalides', async () => {
      await apiClient.auth.setup('admin', 'monMotDePasse123');

      await expect(apiClient.auth.login('admin', 'mauvaisMotDePasse'))
        .rejects
        .toThrow('Identifiants invalides.');

      await expect(apiClient.auth.login('inconnu', 'monMotDePasse123'))
        .rejects
        .toThrow('Identifiants invalides.');
    });

    it('permet la déconnexion et invalide le jeton de session', async () => {
      const loginRes = await apiClient.auth.setup('admin', 'monMotDePasse123');
      apiClient.setToken(loginRes.token);

      const meBefore = await apiClient.auth.me();
      expect(meBefore.user.username).toBe('admin');

      await apiClient.auth.logout();

      // Le jeton étant invalidé en base, la requête suivante doit être refusée
      apiClient.setToken(loginRes.token);
      await expect(apiClient.auth.me())
        .rejects
        .toThrow();
    });
  });

  describe('2. Opérations CRUD Comptes, Catégories, Opérations & Épargne', () => {
    let token: string;

    beforeEach(async () => {
      const auth = await apiClient.auth.setup('testuser', 'password123');
      token = auth.token;
      apiClient.setToken(token);
    });

    it('gère le cycle de vie des comptes et des catégories', async () => {
      // Vérification du compte courant créé par défaut au démarrage vierge
      const initialAccounts = await apiClient.accounts.getAll();
      expect(initialAccounts.length).toBe(1);
      expect(initialAccounts[0].name).toBe('Compte Courant');

      // Mise à jour du compte principal
      const account = await apiClient.accounts.save({
        id: initialAccounts[0].id,
        name: 'Compte Courant Principal',
        type: 'checking',
        initialBalance: 1500,
        referenceDate: '2026-10-01'
      });
      expect(account.id).toBeDefined();
      expect(account.name).toBe('Compte Courant Principal');

      // Création compte épargne
      const savingsAcc = await apiClient.accounts.save({
        name: 'Livret A Test',
        type: 'savings',
        subType: 'livret_a',
        initialBalance: 5000,
        referenceDate: '2026-10-01'
      });
      expect(savingsAcc.subType).toBe('livret_a');

      // Création catégorie
      const cat = await apiClient.categories.save({
        name: 'Alimentation & Courses',
        type: 'daily',
        isArchived: false
      });
      expect(cat.id).toBeDefined();

      const allAccounts = await apiClient.accounts.getAll();
      expect(allAccounts.length).toBe(2);

      const allCats = await apiClient.categories.getAll();
      expect(allCats.length).toBe(1);

      // Suppression
      await apiClient.categories.delete(cat.id);
      const remainingCats = await apiClient.categories.getAll();
      expect(remainingCats.length).toBe(0);
    });

    it('gère les transactions et la mise à jour de statut', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Principal',
        type: 'checking',
        initialBalance: 1000,
        referenceDate: '2026-10-01'
      });

      const tx = await apiClient.transactions.save({
        label: 'Supermarché',
        amount: 85.50,
        type: 'daily',
        status: 'planned',
        date: '2026-10-15',
        accountId: acc.id
      });
      expect(tx.id).toBeDefined();
      expect(tx.status).toBe('planned');

      // Changement de statut vers cleared
      const updatedTx = await apiClient.transactions.updateStatus(tx.id, 'cleared');
      expect(updatedTx.status).toBe('cleared');

      const allTx = await apiClient.transactions.getAll();
      expect(allTx.length).toBe(1);
      expect(allTx[0].status).toBe('cleared');

      // Suppression
      await apiClient.transactions.delete(tx.id);
      const emptyTx = await apiClient.transactions.getAll();
      expect(emptyTx.length).toBe(0);
    });
  });

  describe('3. Crédits, Mensualités & Calcul du Capital Restant Dû', () => {
    let token: string;

    beforeEach(async () => {
      const auth = await apiClient.auth.setup('testuser', 'password123');
      token = auth.token;
      apiClient.setToken(token);
    });

    it('met à jour le capital restant dû atomiquement lors de la validation d\'une mensualité', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Prêt',
        type: 'checking',
        initialBalance: 2000,
        referenceDate: '2026-10-01'
      });

      // Création d'un prêt de 10 000 € avec mensualité de 500 € (taux 0% pour test simple)
      const loan = await apiClient.loans.save({
        name: 'Prêt Immo Test',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 500,
        interestRate: 0,
        insurancePart: 0,
        startDate: '2026-01-01',
        durationMonths: 24,
        endDate: '2028-01-01',
        accountId: acc.id
      });
      expect(loan.remainingCapital).toBe(10000);

      // Création de la mensualité liée au prêt
      const payment = await apiClient.transactions.save({
        label: 'Mensualité Prêt Immo Test',
        amount: 500,
        type: 'loan_payment',
        status: 'planned',
        date: '2026-10-10',
        accountId: acc.id,
        loanId: loan.id
      });

      // 1. Validation de la mensualité (passage à cleared)
      const resCleared = await apiClient.loans.updatePaymentStatus(payment.id, 'cleared');
      expect(resCleared.payment.status).toBe('cleared');
      expect(resCleared.loan.remainingCapital).toBe(9500); // 10 000 - 500

      // Vérification en relisant directement depuis le serveur
      const loansAfter = await apiClient.loans.getAll();
      expect(loansAfter[0].remainingCapital).toBe(9500);

      // 2. Dévalidation (retour à planned) : restauration du capital restant dû
      const resReverted = await apiClient.loans.updatePaymentStatus(payment.id, 'planned');
      expect(resReverted.payment.status).toBe('planned');
      expect(resReverted.loan.remainingCapital).toBe(10000);

      const loansReverted = await apiClient.loans.getAll();
      expect(loansReverted[0].remainingCapital).toBe(10000);
    });

    it('gère l\'archivage, le désarchivage (via /unarchive et /archive) et la réactivation des échéances futures via les routes HTTP réelles', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Prêt Archivage',
        type: 'checking',
        initialBalance: 3000,
        referenceDate: '2026-10-01'
      });

      const loan = await apiClient.loans.save({
        name: 'Prêt Test Archivage HTTP',
        lender: 'Banque Route',
        initialAmount: 6000,
        remainingCapital: 6000,
        monthlyPayment: 200,
        startDate: '2026-01-01',
        durationMonths: 30,
        accountId: acc.id
      });
      expect(loan.isArchived).toBe(false);

      // Création d'une échéance future planned
      const futureTx = await apiClient.transactions.save({
        label: 'Mensualité future',
        amount: 200,
        type: 'loan_payment',
        status: 'planned',
        date: '2099-05-15',
        accountId: acc.id,
        loanId: loan.id
      });

      // 1. Archivage via POST /api/loans/:id/archive avec désactivation des échéances futures
      const archiveRes = await apiClient.loans.archive(loan.id, true, true);
      expect(archiveRes.loan.isArchived).toBe(true);
      expect(archiveRes.disabledCount).toBe(1);

      // Vérifier que la transaction est passée à disabled
      const txsAfterArchive = await apiClient.transactions.getAll();
      const disabledTx = txsAfterArchive.find(t => t.id === futureTx.id);
      expect(disabledTx?.status).toBe('disabled');

      // 2. Désarchivage via POST /api/loans/:id/unarchive
      const unarchiveRes = await apiClient.loans.unarchive(loan.id);
      expect(unarchiveRes.loan.isArchived).toBe(false);

      // L'échéance reste disabled sans réactivation automatique
      const txsAfterUnarchive = await apiClient.transactions.getAll();
      expect(txsAfterUnarchive.find(t => t.id === futureTx.id)?.status).toBe('disabled');

      // 3. Réactivation explicite via POST /api/loans/:id/reactivate-future
      const reactivateRes = await apiClient.loans.reactivateFuture(loan.id);
      expect(reactivateRes.reactivatedCount).toBe(1);

      const txsAfterReactivate = await apiClient.transactions.getAll();
      expect(txsAfterReactivate.find(t => t.id === futureTx.id)?.status).toBe('planned');

      // 4. Test de désarchivage alternatif via POST /api/loans/:id/archive avec { isArchived: false }
      await apiClient.loans.archive(loan.id, true, false);
      const loansArchivedAgain = await apiClient.loans.getAll();
      expect(loansArchivedAgain.find(l => l.id === loan.id)?.isArchived).toBe(true);

      const unarchiveViaArchiveRoute = await apiClient.loans.archive(loan.id, false, false);
      expect(unarchiveViaArchiveRoute.loan.isArchived).toBe(false);
    });
  });

  describe('4. Récurrences sans doublons', () => {
    let token: string;

    beforeEach(async () => {
      const auth = await apiClient.auth.setup('testuser', 'password123');
      token = auth.token;
      apiClient.setToken(token);
    });

    it('génère les occurrences mensuelles sans créer de doublon lors de régénérations successives', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Courant',
        type: 'checking',
        initialBalance: 3000,
        referenceDate: '2026-10-01'
      });

      // Modèle récurrent : Loyer de 800 € le 5 de chaque mois
      const tpl = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Loyer mensuel',
        amount: 800,
        accountId: acc.id,
        recurrenceDay: 5,
        startDate: '2026-10',
        isActive: true
      });
      expect(tpl.id).toBeDefined();

      // Première génération pour 2026-11
      const generatedCount1 = await apiClient.recurrence.generateOccurrences('2026-11');
      expect(generatedCount1).toBe(1);

      const txsAfterGen1 = await apiClient.transactions.getAll();
      expect(txsAfterGen1.length).toBe(1);
      expect(txsAfterGen1[0].label).toBe('Loyer mensuel');
      expect(txsAfterGen1[0].date).toBe('2026-11-05');

      // Deuxième appel immédiat pour le même mois : doit détecter l'existence et ne pas doubler
      const generatedCount2 = await apiClient.recurrence.generateOccurrences('2026-11');
      expect(generatedCount2).toBe(0);

      const txsAfterGen2 = await apiClient.transactions.getAll();
      expect(txsAfterGen2.length).toBe(1); // Strictement 1 transaction, aucun doublon !
    });

    it('génère la date exacte pour un jour 31 : 30 novembre, 31 décembre, 31 janvier, 31 mars et 28/29 février', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Courant',
        type: 'checking',
        initialBalance: 5000,
        referenceDate: '2026-10-01'
      });

      // Charge programmée le 31 du mois
      const tpl = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Abonnement fin de mois',
        amount: 49.99,
        accountId: acc.id,
        recurrenceDay: 31,
        startDate: '2026-10',
        isActive: true
      });
      expect(tpl.id).toBeDefined();

      // Novembre 2026 (30 jours)
      await apiClient.recurrence.generateOccurrences('2026-11');
      // Décembre 2026 (31 jours)
      await apiClient.recurrence.generateOccurrences('2026-12');
      // Janvier 2027 (31 jours)
      await apiClient.recurrence.generateOccurrences('2027-01');
      // Février 2027 (28 jours - année non bissextile)
      await apiClient.recurrence.generateOccurrences('2027-02');
      // Mars 2027 (31 jours)
      await apiClient.recurrence.generateOccurrences('2027-03');
      // Février 2028 (29 jours - année bissextile)
      await apiClient.recurrence.generateOccurrences('2028-02');

      const txs = await apiClient.transactions.getAll();
      const byMonth = new Map(txs.filter(t => t.templateId === tpl.id).map(t => [t.date.slice(0, 7), t.date]));

      expect(byMonth.get('2026-11')).toBe('2026-11-30'); // Repli sur le dernier jour du mois
      expect(byMonth.get('2026-12')).toBe('2026-12-31');
      expect(byMonth.get('2027-01')).toBe('2027-01-31');
      expect(byMonth.get('2027-02')).toBe('2027-02-28'); // Repli sur 28 février
      expect(byMonth.get('2027-03')).toBe('2027-03-31');
      expect(byMonth.get('2028-02')).toBe('2028-02-29'); // Repli sur 29 février (bissextile)
    });

    it('gère correctement les jours 28, 29 et 30 dans les mois de différentes longueurs', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Courant',
        type: 'checking',
        initialBalance: 5000,
        referenceDate: '2026-10-01'
      });

      // Modèle jour 30
      const tpl30 = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Charge jour 30',
        amount: 30,
        accountId: acc.id,
        recurrenceDay: 30,
        startDate: '2026-10',
        isActive: true
      });

      // Modèle jour 29
      const tpl29 = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Charge jour 29',
        amount: 29,
        accountId: acc.id,
        recurrenceDay: 29,
        startDate: '2026-10',
        isActive: true
      });

      // Modèle jour 28
      const tpl28 = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Charge jour 28',
        amount: 28,
        accountId: acc.id,
        recurrenceDay: 28,
        startDate: '2026-10',
        isActive: true
      });

      // Générer pour nov 2026 (30 jours), fév 2027 (28 jours), fév 2028 (29 jours), déc 2026 (31 jours)
      await apiClient.recurrence.generateOccurrences('2026-11');
      await apiClient.recurrence.generateOccurrences('2026-12');
      await apiClient.recurrence.generateOccurrences('2027-02');
      await apiClient.recurrence.generateOccurrences('2028-02');

      const allTxs = await apiClient.transactions.getAll();

      // Vérifications pour tpl30
      const txs30 = new Map(allTxs.filter(t => t.templateId === tpl30.id).map(t => [t.date.slice(0, 7), t.date]));
      expect(txs30.get('2026-11')).toBe('2026-11-30');
      expect(txs30.get('2026-12')).toBe('2026-12-30');
      expect(txs30.get('2027-02')).toBe('2027-02-28'); // Repli car fév n'a que 28 jours
      expect(txs30.get('2028-02')).toBe('2028-02-29'); // Repli car fév bissextile n'a que 29 jours

      // Vérifications pour tpl29
      const txs29 = new Map(allTxs.filter(t => t.templateId === tpl29.id).map(t => [t.date.slice(0, 7), t.date]));
      expect(txs29.get('2026-11')).toBe('2026-11-29');
      expect(txs29.get('2027-02')).toBe('2027-02-28'); // Repli en non bissextile
      expect(txs29.get('2028-02')).toBe('2028-02-29'); // Conservé en bissextile

      // Vérifications pour tpl28
      const txs28 = new Map(allTxs.filter(t => t.templateId === tpl28.id).map(t => [t.date.slice(0, 7), t.date]));
      expect(txs28.get('2026-11')).toBe('2026-11-28');
      expect(txs28.get('2027-02')).toBe('2027-02-28');
    });

    it('préserve le statut désactivé pour les charges désactivées durablement', async () => {
      const acc = await apiClient.accounts.save({
        name: 'Compte Courant',
        type: 'checking',
        initialBalance: 5000,
        referenceDate: '2026-10-01'
      });

      // Modèle actif au départ
      const tpl = await apiClient.recurrence.saveTemplate({
        type: 'fixed_expense',
        label: 'Service résiliable',
        amount: 15,
        accountId: acc.id,
        recurrenceDay: 31,
        startDate: '2026-10',
        isActive: true
      });

      // Générer pour novembre pendant que le modèle est actif
      await apiClient.recurrence.generateOccurrences('2026-11');

      let txs = await apiClient.transactions.getAll();
      expect(txs.find(t => t.templateId === tpl.id && t.date === '2026-11-30')?.status).toBe('planned');

      // Désactiver durablement à partir de décembre 2026
      await apiClient.recurrence.saveTemplate({
        ...tpl,
        disabledFromMonth: '2026-12',
        isActive: false
      });

      // Générer décembre 2026 (égal à disabledFromMonth -> disabled)
      await apiClient.recurrence.generateOccurrences('2026-12');
      // Générer janvier 2027 (postérieur à disabledFromMonth -> disabled)
      await apiClient.recurrence.generateOccurrences('2027-01');

      txs = await apiClient.transactions.getAll();
      const novTx = txs.find(t => t.templateId === tpl.id && t.date === '2026-11-30');
      expect(novTx?.status).toBe('planned'); // L'occurrence antérieure à décembre reste planned !

      const decTx = txs.find(t => t.templateId === tpl.id && t.date === '2026-12-31');
      expect(decTx?.status).toBe('disabled');

      const janTx = txs.find(t => t.templateId === tpl.id && t.date === '2027-01-31');
      expect(janTx?.status).toBe('disabled');
    });
  });

  describe('5. Réglages du tableau de bord centralisés (SQLite)', () => {
    let token: string;

    beforeEach(async () => {
      const auth = await apiClient.auth.setup('testuser', 'password123');
      token = auth.token;
      apiClient.setToken(token);
    });

    it('persiste et restitue le solde manuel et les encours CB sur SQLite', async () => {
      await apiClient.settings.saveDashboard({
        manualBalance: '2450.75',
        card1: '120.00',
        card2: '45.50'
      });

      const settings = await apiClient.settings.getDashboard();
      expect(settings.manualBalance).toBe('2450.75');
      expect(settings.card1).toBe('120.00');
      expect(settings.card2).toBe('45.50');
    });
  });

  describe('6. Isolation Dexie : Les opérations serveur s\'exécutent exclusivement sur SQLite', () => {
    let token: string;

    beforeEach(async () => {
      const auth = await apiClient.auth.setup('testuser', 'password123');
      token = auth.token;
      apiClient.setToken(token);
    });

    it('écrit et persiste exclusivement dans SQLite via l\'API REST', async () => {
      const defaultAccs = await apiClient.accounts.getAll();
      const defaultId = defaultAccs[0].id;
      const acc = await apiClient.accounts.save({
        id: defaultId,
        name: 'Compte Serveur Pure SQLite',
        type: 'checking',
        initialBalance: 5000,
        referenceDate: '2026-10-01'
      });

      const tx = await apiClient.transactions.save({
        label: 'Achat Serveur Pure SQLite',
        amount: 150,
        type: 'daily',
        status: 'cleared',
        date: '2026-10-18',
        accountId: acc.id
      });

      // Vérification SQLite
      const sqliteTxs = await apiClient.transactions.getAll();
      expect(sqliteTxs.length).toBe(1);
      expect(sqliteTxs[0].id).toBe(tx.id);
      expect(sqliteTxs[0].label).toBe('Achat Serveur Pure SQLite');

      const sqliteAccounts = await apiClient.accounts.getAll();
      expect(sqliteAccounts.length).toBe(1);
      expect(sqliteAccounts[0].name).toBe('Compte Serveur Pure SQLite');
    });

    it('supprime intégralement les dépenses prévisionnelles lors d\'un reset via /api/maintenance/reset', async () => {
      // 1. Créer des dépenses prévisionnelles via l'API
      const p1 = await apiClient.plannedExpenses.save({
        label: 'Projet Cuisine',
        estimatedAmount: 3500,
        urgency: 'urgent'
      });
      const p2 = await apiClient.plannedExpenses.save({
        label: 'Table de jardin',
        estimatedAmount: 200,
        urgency: 'low'
      });

      let plannedList = await apiClient.plannedExpenses.getAll();
      expect(plannedList.length).toBe(2);

      // 2. Déclencher la réinitialisation de la base
      const resetRes = await apiClient.maintenance.reset(true);
      expect(resetRes.success).toBe(true);

      // 3. Vérifier directement via l'API et en base SQLite que planned_expenses est vide
      plannedList = await apiClient.plannedExpenses.getAll();
      expect(plannedList.length).toBe(0);

      const dbCheck = db.prepare('SELECT COUNT(*) as c FROM planned_expenses').get() as { c: number };
      expect(dbCheck.c).toBe(0);
    });

    it('rejette la route de redémarrage si non authentifié, et l\'exécute proprement lorsque authentifié', async () => {
      // 1. Sans token
      apiClient.setToken(null);
      const unauthRes = await fetch(`${baseUrl}/api/maintenance/restart`, { method: 'POST' });
      expect(unauthRes.status).toBe(401);

      // 2. Avec token (déjà setup via le beforeEach de la suite)
      apiClient.setToken(token);
      const restartRes = await apiClient.maintenance.restartServer();
      expect(restartRes.success).toBe(true);
      expect(restartRes.message).toContain('Signal de redémarrage reçu');
    });

    it('rejette avec HTTP 413 les requêtes dont le corps dépasse la limite de sécurité', async () => {
      apiClient.setToken(token);
      // Générer un payload dépassant 15 Mo
      const chunk1Mb = 'x'.repeat(1024 * 1024);
      const parts: string[] = [];
      for (let i = 0; i < 16; i++) {
        parts.push(chunk1Mb);
      }
      const oversizedPayload = parts.join('');

      const res = await fetch(`${baseUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ huge: oversizedPayload })
      });

      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.error).toContain('trop volumineux');
    });
  });
});
