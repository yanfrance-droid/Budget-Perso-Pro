import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from './db.ts';
import { registerUser, authenticateUser, validateSession, hasAnyUser } from './auth.ts';
import { saveAccount, getAllAccounts, getAccountById, deleteAccount } from './services/accountService.ts';
import { saveCategory, getAllCategories, deleteCategory } from './services/categoryService.ts';
import { saveTransaction, getTransactions, getTransactionById, deleteTransaction } from './services/transactionService.ts';
import { saveLoan, getAllLoans, getLoanById, updateLoanPaymentStatus } from './services/loanService.ts';
import { saveRecurrenceTemplate, getAllRecurrenceTemplates, generateMonthlyOccurrences } from './services/recurrenceService.ts';
import { savePlannedExpense, getAllPlannedExpenses } from './services/plannedExpenseService.ts';
import { importBackupData, exportBackupData } from './services/migrationService.ts';
import { createServer } from './app.ts';
import http from 'node:http';

describe('Suite de tests d\'intégration du Backend Serveur (SQLite natif)', () => {
  let db: DatabaseSync;
  const originalEnvDbPath = process.env.DB_PATH;

  beforeEach(() => {
    // Utiliser une base SQLite en mémoire pour chaque test (isolation totale)
    process.env.DB_PATH = ':memory:';
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
    process.env.DB_PATH = originalEnvDbPath;
  });

  describe('1. Authentification et Sessions', () => {
    it('crée un premier utilisateur avec mot de passe haché par scrypt et vérifie la session', () => {
      expect(hasAnyUser(db)).toBe(false);

      const reg = registerUser(db, 'admin', 'SuperMotDePasse123');
      const userId = typeof reg === 'object' ? reg.userId : reg;
      expect(userId).toBeDefined();
      expect(hasAnyUser(db)).toBe(true);

      // Tentative avec mauvais mot de passe
      const fail = authenticateUser(db, 'admin', 'MauvaisPass');
      expect(fail).toBeNull();

      // Authentification valide
      const session = authenticateUser(db, 'admin', 'SuperMotDePasse123');
      expect(session).not.toBeNull();
      expect(session?.username).toBe('admin');
      expect(session?.token.length).toBe(64);

      // Validation du token de session
      const validated = validateSession(db, session?.token);
      expect(validated).not.toBeNull();
      expect(validated?.userId).toBe(userId);
    });
  });

  describe('2. Gestion des Comptes et Catégories', () => {
    it('enregistre et restitue les comptes avec typage strict', () => {
      const defaultAcc = getAllAccounts(db)[0];
      const acc = saveAccount(db, {
        id: defaultAcc.id,
        name: 'Compte Courant Principal',
        type: 'checking',
        subType: 'checking',
        initialBalance: 1500.50,
        referenceDate: '2026-10-01'
      });

      expect(acc.id).toBeDefined();
      expect(acc.initialBalance).toBe(1500.50);
      expect(acc.isClosed).toBe(false);

      const all = getAllAccounts(db);
      expect(all.length).toBe(1);
      expect(all[0].name).toBe('Compte Courant Principal');
    });

    it('bloque la suppression d\'un compte si des transactions y sont rattachées', () => {
      const acc = saveAccount(db, {
        name: 'Compte A',
        type: 'checking',
        initialBalance: 100,
        referenceDate: '2026-10-01'
      });

      saveTransaction(db, {
        date: '2026-10-15',
        type: 'daily',
        amount: 25.0,
        status: 'cleared',
        accountId: acc.id!
      });

      expect(() => deleteAccount(db, acc.id!)).toThrow(/des opérations financières y sont associées/);
    });

    it('archive une catégorie au lieu de la supprimer si elle possède des transactions', () => {
      const cat = saveCategory(db, {
        name: 'Alimentation',
        type: 'variable_expense',
        color: '#ff0000'
      });

      const acc = saveAccount(db, {
        name: 'Compte Test',
        type: 'checking',
        initialBalance: 500,
        referenceDate: '2026-10-01'
      });

      saveTransaction(db, {
        date: '2026-10-10',
        type: 'variable_expense',
        amount: 40.0,
        status: 'cleared',
        accountId: acc.id!,
        categoryId: cat.id
      });

      deleteCategory(db, cat.id!);
      const all = getAllCategories(db);
      expect(all.length).toBe(1);
      expect(all[0].isArchived).toBe(true);
    });

    it('permet la mise à jour partielle d\'un compte sans exiger type ou referenceDate', () => {
      const acc = saveAccount(db, {
        name: 'Livret A',
        type: 'savings',
        subType: 'livret_a',
        initialBalance: 1500,
        referenceDate: '2026-01-01',
        interestRate: 3.0
      });

      // Mise à jour partielle (ex: modification du nom et du solde uniquement)
      const updated = saveAccount(db, {
        id: acc.id,
        name: 'Livret A Modifié',
        initialBalance: 2000
      } as any);

      expect(updated.name).toBe('Livret A Modifié');
      expect(updated.initialBalance).toBe(2000);
      expect(updated.type).toBe('savings');
      expect(updated.subType).toBe('livret_a');
      expect(updated.referenceDate).toBe('2026-01-01');
      expect(updated.interestRate).toBe(3.0);
    });
  });

  describe('3. Règle métier des crédits et déduction du capital', () => {
    it('déduit le capital restant dû lors du passage à cleared et le restitue si annulé', () => {
      const acc = saveAccount(db, {
        name: 'Compte Débit Prêt',
        type: 'checking',
        initialBalance: 2000,
        referenceDate: '2026-10-01'
      });

      const loan = saveLoan(db, {
        name: 'Prêt Personnel Auto',
        lender: 'Banque Test',
        initialAmount: 10000,
        remainingCapital: 10000,
        monthlyPayment: 500,
        interestRate: 0,
        insurancePart: 0,
        startDate: '2026-10',
        durationMonths: 20,
        accountId: acc.id!
      });

      // Création d'une mensualité prévue
      const payment = saveTransaction(db, {
        date: '2026-10-05',
        type: 'loan_payment',
        amount: 500,
        status: 'planned',
        accountId: acc.id!,
        linkedId: loan.id,
        amortizedCapital: 500
      });

      // 1. Passage à cleared -> le capital restant dû doit passer à 9 500 €
      const resultCleared = updateLoanPaymentStatus(db, payment.id!, 'cleared');
      expect(resultCleared.loan.remainingCapital).toBe(9500);
      expect(resultCleared.payment.status).toBe('cleared');

      // 2. Rétablissement vers planned -> le capital doit être restauré à 10 000 €
      const resultReverted = updateLoanPaymentStatus(db, payment.id!, 'planned');
      expect(resultReverted.loan.remainingCapital).toBe(10000);
      expect(resultReverted.payment.status).toBe('planned');
    });
  });

  describe('4. Récurrences et Génération automatique mensuelle', () => {
    it('génère les occurrences prévues du mois et évite les doublons', () => {
      const acc = saveAccount(db, {
        name: 'Compte Récurrence',
        type: 'checking',
        initialBalance: 1000,
        referenceDate: '2026-10-01'
      });

      saveRecurrenceTemplate(db, {
        type: 'fixed_expense',
        amount: 45.0,
        recurrenceDay: 12,
        accountId: acc.id!,
        label: 'Abonnement Internet',
        startDate: '2026-11',
        isActive: true
      });

      // Première génération
      const count1 = generateMonthlyOccurrences(db, '2026-11');
      expect(count1).toBe(1);

      const txs = getTransactions(db, { month: '2026-11' });
      expect(txs.length).toBe(1);
      expect(txs[0].amount).toBe(45.0);
      expect(txs[0].label).toBe('Abonnement Internet');
      expect(txs[0].status).toBe('planned');

      // Deuxième exécution : ne doit pas recréer de doublon
      const count2 = generateMonthlyOccurrences(db, '2026-11');
      expect(count2).toBe(0);
      const txsAfter = getTransactions(db, { month: '2026-11' });
      expect(txsAfter.length).toBe(1);
    });
  });

  describe('5. Importation, Exportation et Restauration JSON SQLite (Remplacement Intégral)', () => {
    const sampleBackup = {
      version: '1.1',
      exportDate: '2026-10-18T10:00:00.000Z',
      appName: 'PersonalBudgetPro',
      tables: {
        accounts: [
          { id: 'acc-1', name: 'Courant Proxmox', type: 'checking', initialBalance: 2500, referenceDate: '2026-10-01' },
          { id: 'acc-2', name: 'Livret Épargne', type: 'savings', initialBalance: 12000, referenceDate: '2026-10-01' }
        ],
        categories: [
          { id: 'cat-1', name: 'Salaire', type: 'income', isArchived: false },
          { id: 'cat-2', name: 'Courses', type: 'daily', isArchived: false }
        ],
        transactions: [
          { id: 'tx-1', date: '2026-10-01', type: 'income', amount: 3200, status: 'cleared', accountId: 'acc-1', categoryId: 'cat-1', label: 'Salaire Octobre' },
          { id: 'tx-2', date: '2026-10-05', type: 'daily', amount: 85.50, status: 'cleared', accountId: 'acc-1', categoryId: 'cat-2', label: 'Supermarché' }
        ],
        loans: [
          { id: 'loan-1', name: 'Immobilier', lender: 'Banque Test', initialAmount: 150000, remainingCapital: 125000, monthlyPayment: 780, startDate: '2020-01', durationMonths: 240, accountId: 'acc-1' }
        ],
        recurrenceTemplates: [
          { id: 'tmpl-1', type: 'fixed_expense', amount: 45.0, recurrenceDay: 5, accountId: 'acc-1', categoryId: 'cat-2', label: 'Box Internet', startDate: '2026-01' }
        ]
      },
      localStorage: {
        manualBalance: '2500',
        card1: '150',
        card2: '0'
      }
    };

    it('1. exporte fidèlement les données présentes dans SQLite', () => {
      // Insertion préalable de données
      const acc = saveAccount(db, { id: 'acc-exp', name: 'Compte Export', type: 'checking', initialBalance: 1000, referenceDate: '2026-10-01' });
      const cat = saveCategory(db, { id: 'cat-exp', name: 'Catégorie Export', type: 'income' });
      saveTransaction(db, { id: 'tx-exp', date: '2026-10-15', amount: 500, type: 'income', status: 'cleared', accountId: acc.id!, categoryId: cat.id, label: 'Prime' });
      saveLoan(db, { id: 'loan-exp', name: 'Prêt Export', lender: 'Banque', initialAmount: 5000, remainingCapital: 4000, monthlyPayment: 200, startDate: '2026-01', durationMonths: 25, accountId: acc.id! });
      saveRecurrenceTemplate(db, { id: 'tmpl-exp', type: 'fixed_expense', amount: 30, recurrenceDay: 10, accountId: acc.id!, startDate: '2026-01', label: 'Assurance' });
      savePlannedExpense(db, { id: 'plan-exp', label: 'Nouvel Ordinateur', estimatedAmount: 1299.99, urgency: 'urgent', notes: 'Besoin télétravail' });

      // Configuration app_settings
      const stmt = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
      stmt.run('manualBalance', '999');
      stmt.run('card1', '123');

      const exported = exportBackupData(db);

      expect(exported.appName).toBe('PersonalBudgetPro');
      expect(exported.version).toBe('2.0');
      expect(typeof exported.exportDate).toBe('string');
      expect(exported.tables.accounts.find(a => a.id === 'acc-exp')).toBeDefined();
      expect(exported.tables.categories.find(c => c.id === 'cat-exp')).toBeDefined();
      expect(exported.tables.transactions.find(t => t.id === 'tx-exp')?.amount).toBe(500);
      expect(exported.tables.loans.find(l => l.id === 'loan-exp')).toBeDefined();
      expect(exported.tables.recurrenceTemplates?.find(r => r.id === 'tmpl-exp')).toBeDefined();
      expect(exported.tables.plannedExpenses?.find(p => p.id === 'plan-exp')?.estimatedAmount).toBe(1299.99);
      expect(exported.localStorage?.manualBalance).toBe('999');
      expect(exported.localStorage?.card1).toBe('123');
    });

    it('2. restaure un fichier valide et crée une sauvegarde SQLite de sécurité', () => {
      const result = importBackupData(db, sampleBackup as any);
      expect(result.success).toBe(true);
      expect(result.importedAccounts).toBe(2);
      expect(result.importedCategories).toBe(2);
      expect(result.importedTransactions).toBe(2);
      expect(result.importedLoans).toBe(1);
      expect(result.importedRecurrenceTemplates).toBe(1);
      expect(result.importedPlannedExpenses).toBe(0);
      expect(result.dashboardSettings.manualBalance).toBe('2500');
      expect(result.safetyBackupPath).toBeDefined();

      const accs = getAllAccounts(db);
      expect(accs.length).toBe(2);
      const txs = getTransactions(db);
      expect(txs.length).toBe(2);
    });

    it('3. effectue un REMPLACEMENT INTÉGRAL sans fusion (les anciennes données sont supprimées)', () => {
      // 1. État initial avec des données A
      saveAccount(db, { id: 'old-acc', name: 'Ancien Compte A Écraser', type: 'checking', initialBalance: 100, referenceDate: '2026-10-01' });
      saveCategory(db, { id: 'old-cat', name: 'Ancienne Catégorie', type: 'daily' });
      saveTransaction(db, { id: 'old-tx', date: '2026-10-10', amount: 50, type: 'daily', status: 'cleared', accountId: 'old-acc' });

      expect(getAllAccounts(db).some(a => a.id === 'old-acc')).toBe(true);
      expect(getTransactions(db).some(t => t.id === 'old-tx')).toBe(true);

      // 2. Restauration du payload sampleBackup (qui ne contient pas old-acc ni old-tx)
      const result = importBackupData(db, sampleBackup as any);
      expect(result.success).toBe(true);

      // 3. Vérification : AUCUNE donnée ancienne n'a été conservée par fusion
      const accounts = getAllAccounts(db);
      expect(accounts.some(a => a.id === 'old-acc')).toBe(false);
      expect(accounts.length).toBe(2);
      expect(accounts.map(a => a.id).sort()).toEqual(['acc-1', 'acc-2'].sort());

      const txs = getTransactions(db);
      expect(txs.some(t => t.id === 'old-tx')).toBe(false);
      expect(txs.length).toBe(2);

      const cats = getAllCategories(db);
      expect(cats.some(c => c.id === 'old-cat')).toBe(false);
    });

    it('4. rejette un fichier invalide SANS modifier les données existantes', () => {
      // Données existantes
      saveAccount(db, { id: 'safe-acc', name: 'Compte Préservé', type: 'checking', initialBalance: 777, referenceDate: '2026-10-01' });

      // Payload invalide (mauvais appName)
      const invalidBackup = {
        ...sampleBackup,
        appName: 'MaliciousApp'
      };

      expect(() => importBackupData(db, invalidBackup as any)).toThrow(/application inconnue/);

      // Vérifier que la base est restée intacte
      const accs = getAllAccounts(db);
      expect(accs.length).toBe(2);
      const safeAcc = accs.find(a => a.id === 'safe-acc');
      expect(safeAcc).toBeDefined();
      expect(safeAcc?.initialBalance).toBe(777);
    });

    it('5. effectue un ROLLBACK COMPLET en cas d\'erreur simulée durant la transaction', () => {
      // Données existantes
      saveAccount(db, { id: 'rollback-acc', name: 'Compte Rollback', type: 'checking', initialBalance: 1234, referenceDate: '2026-10-01' });
      saveCategory(db, { id: 'rollback-cat', name: 'Catégorie Rollback', type: 'income' });
      saveTransaction(db, { id: 'rollback-tx', date: '2026-10-01', amount: 100, type: 'income', status: 'cleared', accountId: 'rollback-acc', categoryId: 'rollback-cat' });

      // Tentative d'importation avec simulation d'échec dans la transaction
      expect(() => {
        importBackupData(db, sampleBackup as any, { simulateFailureInTransaction: true });
      }).toThrow(/Rollback complet effectué/);

      // Vérifier que les données d'origine sont 100% intactes
      const accs = getAllAccounts(db);
      expect(accs.length).toBe(2);
      const rollbackAcc = accs.find(a => a.id === 'rollback-acc');
      expect(rollbackAcc).toBeDefined();
      expect(rollbackAcc?.initialBalance).toBe(1234);

      const txs = getTransactions(db);
      expect(txs.length).toBe(1);
      expect(txs[0].id).toBe('rollback-tx');
    });

    it('6. vérifie la cohérence des clés étrangères et rejette les références orphelines', () => {
      const orphanTxBackup = {
        ...sampleBackup,
        tables: {
          ...sampleBackup.tables,
          transactions: [
            { id: 'tx-orphan', date: '2026-10-01', amount: 50, type: 'daily', status: 'cleared', accountId: 'acc-inexistant' }
          ]
        }
      };

      expect(() => importBackupData(db, orphanTxBackup as any)).toThrow(/fait référence à un compte inexistant/);
    });

    it('7. préserve impérativement les comptes utilisateurs et sessions actives après restauration', () => {
      // Créer un utilisateur et une session
      const reg = registerUser(db, 'admin_proxmox', 'PasswordSecurise2026!');
      const userId = typeof reg === 'object' ? reg.userId : reg;
      const session = authenticateUser(db, 'admin_proxmox', 'PasswordSecurise2026!');
      expect(session).not.toBeNull();

      // Restaurer un backup
      const result = importBackupData(db, sampleBackup as any);
      expect(result.success).toBe(true);

      // Vérifier que la session et l'utilisateur sont TOUJOURS présents et valides
      const validated = validateSession(db, session!.token);
      expect(validated).not.toBeNull();
      expect(validated?.userId).toBe(userId);
      expect(hasAnyUser(db)).toBe(true);
    });

    it('8. sauvegarde et restaure intégralement les dépenses prévisionnelles en préservant leurs attributs', () => {
      // 1. Créer plusieurs dépenses prévisionnelles avec montants et urgences variés
      savePlannedExpense(db, {
        id: 'plan-1',
        label: 'Remplacement chauffe-eau',
        estimatedAmount: 850.50,
        urgency: 'urgent',
        targetDate: '2026-11-15',
        notes: 'Devis reçu du plombier'
      });
      savePlannedExpense(db, {
        id: 'plan-2',
        label: 'Peinture salon',
        estimatedAmount: 320,
        urgency: 'medium',
        targetDate: '2026-12-01',
        notes: '2 couches blanc velours'
      });
      savePlannedExpense(db, {
        id: 'plan-3',
        label: 'Enceinte Bluetooth',
        estimatedAmount: 89.90,
        urgency: 'low',
        notes: 'Optionnel'
      });

      // 2. Export JSON
      const exportedBackup = exportBackupData(db);
      expect(exportedBackup.tables.plannedExpenses).toHaveLength(3);

      // 3. Simuler la perte / modification des données en base
      db.exec('DELETE FROM planned_expenses;');
      expect(getAllPlannedExpenses(db)).toHaveLength(0);

      // 4. Restaurer la sauvegarde JSON
      const result = importBackupData(db, exportedBackup);
      expect(result.success).toBe(true);
      expect(result.importedPlannedExpenses).toBe(3);

      // 5. Vérifier la conformité exacte des données restaurées
      const restored = getAllPlannedExpenses(db);
      expect(restored).toHaveLength(3);

      const p1 = restored.find(p => p.id === 'plan-1');
      expect(p1).toBeDefined();
      expect(p1?.label).toBe('Remplacement chauffe-eau');
      expect(p1?.estimatedAmount).toBe(850.50);
      expect(p1?.urgency).toBe('urgent');
      expect(p1?.targetDate).toBe('2026-11-15');
      expect(p1?.notes).toBe('Devis reçu du plombier');

      const p2 = restored.find(p => p.id === 'plan-2');
      expect(p2).toBeDefined();
      expect(p2?.label).toBe('Peinture salon');
      expect(p2?.estimatedAmount).toBe(320);
      expect(p2?.urgency).toBe('medium');

      const p3 = restored.find(p => p.id === 'plan-3');
      expect(p3).toBeDefined();
      expect(p3?.label).toBe('Enceinte Bluetooth');
      expect(p3?.estimatedAmount).toBe(89.90);
      expect(p3?.urgency).toBe('low');
      expect(p3?.notes).toBe('Optionnel');
    });

    it('9. restaure sans erreur une ancienne sauvegarde (rétrocompatibilité sans plannedExpenses)', () => {
      // Données existantes dans la base avant restauration
      savePlannedExpense(db, {
        id: 'plan-pre',
        label: 'Dépense existante',
        estimatedAmount: 100,
        urgency: 'low'
      });

      // Restauration d'une sauvegarde v1.0 ou v1.1 antérieure n'ayant pas de plannedExpenses
      const oldBackup = {
        ...sampleBackup,
        tables: {
          accounts: sampleBackup.tables.accounts,
          categories: sampleBackup.tables.categories,
          transactions: sampleBackup.tables.transactions,
          loans: sampleBackup.tables.loans
          // Pas de recurrenceTemplates, ni de incomePayers, ni de plannedExpenses
        }
      };

      const result = importBackupData(db, oldBackup as any);
      expect(result.success).toBe(true);
      expect(result.importedPlannedExpenses).toBe(0);

      // Conformément au remplacement intégral, la base est synchronisée avec la sauvegarde ancienne
      const restored = getAllPlannedExpenses(db);
      expect(restored).toHaveLength(0);
    });
  });

  describe('6. API REST HTTP et Serveur', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeEach(async () => {
      server = createServer(db);
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', () => {
          const address = server.address() as any;
          baseUrl = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('répond correctement sur /api/health et gère le flux setup -> login -> CRUD', async () => {
      // 1. Health check
      const resHealth = await fetch(`${baseUrl}/api/health`);
      expect(resHealth.status).toBe(200);
      const dataHealth = await resHealth.json();
      expect(dataHealth.status).toBe('ok');
      expect(dataHealth.hasUsers).toBe(false);

      // 2. Setup premier utilisateur
      const resSetup = await fetch(`${baseUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'yann', password: 'MonMotDePasseServeur2026' })
      });
      expect(resSetup.status).toBe(201);
      const dataSetup = await resSetup.json();
      const token = dataSetup.session.token;
      expect(token).toBeDefined();

      // 3. Appel non authentifié refusé
      const resUnauthorized = await fetch(`${baseUrl}/api/accounts`);
      expect(resUnauthorized.status).toBe(401);

      // 4. Appel authentifié avec Bearer token
      const resAccounts = await fetch(`${baseUrl}/api/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      expect(resAccounts.status).toBe(200);
      const accounts = await resAccounts.json();
      expect(Array.isArray(accounts)).toBe(true);

      // 5. Création d'un compte via API
      const resCreateAcc = await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Compte Courant API',
          type: 'checking',
          initialBalance: 1234.56,
          referenceDate: '2026-10-01'
        })
      });
      expect(resCreateAcc.status).toBe(200);
      const createdAcc = await resCreateAcc.json();
      expect(createdAcc.name).toBe('Compte Courant API');
    });

    it('gère le verrouillage exclusif pendant POST /api/migration/import', async () => {
      // 1. Initialiser compte et token
      const resSetup = await fetch(`${baseUrl}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin_import', password: 'PasswordSecurise2026!' })
      });
      const dataSetup = await resSetup.json();
      const token = dataSetup.session.token;

      // 2. Préparer un payload d'import valide
      const validImportPayload = {
        appName: 'PersonalBudgetPro',
        version: '1.1',
        exportDate: new Date().toISOString(),
        tables: {
          accounts: [{ id: 'acc-imp-1', name: 'Compte Importé', type: 'checking', referenceDate: '2026-10-01', initialBalance: 1000 }],
          categories: [{ id: 'cat-imp-1', name: 'Alimentation', type: 'fixed_expense' }],
          transactions: [],
          loans: [],
          recurrenceTemplates: [],
          incomePayers: []
        },
        localStorage: { manualBalance: '1000' }
      };

      // 3. Déclencher l'import et une requête concurrente immédiatement en parallèle
      const importPromise = fetch(`${baseUrl}/api/migration/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(validImportPayload)
      });

      const concurrentPromise = fetch(`${baseUrl}/api/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const [resImport, resConcurrent] = await Promise.all([importPromise, concurrentPromise]);

      expect(resImport.status).toBe(200);
      const importData = await resImport.json();
      expect(importData.success).toBe(true);

      // La requête concurrente a reçu soit 503 (si tombée pendant l'import), soit 200 (après libération du verrou)
      expect([200, 503]).toContain(resConcurrent.status);
      if (resConcurrent.status === 503) {
        expect(resConcurrent.headers.get('retry-after')).toBe('3');
      }

      // 4. Après la fin de l'import, le verrou est bien libéré et les requêtes normales fonctionnent
      const resAfter = await fetch(`${baseUrl}/api/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      expect(resAfter.status).toBe(200);
      const accountsAfter = await resAfter.json();
      expect(accountsAfter.find((a: any) => a.id === 'acc-imp-1')).toBeDefined();

      // 5. Un import échoué libère également le verrou
      const invalidImportPayload = { appName: 'BadApp' };
      const resFail = await fetch(`${baseUrl}/api/migration/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(invalidImportPayload)
      });
      expect(resFail.status).toBe(400);

      // Vérifier que le verrou est toujours libre
      const resAfterFail = await fetch(`${baseUrl}/api/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      expect(resAfterFail.status).toBe(200);

      // 6. Si une restauration ou un import est en cours, un nouvel import simultané est refusé avec 503
      // Pour tester de façon reproductible la concurrence :
      // On envoie le corps de la première requête par morceaux avec un délai pour s'assurer
      // que le serveur a bien reçu le début de la requête et qu'une 2e requête arrive pendant ce temps
      const http = await import('node:http');
      const url = new URL(`${baseUrl}/api/migration/import`);

      const req1 = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const resPromise1 = new Promise<{ status: number; body: string }>((resolve) => {
        req1.on('response', (res) => {
          let str = '';
          res.on('data', d => { str += d; });
          res.on('end', () => resolve({ status: res.statusCode || 0, body: str }));
        });
      });

      // Écrire la moitié du payload JSON
      const jsonStr = JSON.stringify(validImportPayload);
      const half = Math.floor(jsonStr.length / 2);
      req1.write(jsonStr.slice(0, half));

      // Petite attente avant d'envoyer la seconde moitié
      let resImp2: Response | null = null;
      setTimeout(async () => {
        // Déclencher la 2e requête pendant que la 1ère est encore en train d'être traitée
        resImp2 = await fetch(`${baseUrl}/api/migration/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: jsonStr
        });
        // Finir la première requête
        req1.write(jsonStr.slice(half));
        req1.end();
      }, 50);

      const r1 = await resPromise1;
      while (!resImp2) {
        await new Promise(r => setTimeout(r, 10));
      }

      const statuses = [r1.status, (resImp2 as Response).status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(503);

      const rejected = (resImp2 as Response).status === 503 ? (resImp2 as Response) : null;
      if (rejected) {
        expect(rejected.headers.get('retry-after')).toBe('3');
        const rejectedBody = await rejected.json();
        expect(rejectedBody.error).toContain('déjà en cours');
      }
    });
  });
});
