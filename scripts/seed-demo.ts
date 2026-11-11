import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_DB_PATH = path.resolve(__dirname, '../data/budget.demo.db');

export function seedDemoDatabase(dbPath = DEMO_DB_PATH) {
  console.log(`[Seed-Demo] Initialisation de la base démo étanche : ${dbPath}`);

  // 1. Suppression préalable de la base démo si elle existe
  for (const ext of ['', '-wal', '-shm']) {
    const p = `${dbPath}${ext}`;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (err: any) {
        console.warn(`[Seed-Demo] Note suppression ${p}:`, err.message);
      }
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // 2. Création du schéma complet
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      recovery_key_hash TEXT,
      recovery_key_salt TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      subType TEXT,
      initialBalance REAL NOT NULL DEFAULT 0,
      referenceDate TEXT NOT NULL,
      interestRate REAL,
      targetAmount REAL,
      isClosed INTEGER NOT NULL DEFAULT 0,
      closedDate TEXT,
      closedBalance REAL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS income_payers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      expectedDate TEXT,
      recurrenceDay INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      accountId TEXT NOT NULL,
      destinationAccountId TEXT,
      categoryId TEXT,
      linkedId TEXT,
      label TEXT,
      notes TEXT,
      paymentMethod TEXT,
      checkNumber TEXT,
      amortizedCapital REAL,
      templateId TEXT,
      isCustomized INTEGER NOT NULL DEFAULT 0,
      isReconstituted INTEGER NOT NULL DEFAULT 0,
      payerId TEXT,
      deleted_at INTEGER DEFAULT NULL,
      FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      lender TEXT NOT NULL,
      initialAmount REAL NOT NULL,
      remainingCapital REAL NOT NULL,
      monthlyPayment REAL NOT NULL,
      interestRate REAL DEFAULT 0,
      insurancePart REAL DEFAULT 0,
      startDate TEXT NOT NULL,
      durationMonths INTEGER NOT NULL,
      endDate TEXT,
      debitDay INTEGER,
      prepaidInstallments INTEGER DEFAULT 0,
      monthsAdjustment INTEGER DEFAULT 0,
      accountId TEXT NOT NULL,
      notes TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      isPaused INTEGER NOT NULL DEFAULT 0,
      loanType TEXT DEFAULT 'consumer'
    );

    CREATE TABLE IF NOT EXISTS loan_payment_history (
      id TEXT PRIMARY KEY,
      loanId TEXT NOT NULL,
      effectiveMonth TEXT NOT NULL,
      monthlyPayment REAL NOT NULL,
      previousPayment REAL,
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (loanId) REFERENCES loans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recurrence_templates (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      recurrenceDay INTEGER NOT NULL,
      accountId TEXT NOT NULL,
      destinationAccountId TEXT,
      categoryId TEXT,
      label TEXT,
      notes TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      disabledFromMonth TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      payerId TEXT,
      commitment_end_date TEXT DEFAULT NULL,
      price_after_promo REAL DEFAULT NULL,
      notice_period_days INTEGER DEFAULT 30,
      contract_end_date TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS planned_expenses (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      estimatedAmount REAL NOT NULL,
      categoryId TEXT,
      urgency TEXT NOT NULL,
      targetDate TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_capital_history (
      month TEXT PRIMARY KEY,
      real_estate_capital REAL,
      real_estate_monthly_payment REAL,
      consumer_capital REAL,
      consumer_monthly_payment REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Utilisateur et Session persistante (Token universel pour Puppeteer)
  const userId = 'usr-demo-001';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync('demopassword123', salt, 64).toString('hex');
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, 'demo', passwordHash, salt, nowIso);

  const demoToken = 'demo-session-token-1234567890';
  db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(demoToken, userId, nowIso, '2099-12-31T23:59:59.999Z');

  // 4. Comptes bancaires (3 comptes)
  const accCourant = 'acc-courant';
  const accLivretA = 'acc-livreta';
  const accLdds = 'acc-ldds';

  db.prepare(`
    INSERT INTO accounts (id, name, type, subType, initialBalance, referenceDate, isClosed)
    VALUES 
      (?, 'Compte Courant Principal', 'checking', 'checking', 2450.00, '2026-11-01', 0),
      (?, 'Livret A (Épargne Précaution)', 'savings', 'livret_a', 12500.00, '2026-11-01', 0),
      (?, 'LDDS (Projets & Travaux)', 'savings', 'ldds', 4200.00, '2026-11-01', 0)
  `).run(accCourant, accLivretA, accLdds);

  // 5. Organismes payeurs de revenus
  db.prepare(`
    INSERT INTO income_payers (id, name, isArchived, createdAt)
    VALUES 
      ('pyr-alpha', 'Entreprise Alpha (Employeur)', 0, ?),
      ('pyr-beta', 'Cabinet Conseil Bêta', 0, ?),
      ('pyr-caf', 'Caisse d’Allocations Familiales (CAF)', 0, ?)
  `).run(nowIso, nowIso, nowIso);

  // 6. Catégories
  const categories = [
    { id: 'cat-salaire', name: 'Salaires & Primes', type: 'income', color: '#10b981' },
    { id: 'cat-caf', name: 'Prestations Sociales', type: 'income', color: '#06b6d4' },
    { id: 'cat-immo', name: 'Prêt Immobilier', type: 'loan_payment', color: '#2563eb' },
    { id: 'cat-pret-conso', name: 'Crédits Consommation', type: 'loan_payment', color: '#4f46e5' },
    { id: 'cat-energie', name: 'Électricité & Chauffage', type: 'fixed_expense', color: '#f59e0b' },
    { id: 'cat-telecom', name: 'Téléphonie & Internet', type: 'fixed_expense', color: '#3b82f6' },
    { id: 'cat-assurances', name: 'Assurances Maison & Auto', type: 'fixed_expense', color: '#6366f1' },
    { id: 'cat-copro', name: 'Charges & Syndic', type: 'fixed_expense', color: '#8b5cf6' },
    { id: 'cat-abonnements', name: 'Abonnements & Loisirs', type: 'fixed_expense', color: '#ec4899' },
    { id: 'cat-alim', name: 'Alimentation & Supermarché', type: 'variable_expense', color: '#10b981' },
    { id: 'cat-carburant', name: 'Carburant & Transport', type: 'variable_expense', color: '#ef4444' },
    { id: 'cat-resto', name: 'Restaurants & Sorties', type: 'variable_expense', color: '#f97316' },
    { id: 'cat-quotidien', name: 'Dépenses Courantes', type: 'daily', color: '#64748b' },
    { id: 'cat-sante', name: 'Santé & Soins Médicaux', type: 'health_expense', color: '#ec4899' },
    { id: 'cat-epargne', name: 'Virement Épargne', type: 'transfer', color: '#8b5cf6' }
  ];

  const catStmt = db.prepare('INSERT INTO categories (id, name, type, color, isArchived) VALUES (?, ?, ?, ?, 0)');
  for (const c of categories) {
    catStmt.run(c.id, c.name, c.type, c.color);
  }

  // 7. Prêts (1 immo + 3 consos avec jalons échelonnés)
  const loans = [
    {
      id: 'loan-immo',
      name: 'Prêt Immobilier Résidence',
      lender: 'Banque Nationale',
      loanType: 'mortgage',
      initialAmount: 220000,
      remainingCapital: 162400.00,
      monthlyPayment: 890.50,
      interestRate: 1.65,
      insurancePart: 32.00,
      startDate: '2019-09-05',
      endDate: '2044-09-05',
      durationMonths: 300,
      debitDay: 5,
      prepaidInstallments: 86
    },
    {
      id: 'loan-tech',
      name: 'Financement Informatique Pro',
      lender: 'Financière Tech',
      loanType: 'consumer',
      initialAmount: 1800,
      remainingCapital: 75.00,
      monthlyPayment: 75.00,
      interestRate: 0.00,
      insurancePart: 0.00,
      startDate: '2025-01-10',
      endDate: '2026-12-10',
      durationMonths: 24,
      debitDay: 10,
      prepaidInstallments: 23
    },
    {
      id: 'loan-auto',
      name: 'Prêt Véhicule Hybride',
      lender: 'Crédit Auto Direct',
      loanType: 'consumer',
      initialAmount: 14000,
      remainingCapital: 4200.00,
      monthlyPayment: 245.80,
      interestRate: 3.90,
      insurancePart: 0.00,
      startDate: '2023-04-10',
      endDate: '2027-04-10',
      durationMonths: 48,
      debitDay: 10,
      prepaidInstallments: 43
    },
    {
      id: 'loan-eco',
      name: 'Éco-Prêt Rénovation Énergie',
      lender: 'Banque Verte',
      loanType: 'consumer',
      initialAmount: 8000,
      remainingCapital: 5100.00,
      monthlyPayment: 135.20,
      interestRate: 2.10,
      insurancePart: 8.00,
      startDate: '2024-02-15',
      endDate: '2030-02-15',
      durationMonths: 72,
      debitDay: 15,
      prepaidInstallments: 33
    }
  ];

  const loanStmt = db.prepare(`
    INSERT INTO loans (
      id, name, lender, initialAmount, remainingCapital, monthlyPayment,
      interestRate, insurancePart, startDate, durationMonths, endDate,
      debitDay, prepaidInstallments, monthsAdjustment, accountId, isArchived, isPaused, loanType
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?)
  `);

  const loanHistStmt = db.prepare(`
    INSERT INTO loan_payment_history (id, loanId, effectiveMonth, monthlyPayment, previousPayment, notes, createdAt)
    VALUES (?, ?, ?, ?, NULL, 'Mensualité contractuelle initiale', ?)
  `);

  for (const l of loans) {
    loanStmt.run(
      l.id, l.name, l.lender, l.initialAmount, l.remainingCapital, l.monthlyPayment,
      l.interestRate, l.insurancePart, l.startDate, l.durationMonths, l.endDate,
      l.debitDay, l.prepaidInstallments, accCourant, l.loanType
    );
    loanHistStmt.run(crypto.randomUUID(), l.id, l.startDate.slice(0, 7), l.monthlyPayment, nowIso);
  }

  // 8. Transactions de Novembre 2026 (Mois courant représentatif)
  const txStmt = db.prepare(`
    INSERT INTO transactions (
      id, date, expectedDate, recurrenceDay, type, amount, status,
      accountId, destinationAccountId, categoryId, linkedId, label,
      notes, paymentMethod, checkNumber, amortizedCapital, templateId,
      isCustomized, isReconstituted, payerId, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL)
  `);

  // --- Revenus (4 645,00 €)
  txStmt.run(crypto.randomUUID(), '2026-11-01', '2026-11-01', 1, 'income', 2850.00, 'cleared', accCourant, null, 'cat-salaire', null, 'Salaire Principal (Cadre)', null, 'Virement', null, null, null, 'pyr-alpha');
  txStmt.run(crypto.randomUUID(), '2026-11-01', '2026-11-01', 1, 'income', 1650.00, 'cleared', accCourant, null, 'cat-salaire', null, 'Salaire Conjoint', null, 'Virement', null, null, null, 'pyr-beta');
  txStmt.run(crypto.randomUUID(), '2026-11-05', '2026-11-05', 5, 'income', 145.00, 'cleared', accCourant, null, 'cat-caf', null, 'Allocations Familiales (CAF)', null, 'Virement', null, null, null, 'pyr-caf');

  // --- Échéances de Prêts
  txStmt.run(crypto.randomUUID(), '2026-11-05', '2026-11-05', 5, 'loan_payment', 890.50, 'cleared', accCourant, null, 'cat-immo', 'loan-immo', 'Mensualité Prêt Immobilier', null, 'Prélèvement', null, 635.20, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-10', '2026-11-10', 10, 'loan_payment', 75.00, 'cleared', accCourant, null, 'cat-pret-conso', 'loan-tech', 'Échéance Financement Informatique', null, 'Prélèvement', null, 75.00, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-10', '2026-11-10', 10, 'loan_payment', 245.80, 'cleared', accCourant, null, 'cat-pret-conso', 'loan-auto', 'Échéance Prêt Véhicule', null, 'Prélèvement', null, 232.15, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-15', '2026-11-15', 15, 'loan_payment', 135.20, 'cleared', accCourant, null, 'cat-pret-conso', 'loan-eco', 'Échéance Éco-Prêt Énergie', null, 'Prélèvement', null, 118.28, null, null);

  // --- Pôle Santé (2 dossiers)
  // Dossier 1 : Soin dentaire (Reste à charge 50 €)
  const txDentaireId = 'tx-soin-dentaire';
  txStmt.run(txDentaireId, '2026-11-04', '2026-11-04', null, 'health_expense', 350.00, 'cleared', accCourant, null, 'cat-sante', null, 'Consultation Spécialiste Dentaire', null, 'Carte bancaire', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-12', '2026-11-12', null, 'health_reimbursement', 120.00, 'cleared', accCourant, null, 'cat-sante', txDentaireId, 'Remboursement CPAM Soins Dentaires', null, 'Virement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-20', '2026-11-20', null, 'health_reimbursement', 180.00, 'pending', accCourant, null, 'cat-sante', txDentaireId, 'Remboursement Mutuelle Santé Dentaire', null, 'Virement', null, null, null, null);

  // Dossier 2 : Pharmacie (Soldé 0 €)
  const txPharmaId = 'tx-soin-pharma';
  txStmt.run(txPharmaId, '2026-11-08', '2026-11-08', null, 'health_expense', 42.60, 'cleared', accCourant, null, 'cat-sante', null, 'Pharmacie Traitement Médical', null, 'Carte bancaire', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-14', '2026-11-14', null, 'health_reimbursement', 28.50, 'cleared', accCourant, null, 'cat-sante', txPharmaId, 'Remboursement CPAM Pharmacie', null, 'Virement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-15', '2026-11-15', null, 'health_reimbursement', 14.10, 'cleared', accCourant, null, 'cat-sante', txPharmaId, 'Remboursement Mutuelle Pharmacie', null, 'Virement', null, null, null, null);

  // --- Charges Fixes du Foyer
  txStmt.run(crypto.randomUUID(), '2026-11-05', '2026-11-05', 5, 'fixed_expense', 142.50, 'cleared', accCourant, null, 'cat-energie', null, 'Énergie & Gaz EDF', null, 'Prélèvement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-05', '2026-11-05', 5, 'fixed_expense', 79.98, 'cleared', accCourant, null, 'cat-telecom', null, 'Forfaits Mobiles & Fibre Internet', null, 'Prélèvement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-07', '2026-11-07', 7, 'fixed_expense', 34.20, 'cleared', accCourant, null, 'cat-assurances', null, 'Assurance Habitation Multirisque', null, 'Prélèvement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-07', '2026-11-07', 7, 'fixed_expense', 65.80, 'cleared', accCourant, null, 'cat-assurances', null, 'Assurance Véhicule Tous Risques', null, 'Prélèvement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-10', '2026-11-10', 10, 'fixed_expense', 120.00, 'cleared', accCourant, null, 'cat-copro', null, 'Charges de Copropriété & Syndic', null, 'Virement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-12', '2026-11-12', 12, 'fixed_expense', 29.90, 'cleared', accCourant, null, 'cat-abonnements', null, 'Abonnement Salle de Sport', null, 'Prélèvement', null, null, null, null);
  txStmt.run(crypto.randomUUID(), '2026-11-15', '2026-11-15', 15, 'fixed_expense', 13.49, 'cleared', accCourant, null, 'cat-abonnements', null, 'Streaming Vidéo HD', null, 'Carte bancaire', null, null, null, null);

  // --- Charges Variables & Dépenses du Quotidien (environ 25 opérations bien réparties)
  const dailyOps = [
    { d: '2026-11-02', a: 86.40, c: 'cat-alim', l: 'Supermarché Bio', m: 'Carte bancaire' },
    { d: '2026-11-03', a: 14.50, c: 'cat-quotidien', l: 'Boulangerie & Pâtisserie', m: 'Carte bancaire' },
    { d: '2026-11-04', a: 72.00, c: 'cat-carburant', l: 'Carburant Station Total', m: 'Carte bancaire' },
    { d: '2026-11-06', a: 124.80, c: 'cat-alim', l: 'Grandes Courses Hypermarché', m: 'Carte bancaire' },
    { d: '2026-11-07', a: 48.00, c: 'cat-resto', l: 'Restaurant Italien', m: 'Carte bancaire' },
    { d: '2026-11-09', a: 32.50, c: 'cat-quotidien', l: 'Librairie & Fournitures', m: 'Carte bancaire' },
    { d: '2026-11-10', a: 84.00, c: 'cat-quotidien', l: 'Règlement Cantine Scolaire', m: 'Chèque', chk: '001482' },
    { d: '2026-11-11', a: 65.20, c: 'cat-carburant', l: 'Carburant Autoroute', m: 'Carte bancaire' },
    { d: '2026-11-12', a: 98.30, c: 'cat-alim', l: 'Supermarché Drive', m: 'Carte bancaire' },
    { d: '2026-11-13', a: 18.00, c: 'cat-quotidien', l: 'Boulangerie & Sandwichs', m: 'Carte bancaire' },
    { d: '2026-11-14', a: 55.00, c: 'cat-resto', l: 'Dîner Brasserie', m: 'Carte bancaire' },
    { d: '2026-11-16', a: 110.20, c: 'cat-alim', l: 'Marché Frais & Primeur', m: 'Carte bancaire' },
    { d: '2026-11-18', a: 22.40, c: 'cat-quotidien', l: 'Presse & Tabac', m: 'Carte bancaire' },
    { d: '2026-11-19', a: 42.00, c: 'cat-alim', l: 'Boucherie Artisanale', m: 'Carte bancaire' },
    { d: '2026-11-20', a: 68.50, c: 'cat-carburant', l: 'Plein Carburant Hypermarché', m: 'Carte bancaire' },
    { d: '2026-11-21', a: 135.60, c: 'cat-alim', l: 'Supermarché Produits Frais', m: 'Carte bancaire' },
    { d: '2026-11-22', a: 38.00, c: 'cat-resto', l: 'Pizzeria Familiale', m: 'Carte bancaire' },
    { d: '2026-11-24', a: 15.80, c: 'cat-quotidien', l: 'Pharmacie Compléments', m: 'Carte bancaire' },
    { d: '2026-11-25', a: 92.40, c: 'cat-alim', l: 'Supermarché Hebdomadaire', m: 'Carte bancaire' },
    { d: '2026-11-27', a: 78.00, c: 'cat-quotidien', l: 'Bricolage & Jardinage', m: 'Carte bancaire' },
    { d: '2026-11-28', a: 104.50, c: 'cat-alim', l: 'Supermarché Alimentation', m: 'Carte bancaire' }
  ];

  for (const op of dailyOps) {
    txStmt.run(
      crypto.randomUUID(), op.d, op.d, null, 'daily', op.a, 'cleared',
      accCourant, null, op.c, null, op.l, null, op.m, (op as any).chk || null,
      null, null, null
    );
  }

  // --- Virement d'épargne (transfert)
  txStmt.run(
    crypto.randomUUID(), '2026-11-05', '2026-11-05', 5, 'transfer', 250.00, 'cleared',
    accCourant, accLivretA, 'cat-epargne', null, 'Virement Mensuel Livret A', null, 'Virement', null, null, null, null
  );

  // 9. Dépenses prévisionnelles (Wishlist / Projets)
  const projStmt = db.prepare(`
    INSERT INTO planned_expenses (id, label, estimatedAmount, categoryId, urgency, targetDate, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  projStmt.run(crypto.randomUUID(), 'Remplacement Lave-linge Silencieux A+++', 550.00, 'cat-quotidien', 'urgent', '2026-12', 'Appareil actuel en fin de vie, profiter des offres fin d’année', nowIso);
  projStmt.run(crypto.randomUUID(), 'Séjour Familial Vacances Hiver', 1800.00, 'cat-abonnements', 'medium', '2027-02', 'Réservation chalet et forfaits de ski', nowIso);
  projStmt.run(crypto.randomUUID(), 'Aménagement Terrasse & Mobilier Jardin', 750.00, 'cat-quotidien', 'low', '2027-05', 'Pose de caillebotis bois et pergola', nowIso);

  // 10. Historique des capitaux de prêt (pour graphiques d'évolution pluriannuelle)
  const capHistStmt = db.prepare(`
    INSERT INTO loan_capital_history (month, real_estate_capital, real_estate_monthly_payment, consumer_capital, consumer_monthly_payment, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  capHistStmt.run('2026-06', 165800.00, 890.50, 11400.00, 456.00, 'Relevé semestriel');
  capHistStmt.run('2026-07', 165150.00, 890.50, 10980.00, 456.00, null);
  capHistStmt.run('2026-08', 164480.00, 890.50, 10550.00, 456.00, null);
  capHistStmt.run('2026-09', 163800.00, 890.50, 10110.00, 456.00, null);
  capHistStmt.run('2026-10', 163100.00, 890.50, 9660.00, 456.00, null);

  // 11. Configuration et Clés d'état du Dashboard
  const settingsStmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  settingsStmt.run('manualBalance', '2450.00');
  settingsStmt.run('card1', '450.00');
  settingsStmt.run('card2', '0.00');
  settingsStmt.run('theme', 'light');

  db.close();
  console.log('[Seed-Demo] ✅ Base démo étanche générée avec succès (100% anonymisée et peuplée).');
}

// Exécution directe si appelé depuis la ligne de commande
if (process.argv[1] && process.argv[1].endsWith('seed-demo.ts')) {
  seedDemoDatabase();
}
