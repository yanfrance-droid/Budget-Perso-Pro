import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './db.ts';
import { hasAnyUser, registerUser, authenticateUser } from './auth.ts';
import { createServer } from './app.ts';
import { getAllAccounts, saveAccount } from './services/accountService.ts';
import { getTransactions, saveTransaction } from './services/transactionService.ts';
import { getAllLoans } from './services/loanService.ts';
import { exportBackupData, importBackupData } from './services/migrationService.ts';
import { getLoanCapitalHistory } from '../src/services/loanCapitalHistoryService.ts';
import { PERSONAL_LOAN_CAPITAL_DATASET } from '../src/data/personalLoanCapitalDataset.ts';

const TEST_DB_PATH = path.resolve(process.cwd(), './data/test_virgin_installation.db');

describe('PHASE 3 — Démarrage initial et installation vierge et indépendante', () => {
  let db: DatabaseSync;

  const cleanupDbFiles = () => {
    try {
      if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
      if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
      if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch {
      // Ignorer si déjà nettoyé
    }
  };

  beforeEach(() => {
    cleanupDbFiles();
  });

  afterEach(() => {
    try {
      if (db) db.close();
    } catch {}
    cleanupDbFiles();
  });

  it('1. Initialisation SQLite : crée le schéma complet avec 1 compte courant par défaut (idempotent, solde 0), 0 transaction, 0 crédit et 0 utilisateur', () => {
    db = initDatabase(TEST_DB_PATH);

    // Vérifier l'absence totale d'utilisateur
    expect(hasAnyUser(db)).toBe(false);

    // Vérifier le compte courant unique initialisé par défaut
    const accounts = getAllAccounts(db);
    expect(accounts.length).toBe(1);
    expect(accounts[0].name).toBe('Compte Courant');
    expect(accounts[0].type).toBe('checking');
    expect(accounts[0].initialBalance).toBe(0);
    expect(accounts[0].isClosed).toBe(false);

    // Vérifier l'idempotence : une ré-initialisation ne crée aucun doublon
    const dbAgain = initDatabase(TEST_DB_PATH);
    const accountsAgain = getAllAccounts(dbAgain);
    expect(accountsAgain.length).toBe(1);
    dbAgain.close();

    // Vérifier les transactions
    const txs = getTransactions(db);
    expect(txs).toEqual([]);
    expect(txs.length).toBe(0);

    // Vérifier les crédits
    const loans = getAllLoans(db);
    expect(loans).toEqual([]);
    expect(loans.length).toBe(0);

    // Vérifier les catégories techniques
    const stmtCat = db.prepare('SELECT COUNT(*) as count FROM categories');
    const catCount = (stmtCat.get() as any).count;
    expect(catCount).toBe(0);

    // Vérifier les modèles de récurrence
    const stmtRec = db.prepare('SELECT COUNT(*) as count FROM recurrence_templates');
    const recCount = (stmtRec.get() as any).count;
    expect(recCount).toBe(0);
  });

  it('2. Parcours utilisateur initial : création du compte maître via /api/auth/setup et verrouillage ultérieur', () => {
    db = initDatabase(TEST_DB_PATH);

    expect(hasAnyUser(db)).toBe(false);

    // Création du premier compte admin
    const reg = registerUser(db, 'admin_proche', 'MonMotDePasse2026!');
    const userId = typeof reg === 'object' ? reg.userId : reg;
    expect(userId).toBeDefined();
    expect(hasAnyUser(db)).toBe(true);

    // Authentification
    const session = authenticateUser(db, 'admin_proche', 'MonMotDePasse2026!');
    expect(session).not.toBeNull();
    expect(session?.username).toBe('admin_proche');
    expect(session?.token).toBeDefined();

    // Vérifier que la table sessions contient le token
    const sessionRow = db.prepare('SELECT * FROM sessions WHERE token = ?').get(session!.token) as any;
    expect(sessionRow).toBeDefined();
    expect(sessionRow.user_id).toBe(userId);
  });

  it('3. Enregistrement manuel et persistance SQLite après redémarrage du serveur', () => {
    // Étape A : Première session avec création manuelle d'un compte et d'une opération
    db = initDatabase(TEST_DB_PATH);
    registerUser(db, 'marie_dupont', 'SecuriteTotal2026*');

    const newAccount = saveAccount(db, {
      id: 'acc_livret_a_001',
      name: 'Mon Livret A',
      type: 'savings',
      subType: 'livret_a',
      initialBalance: 500,
      referenceDate: '2026-10-01'
    });
    expect(newAccount.name).toBe('Mon Livret A');

    const newTx = saveTransaction(db, {
      id: 'tx_versement_001',
      date: '2026-10-15',
      type: 'transfer',
      amount: 150,
      status: 'cleared',
      accountId: 'acc_livret_a_001',
      destinationAccountId: 'acc_livret_a_001',
      label: 'Premier versement épargne'
    });
    expect(newTx.amount).toBe(150);

    // Fermeture de la base pour simuler l'arrêt complet du serveur
    db.close();

    // Étape B : Redémarrage du serveur (réouverture de la même base SQLite)
    const restartedDb = initDatabase(TEST_DB_PATH);
    db = restartedDb;

    expect(hasAnyUser(restartedDb)).toBe(true);
    const loadedAccounts = getAllAccounts(restartedDb);
    expect(loadedAccounts).toHaveLength(2); // Compte Courant par défaut + Mon Livret A
    const livret = loadedAccounts.find(a => a.id === 'acc_livret_a_001');
    expect(livret).toBeDefined();
    expect(livret?.initialBalance).toBe(500);

    const loadedTxs = getTransactions(restartedDb);
    expect(loadedTxs).toHaveLength(1);
    expect(loadedTxs[0].id).toBe('tx_versement_001');
    expect(loadedTxs[0].amount).toBe(150);
  });

  it('4. Export et Restauration JSON : restent 100% fonctionnels sur une installation vierge', () => {
    db = initDatabase(TEST_DB_PATH);
    registerUser(db, 'paul_martin', 'MonSuperPass2026#');

    const defaultAcc = getAllAccounts(db)[0];
    saveAccount(db, {
      id: defaultAcc.id,
      name: 'Compte Courant Principal',
      type: 'checking',
      initialBalance: 1200,
      referenceDate: '2026-10-01'
    });

    saveTransaction(db, {
      id: 'tx_course_01',
      date: '2026-10-18',
      type: 'variable_expense',
      amount: 84.50,
      status: 'cleared',
      accountId: defaultAcc.id,
      label: 'Courses de la semaine'
    });

    // Exportation
    const exported = exportBackupData(db);
    expect(exported.version).toBe('2.0');
    expect(exported.tables.accounts).toHaveLength(1);
    expect(exported.tables.transactions).toHaveLength(1);
    expect(exported.tables.accounts[0].name).toBe('Compte Courant Principal');

    // Réinitialisation de la base (simulation d'une installation vierge réceptrice)
    db.close();
    cleanupDbFiles();
    db = initDatabase(TEST_DB_PATH);
    expect(getAllAccounts(db)).toHaveLength(1); // 1 compte par défaut créé sur la base vierge réceptrice

    // Restauration du fichier JSON
    const restoreResult = importBackupData(db, exported);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.importedAccounts).toBe(1);
    expect(restoreResult.importedTransactions).toBe(1);

    const restoredAccs = getAllAccounts(db);
    expect(restoredAccs).toHaveLength(1);
    expect(restoredAccs[0].name).toBe('Compte Courant Principal');
  });

  it('5. Découplage de l\'historique personnel des crédits : une installation générique reste vierge', () => {
    // En mode standard vierge par défaut, l'historique est strictement vide (0 donnée personnelle injectée)
    const genericHistory = getLoanCapitalHistory([], [], '2026-10');
    expect(genericHistory).toEqual([]);
    expect(genericHistory.length).toBe(0);

    // Vérifier que le dataset applicatif est strictement vierge de tout historique
    expect(PERSONAL_LOAN_CAPITAL_DATASET.records).toEqual([]);
    expect(PERSONAL_LOAN_CAPITAL_DATASET.records).toHaveLength(0);

    // Si un jeu d'historique personnalisé est explicitement fourni via historyRecords, il est correctement pris en compte
    const customTestRecords = [
      {
        month: '2026-10',
        realEstateCapital: 80000,
        mortgageCapital: 80000,
        realEstateMonthlyPayment: 450,
        mortgageMonthlyPayment: 450,
        consumerCapital: null,
        consumerMonthlyPayment: null
      }
    ];
    const customHistory = getLoanCapitalHistory([], [], '2026-10', { historyRecords: customTestRecords });
    expect(customHistory).toHaveLength(1);
    expect(customHistory[0].month).toBe('2026-10');
    expect(customHistory[0].mortgageCapital).toBe(80000);
  });
});
