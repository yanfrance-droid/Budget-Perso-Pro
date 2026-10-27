import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { initDatabase } from '../db.ts';
import { generateFullExportExcelWorkbook, getTransactionStatusLabel } from './excelExportService.ts';
import { saveAccount } from './accountService.ts';
import { saveCategory } from './categoryService.ts';
import { saveIncomePayer } from './incomePayerService.ts';
import { saveTransaction } from './transactionService.ts';
import { saveLoan } from './loanService.ts';
import { savePlannedExpense } from './plannedExpenseService.ts';

describe('excelExportService - Structure alignée sur la navigation (10 onglets avec Donut au Tableau de bord)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    // Base SQLite isolée en mémoire
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it('génère exactement les 10 onglets sans l\'onglet Dépenses prévisionnelles ni l\'onglet Graphiques', async () => {
    const buffer = await generateFullExportExcelWorkbook(db);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    expect(sheetNames).toEqual([
      'Tableau de bord',
      'Revenus',
      'Charges fixes',
      'Charges variables',
      'Dépenses',
      'Analyse des dépenses',
      'Santé',
      'Crédits',
      'Épargne',
      'Analyses croisées'
    ]);
    expect(sheetNames).not.toContain('Dépenses prévisionnelles');
    expect(sheetNames).not.toContain('Graphiques');

    // Vérifier la présence du graphique dans le Tableau de bord
    const wsDash = workbook.getWorksheet('Tableau de bord');
    expect(wsDash).toBeDefined();
    expect(wsDash!.getImages().length).toBe(1);

    // Vérifier la présence de la ligne Taux d'endettement immédiatement sous Engagements mensuels de prêt
    let foundEngagementsRow = -1;
    let foundDebtRatioRow = -1;
    let debtRatioVal: any = null;

    wsDash!.eachRow((row, rowNumber) => {
      const col1 = String(row.getCell(1).value || '');
      if (col1.includes('Engagements mensuels de prêt')) {
        foundEngagementsRow = rowNumber;
      } else if (col1.includes('Taux d’endettement')) {
        foundDebtRatioRow = rowNumber;
        debtRatioVal = row.getCell(2).value;
      }
    });

    expect(foundEngagementsRow).toBeGreaterThan(0);
    expect(foundDebtRatioRow).toBe(foundEngagementsRow + 1);
    // Dans le test initial sans revenus, le taux vaut 'N/A'
    expect(debtRatioVal).toBe('N/A');
  });

  it('supprime les identifiants techniques et codes internes des colonnes visibles de tous les onglets', async () => {
    const acc = saveAccount(db, { id: 'uuid-acc-test', name: 'Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });
    const cat = saveCategory(db, { id: 'uuid-cat-test', name: 'Alimentation', type: 'daily' });
    saveTransaction(db, {
      id: 'uuid-tx-test',
      date: '2026-03-01',
      type: 'daily',
      amount: 45,
      status: 'cleared',
      accountId: acc.id!,
      categoryId: cat.id,
      label: 'Courses Hebdo'
    });
    savePlannedExpense(db, { id: 'uuid-plan-test', label: 'Projet Test', estimatedAmount: 200, urgency: 'urgent' });
    saveLoan(db, {
      id: 'uuid-loan-test',
      name: 'Prêt Test',
      lender: 'Banque',
      initialAmount: 5000,
      remainingCapital: 4000,
      monthlyPayment: 150,
      startDate: '2025-01',
      durationMonths: 48,
      accountId: acc.id!
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const checkNoTechnicalHeaders = (sheetName: string, forbiddenHeaders: string[]) => {
      const ws = workbook.getWorksheet(sheetName);
      expect(ws).toBeDefined();
      const headerRow = ws!.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell(c => {
        if (c.value) headers.push(String(c.value));
      });
      for (const forbidden of forbiddenHeaders) {
        expect(headers).not.toContain(forbidden);
      }
    };

    // Vérification sur les onglets clés
    checkNoTechnicalHeaders('Revenus', ['ID Transaction', 'Statut (Code)', 'id', 'status']);
    checkNoTechnicalHeaders('Charges fixes', ['ID Transaction', 'Statut (Code)', 'id', 'status']);
    checkNoTechnicalHeaders('Charges variables', ['ID Transaction', 'Statut (Code)', 'id', 'status']);
    checkNoTechnicalHeaders('Dépenses', ['ID Transaction', 'Statut (Code)', 'id', 'status']);
    checkNoTechnicalHeaders('Santé', ['ID Transaction', 'ID Liaison santé', 'id', 'linkedId']);
    checkNoTechnicalHeaders('Crédits', ['ID Prêt', 'id']);

    // Épargne (en-tête ligne 4 pour la table des comptes)
    const wsSav = workbook.getWorksheet('Épargne');
    const savHeaders: string[] = [];
    wsSav!.getRow(4).eachCell(c => { if (c.value) savHeaders.push(String(c.value)); });
    expect(savHeaders).not.toContain('ID Compte');
  });

  it('traduit les statuts en français clair selon le type de transaction', () => {
    // Revenu
    expect(getTransactionStatusLabel('income', 'cleared')).toBe('Encaissé');
    expect(getTransactionStatusLabel('income', 'pending')).toBe('En attente');
    expect(getTransactionStatusLabel('income', 'planned')).toBe('Prévu');
    expect(getTransactionStatusLabel('income', 'disabled')).toBe('Désactivé');

    // Dépenses
    expect(getTransactionStatusLabel('daily', 'cleared')).toBe('Débité');
    expect(getTransactionStatusLabel('fixed_expense', 'cleared')).toBe('Débité');
    expect(getTransactionStatusLabel('variable_expense', 'cleared')).toBe('Débité');
    expect(getTransactionStatusLabel('health_expense', 'cleared')).toBe('Débité');

    // Remboursement santé
    expect(getTransactionStatusLabel('health_reimbursement', 'cleared')).toBe('Reçu');

    // Virement épargne
    expect(getTransactionStatusLabel('transfer', 'cleared')).toBe('Effectué');
    expect(getTransactionStatusLabel('transfer', 'disabled')).toBe('Annulé');

    // Valeur inconnue
    expect(getTransactionStatusLabel('unknown', 'custom_status')).toBe('custom_status');
  });

  it('regroupe les analyses croisées de manière empilée verticalement dans "Analyses croisées"', async () => {
    const acc = saveAccount(db, { id: 'acc-cross', name: 'Courant', type: 'checking', initialBalance: 500, referenceDate: '2026-01-01' });
    const cat = saveCategory(db, { id: 'c-1', name: 'Alimentation', type: 'daily' });

    saveTransaction(db, { id: 't-1', date: '2026-03-01', type: 'daily', amount: 50, status: 'cleared', accountId: acc.id!, categoryId: cat.id, label: 'Biocoop' });
    saveTransaction(db, { id: 't-2', date: '2026-03-02', type: 'daily', amount: 30, status: 'pending', accountId: acc.id!, categoryId: cat.id, label: 'Boulangerie' });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // 1. Les onglets d'opérations n'ont plus de tableau croisé sur le côté
    const wsDay = workbook.getWorksheet('Dépenses');
    expect(wsDay!.getCell('O1').value).toBeNull();

    // 2. L'onglet 'Analyses croisées' contient les synthèses empilées
    const wsCross = workbook.getWorksheet('Analyses croisées');
    expect(wsCross).toBeDefined();

    const titlesFound: string[] = [];
    wsCross!.eachRow(r => {
      const val = String(r.getCell(1).value || '');
      if (val.includes('RÉPARTITION') || val.includes('SYNTHÈSE') || val.includes('PROJETS') || val.includes('DÉTAIL') || val.includes('VENTILATION')) {
        titlesFound.push(val);
      }
    });

    expect(titlesFound.some(t => t.includes('RENTRÉES D\'ARGENT'))).toBe(true);
    expect(titlesFound.some(t => t.includes('REVENUS'))).toBe(true);
    expect(titlesFound.some(t => t.includes('SORTIES DE TRÉSORERIE'))).toBe(true);
    expect(titlesFound.some(t => t.includes('CHARGES FIXES'))).toBe(true);
    expect(titlesFound.some(t => t.includes('CHARGES VARIABLES'))).toBe(true);
    expect(titlesFound.some(t => t.includes('DÉPENSES COURANTES'))).toBe(true);
    expect(titlesFound.some(t => t.includes('PROJETS D\'ACHATS'))).toBe(false);
  });

  it('intègre les totaux consolidés d\'épargne (soldes actuels, objectifs, écart et flux nets)', async () => {
    const accChecking = saveAccount(db, { id: 'acc-chk', name: 'Courant', type: 'checking', initialBalance: 2000, referenceDate: '2026-01-01' });
    const accLivret = saveAccount(db, {
      id: 'acc-liv',
      name: 'Livret A',
      type: 'savings',
      subType: 'livret_a',
      initialBalance: 5000,
      targetAmount: 10000,
      referenceDate: '2026-01-01'
    });

    // Virement du courant vers le livret (+500 €)
    saveTransaction(db, {
      id: 't-dep',
      date: '2026-03-05',
      type: 'transfer',
      amount: 500,
      status: 'cleared',
      accountId: accChecking.id!,
      destinationAccountId: accLivret.id!,
      label: 'Alimentation Livret'
    });

    // Retrait du livret vers le courant (-200 €)
    saveTransaction(db, {
      id: 't-ret',
      date: '2026-03-20',
      type: 'transfer',
      amount: 200,
      status: 'cleared',
      accountId: accLivret.id!,
      destinationAccountId: accChecking.id!,
      label: 'Retrait imprévu'
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsSav = workbook.getWorksheet('Épargne');
    expect(wsSav).toBeDefined();

    // Table 1 : solde actuel = 5000 + 500 - 200 = 5300 €
    const rowLivret = wsSav!.getRow(5);
    expect(rowLivret.getCell(1).value).toBe('Livret A');
    expect(rowLivret.getCell(4).value).toBe(5000); // Solde initial
    expect(rowLivret.getCell(5).value).toBe(5300); // Solde actuel
    expect(rowLivret.getCell(7).value).toBe(10000); // Objectif cible
    expect(rowLivret.getCell(8).value).toBe(-4700); // Écart (5300 - 10000)

    // Zone de synthèse des flux :
    let foundCurrent = false;
    let foundTargets = false;
    let foundDeposits = false;
    let foundWithdrawals = false;
    let foundNet = false;

    wsSav!.eachRow(r => {
      const lbl = String(r.getCell(1).value || '');
      // On ignore la table des comptes d'épargne (lignes 1 à 8)
      if (lbl.includes('TOTAL DE L\'ÉPARGNE PLACÉE') || lbl.includes('Livret A') || lbl.includes('Nom du livret')) return;

      const val = Number(r.getCell(2).value);
      if (lbl.includes('Total des soldes actuels des comptes d\'épargne')) {
        foundCurrent = true;
        expect(val).toBe(5300);
      }
      if (lbl.includes('Total des objectifs d\'épargne renseignés')) {
        foundTargets = true;
        expect(val).toBe(10000);
      }
      if (lbl.includes('Total des versements / alimentations d\'épargne')) {
        foundDeposits = true;
        expect(val).toBe(500);
      }
      if (lbl.includes('Total des retraits d\'épargne')) {
        foundWithdrawals = true;
        expect(val).toBe(200);
      }
      if (lbl.includes('Solde net des flux d\'épargne sur la période')) {
        foundNet = true;
        expect(val).toBe(300); // 500 - 200
      }
    });

    expect(foundCurrent).toBe(true);
    expect(foundTargets).toBe(true);
    expect(foundDeposits).toBe(true);
    expect(foundWithdrawals).toBe(true);
    expect(foundNet).toBe(true);
  });

  it('isole strictement chaque type d\'opération dans son onglet dédié sans mélange ni duplication', async () => {
    const acc = saveAccount(db, {
      id: 'acc-main',
      name: 'Compte Courant',
      type: 'checking',
      initialBalance: 1000,
      referenceDate: '2026-01-01'
    });

    const catRev = saveCategory(db, { id: 'c-rev', name: 'Salaire', type: 'income' });
    const catFixe = saveCategory(db, { id: 'c-fix', name: 'Loyer', type: 'fixed_expense' });
    const catVar = saveCategory(db, { id: 'c-var', name: 'Électricité', type: 'variable_expense' });
    const catDay = saveCategory(db, { id: 'c-day', name: 'Supermarché', type: 'daily' });
    const catHealth = saveCategory(db, { id: 'c-hea', name: 'Pharmacie', type: 'health_expense' });

    saveTransaction(db, { id: 't-rev', date: '2026-03-01', type: 'income', amount: 2500, status: 'cleared', accountId: acc.id!, categoryId: catRev.id, label: 'Salaire Mars' });
    saveTransaction(db, { id: 't-fix', date: '2026-03-05', type: 'fixed_expense', amount: 800, status: 'cleared', accountId: acc.id!, categoryId: catFixe.id, label: 'Loyer Mars' });
    saveTransaction(db, { id: 't-var', date: '2026-03-10', type: 'variable_expense', amount: 120, status: 'pending', accountId: acc.id!, categoryId: catVar.id, label: 'EDF' });
    saveTransaction(db, { id: 't-day', date: '2026-03-12', type: 'daily', amount: 65, status: 'cleared', accountId: acc.id!, categoryId: catDay.id, label: 'Courses' });
    saveTransaction(db, { id: 't-hea', date: '2026-03-15', type: 'health_expense', amount: 30, status: 'cleared', accountId: acc.id!, categoryId: catHealth.id, label: 'Médecin' });
    saveTransaction(db, { id: 't-vir', date: '2026-03-02', type: 'transfer', amount: 200, status: 'cleared', accountId: acc.id!, destinationAccountId: acc.id!, label: 'Virement interne' });

    savePlannedExpense(db, { id: 'p-1', label: 'Achat Meuble', estimatedAmount: 350, urgency: 'medium' });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // Vérifier l'onglet Revenus
    const wsRev = workbook.getWorksheet('Revenus');
    const revLabels: string[] = [];
    wsRev!.eachRow((r, idx) => { if (idx > 1) revLabels.push(String(r.getCell(4).value)); });
    expect(revLabels).toContain('Salaire Mars');
    expect(revLabels).not.toContain('Loyer Mars');
    expect(revLabels).not.toContain('EDF');
    expect(revLabels).not.toContain('Courses');
    expect(revLabels).not.toContain('Achat Meuble');

    // Vérifier l'onglet Charges fixes
    const wsFix = workbook.getWorksheet('Charges fixes');
    const fixLabels: string[] = [];
    wsFix!.eachRow((r, idx) => { if (idx > 1) fixLabels.push(String(r.getCell(4).value)); });
    expect(fixLabels).toContain('Loyer Mars');
    expect(fixLabels).not.toContain('Salaire Mars');

    // Vérifier l'onglet Charges variables
    const wsVar = workbook.getWorksheet('Charges variables');
    const varLabels: string[] = [];
    wsVar!.eachRow((r, idx) => { if (idx > 1) varLabels.push(String(r.getCell(4).value)); });
    expect(varLabels).toContain('EDF');
    expect(varLabels).not.toContain('Loyer Mars');

    // Vérifier l'onglet Dépenses
    const wsDay = workbook.getWorksheet('Dépenses');
    const dayLabels: string[] = [];
    wsDay!.eachRow((r, idx) => { if (idx > 1) dayLabels.push(String(r.getCell(4).value)); });
    expect(dayLabels).toContain('Courses');
    expect(dayLabels).not.toContain('EDF');

    // Vérifier l'absence totale de l'onglet Dépenses prévisionnelles
    expect(workbook.getWorksheet('Dépenses prévisionnelles')).toBeUndefined();
  });

  it('filtre rigoureusement les opérations selon la période choisie (avant, dans, après)', async () => {
    const acc = saveAccount(db, { id: 'acc-period', name: 'Courant Période', type: 'checking', initialBalance: 100, referenceDate: '2026-01-01' });

    saveTransaction(db, { id: 'tx-before', date: '2026-01-15', type: 'daily', amount: 20, status: 'cleared', accountId: acc.id!, label: 'Avant Période' });
    saveTransaction(db, { id: 'tx-in-start', date: '2026-02-01', type: 'daily', amount: 50, status: 'cleared', accountId: acc.id!, label: 'Limite Début' });
    saveTransaction(db, { id: 'tx-in-mid', date: '2026-02-15', type: 'daily', amount: 75, status: 'cleared', accountId: acc.id!, label: 'Plein Milieu' });
    saveTransaction(db, { id: 'tx-in-end', date: '2026-02-28', type: 'daily', amount: 90, status: 'cleared', accountId: acc.id!, label: 'Limite Fin' });
    saveTransaction(db, { id: 'tx-after', date: '2026-03-01', type: 'daily', amount: 110, status: 'cleared', accountId: acc.id!, label: 'Après Période' });

    const buffer = await generateFullExportExcelWorkbook(db, { startDate: '2026-02-01', endDate: '2026-02-28' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsDash = workbook.getWorksheet('Tableau de bord');
    expect(String(wsDash!.getCell('A2').value)).toContain('du 2026-02-01 au 2026-02-28');

    const wsDay = workbook.getWorksheet('Dépenses');
    const dayLabels: string[] = [];
    wsDay!.eachRow((r, idx) => {
      if (idx > 1) {
        const val = r.getCell(4).value;
        if (val) dayLabels.push(String(val));
      }
    });

    expect(dayLabels).toContain('Limite Début');
    expect(dayLabels).toContain('Plein Milieu');
    expect(dayLabels).toContain('Limite Fin');
    expect(dayLabels).not.toContain('Avant Période');
    expect(dayLabels).not.toContain('Après Période');
  });

  it('active les filtres automatiques sur les plages de données et centre toutes les cellules', async () => {
    const acc = saveAccount(db, { id: 'acc-af', name: 'Courant AF', type: 'checking', initialBalance: 200, referenceDate: '2026-01-01' });
    saveTransaction(db, { id: 'tx-af-1', date: '2026-04-01', type: 'income', amount: 2000, status: 'cleared', accountId: acc.id!, label: 'Salaire AF' });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsRev = workbook.getWorksheet('Revenus');
    expect(wsRev!.autoFilter).toBeDefined();
    expect(wsRev!.autoFilter).toContain('A1:');

    workbook.worksheets.forEach(ws => {
      ws.eachRow({ includeEmpty: false }, row => {
        row.eachCell({ includeEmpty: false }, cell => {
          expect(cell.alignment?.horizontal).toBe('center');
          expect(cell.alignment?.vertical).toBe('middle');
        });
      });
    });
  });

  it('affiche des statuts de crédit explicites (En cours, Suspendu, Soldé, Archivé)', async () => {
    const acc = saveAccount(db, { id: 'acc-loan-st', name: 'Courant Prêt', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });

    saveLoan(db, {
      id: 'loan-active',
      name: 'Prêt Conso Actif',
      lender: 'Banque A',
      initialAmount: 10000,
      remainingCapital: 8000,
      monthlyPayment: 250,
      startDate: '2025-01',
      durationMonths: 48,
      accountId: acc.id!,
      isArchived: false,
      isPaused: false
    });

    saveLoan(db, {
      id: 'loan-paused',
      name: 'Prêt Travaux Pause',
      lender: 'Banque B',
      initialAmount: 15000,
      remainingCapital: 12000,
      monthlyPayment: 300,
      startDate: '2025-02',
      durationMonths: 60,
      accountId: acc.id!,
      isArchived: false,
      isPaused: true
    });

    saveLoan(db, {
      id: 'loan-solde',
      name: 'Prêt Auto Soldé',
      lender: 'Banque C',
      initialAmount: 5000,
      remainingCapital: 0,
      monthlyPayment: 200,
      startDate: '2024-01',
      durationMonths: 24,
      accountId: acc.id!,
      isArchived: false,
      isPaused: false
    });

    saveLoan(db, {
      id: 'loan-archived',
      name: 'Ancien Prêt Archivé',
      lender: 'Banque D',
      initialAmount: 8000,
      remainingCapital: 2000,
      monthlyPayment: 180,
      startDate: '2023-01',
      durationMonths: 48,
      accountId: acc.id!,
      isArchived: true,
      isPaused: false
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsLoans = workbook.getWorksheet('Crédits');
    expect(wsLoans).toBeDefined();

    const loanStatuses: Record<string, string> = {};
    wsLoans!.eachRow((r, idx) => {
      if (idx > 1) {
        const name = String(r.getCell(1).value);
        const status = String(r.getCell(4).value);
        loanStatuses[name] = status;
      }
    });

    expect(loanStatuses['Prêt Conso Actif']).toBe('En cours');
    expect(loanStatuses['Prêt Travaux Pause']).toBe('Suspendu');
    expect(loanStatuses['Prêt Auto Soldé']).toBe('Soldé');
    expect(loanStatuses['Ancien Prêt Archivé']).toBe('Archivé');
  });

  it('ne modifie en aucun cas les données de la base SQLite', async () => {
    saveAccount(db, { id: 'acc-immut', name: 'Compte', type: 'checking', initialBalance: 50, referenceDate: '2026-01-01' });
    const countBefore = (db.prepare('SELECT count(*) as c FROM accounts').get() as any).c;

    await generateFullExportExcelWorkbook(db);

    const countAfter = (db.prepare('SELECT count(*) as c FROM accounts').get() as any).c;
    expect(countAfter).toBe(countBefore);
  });

  it('exclut rigoureusement les charges désactivées des calculs et formules de totaux', async () => {
    const acc = saveAccount(db, { id: 'acc-dis', name: 'Compte Test', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });
    const cat = saveCategory(db, { id: 'cat-dis', name: 'Abonnements', type: 'fixed_expense' });

    // Charge fixe active (100 €)
    saveTransaction(db, {
      id: 'tx-act-1',
      date: '2026-03-01',
      type: 'fixed_expense',
      amount: 100,
      status: 'cleared',
      accountId: acc.id!,
      categoryId: cat.id,
      label: 'Box Internet'
    });

    // Charge fixe désactivée (50 €)
    saveTransaction(db, {
      id: 'tx-dis-1',
      date: '2026-03-01',
      type: 'fixed_expense',
      amount: 50,
      status: 'disabled',
      accountId: acc.id!,
      categoryId: cat.id,
      label: 'Ancien streaming désactivé'
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // Vérifier sur Charges fixes
    const wsFix = workbook.getWorksheet('Charges fixes');
    expect(wsFix).toBeDefined();

    // La formule du total doit utiliser SUMIF pour exclure "Désactivé"
    const totRow = wsFix!.getRow(4); // row 1 header, row 2 active, row 3 disabled, row 4 total
    expect(String(totRow.getCell(4).value)).toContain('TOTAL DES CHARGES FIXES ACTIFS');
    const formulaVal = (totRow.getCell(5).value as any)?.formula;
    expect(formulaVal).toBeDefined();
    expect(formulaVal).toContain('SUMIF');
    expect(formulaVal).toContain('<>Désactivé');

    // Vérifier sur l'onglet Tableau de bord : montant total actif doit valoir 100 € (et non 150 €)
    const wsDash = workbook.getWorksheet('Tableau de bord');
    let fixedAmountInDash: number | null = null;
    wsDash!.eachRow(r => {
      if (String(r.getCell(1).value) === 'Charges fixes') {
        fixedAmountInDash = Number(r.getCell(3).value);
      }
    });
    expect(fixedAmountInDash).toBe(100);
  });

  it('sépare strictement dépenses et remboursements de santé avec totaux et bilan dédiés', async () => {
    const acc = saveAccount(db, { id: 'acc-hea', name: 'Courant', type: 'checking', initialBalance: 500, referenceDate: '2026-01-01' });

    // Dépense de soin (80 €)
    saveTransaction(db, {
      id: 't-care',
      date: '2026-03-10',
      type: 'health_expense',
      amount: 80,
      status: 'cleared',
      accountId: acc.id!,
      label: 'Consultation spécialiste'
    });

    // Remboursement perçu (50 €)
    saveTransaction(db, {
      id: 't-reimb',
      date: '2026-03-15',
      type: 'health_reimbursement',
      amount: 50,
      status: 'cleared',
      accountId: acc.id!,
      label: 'Remboursement Sécu'
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsHealth = workbook.getWorksheet('Santé');
    expect(wsHealth).toBeDefined();

    let foundExpTotal = false;
    let foundReimbTotal = false;
    let foundResteACharge = false;

    wsHealth!.eachRow(r => {
      const col1 = String(r.getCell(1).value || '');
      if (col1.includes('TOTAL DES DÉPENSES DE SANTÉ ACTIVES')) {
        foundExpTotal = true;
        const formula = (r.getCell(5).value as any)?.formula;
        expect(formula).toContain('SUMIF');
      }
      if (col1.includes('TOTAL DES REMBOURSEMENTS ACTIFS')) {
        foundReimbTotal = true;
        const formula = (r.getCell(5).value as any)?.formula;
        expect(formula).toContain('SUMIF');
      }
      if (col1.includes('Reste à charge net')) {
        foundResteACharge = true;
        expect(Number(r.getCell(2).value)).toBe(30); // 80 - 50 = 30 €
      }
    });

    expect(foundExpTotal).toBe(true);
    expect(foundReimbTotal).toBe(true);
    expect(foundResteACharge).toBe(true);
  });

  it('intègre Crédits et Épargne dans l\'analyse des dépenses en distinguant dépenses réelles et trésorerie', async () => {
    const acc = saveAccount(db, { id: 'acc-full', name: 'Courant', type: 'checking', initialBalance: 1000, referenceDate: '2026-01-01' });
    const accSav = saveAccount(db, { id: 'acc-sav-dest', name: 'Livret A', type: 'savings', initialBalance: 2000, referenceDate: '2026-01-01' });

    // Dépense courante (60 €)
    saveTransaction(db, { id: 't-d', date: '2026-03-01', type: 'daily', amount: 60, status: 'cleared', accountId: acc.id!, label: 'Courses' });
    // Mensualité de prêt (300 €)
    saveTransaction(db, { id: 't-l', date: '2026-03-05', type: 'loan_payment', amount: 300, status: 'cleared', accountId: acc.id!, label: 'Mensualité Prêt Immo' });
    // Versement épargne (200 €)
    saveTransaction(db, { id: 't-s', date: '2026-03-10', type: 'transfer', amount: 200, status: 'cleared', accountId: acc.id!, destinationAccountId: accSav.id!, label: 'Épargne mensuelle' });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsAnalysis = workbook.getWorksheet('Analyse des dépenses');
    expect(wsAnalysis).toBeDefined();

    let foundLoanInRealExpenses = false;
    let foundSavingsInTreasury = false;
    let foundGrandTotal = false;

    wsAnalysis!.eachRow(r => {
      const col1 = String(r.getCell(1).value || '');
      if (col1.includes('Crédits (Mensualités de prêt)')) {
        foundLoanInRealExpenses = true;
        expect(Number(r.getCell(2).value)).toBe(300);
      }
      if (col1.includes('Versements vers l\'épargne (Alimentations)')) {
        foundSavingsInTreasury = true;
        expect(Number(r.getCell(2).value)).toBe(200);
      }
      if (col1.includes('TOTAL DES SORTIES DE TRÉSORERIE DU FOYER')) {
        foundGrandTotal = true;
      }
    });

    expect(foundLoanInRealExpenses).toBe(true);
    expect(foundSavingsInTreasury).toBe(true);
    expect(foundGrandTotal).toBe(true);
  });

  it('vérifie la conformité exacte des rubriques Tableau de bord, Crédits et de la section 3 Analyse des dépenses sans Err:522', async () => {
    const acc = saveAccount(db, { id: 'acc-tb-test', name: 'Compte Courant Principal', type: 'checking', initialBalance: 2500, referenceDate: '2026-01-01' });
    const accSav = saveAccount(db, { id: 'acc-tb-sav', name: 'Livret Épargne', type: 'savings', initialBalance: 5000, referenceDate: '2026-01-01' });
    
    // Prêt actif avec mensualité 450 € et capital restant 45 000 € (sans transaction manuelle)
    saveLoan(db, {
      id: 'loan-1',
      name: 'Prêt Immo Résidence',
      lender: 'Banque Populaire',
      loanType: 'mortgage',
      initialAmount: 60000,
      remainingCapital: 45000,
      monthlyPayment: 450,
      interestRate: 2.1,
      insurancePart: 20,
      startDate: '2024-01-01',
      endDate: '2034-01-01',
      durationMonths: 120,
      accountId: acc.id!,
      debitDay: 5
    });

    // Dépenses prévisionnelles
    const catProjet = saveCategory(db, { id: 'cat-proj', name: 'Informatique', type: 'daily' });
    savePlannedExpense(db, {
      id: 'pe-1',
      label: 'Nouvel Ordinateur Portable',
      estimatedAmount: 1200,
      urgency: 'urgent',
      categoryId: catProjet.id!,
      targetDate: '2026-06-15',
      notes: 'Pour le télétravail'
    });

    // Versement épargne (150 €)
    saveTransaction(db, {
      id: 't-sav-transfer',
      date: '2026-03-05',
      type: 'transfer',
      amount: 150,
      status: 'cleared',
      accountId: acc.id!,
      destinationAccountId: accSav.id!,
      label: 'Virement mensuel livret'
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // 1. Tableau de bord
    const wsDash = workbook.getWorksheet('Tableau de bord');
    expect(wsDash).toBeDefined();

    let loanDashboardAmt = -1;
    let foundCrossRowInDash = false;

    wsDash!.eachRow(r => {
      const col1 = String(r.getCell(1).value || '');
      if (col1 === 'Crédits') {
        loanDashboardAmt = Number(r.getCell(3).value);
      }
      if (col1.includes('Analyses croisées')) {
        foundCrossRowInDash = true;
      }
    });

    // La ligne Crédits dans Rubrique Applicative doit afficher la mensualité active (450 €), et non le capital restant (45 000 €)
    expect(loanDashboardAmt).toBe(450);
    // La ligne Analyses croisées doit être absente de la rubrique applicative du Tableau de bord
    expect(foundCrossRowInDash).toBe(false);

    // 2. Dépenses prévisionnelles absentes
    expect(workbook.getWorksheet('Dépenses prévisionnelles')).toBeUndefined();

    // 3. Analyse des dépenses (Section 3 sans référence circulaire Err:522)
    const wsAnalysis = workbook.getWorksheet('Analyse des dépenses');
    expect(wsAnalysis).toBeDefined();

    let rowConsolidationFoyer = -1;
    let rowConsolidationSavings = -1;
    let rowGrandTotal = -1;
    let grandTotalFormula = '';

    wsAnalysis!.eachRow((r, rowNum) => {
      const col1 = String(r.getCell(1).value || '');
      if (col1.includes('1. Dépenses du foyer')) {
        rowConsolidationFoyer = rowNum;
      }
      if (col1.includes('2. Versements placés sur l\'épargne')) {
        rowConsolidationSavings = rowNum;
      }
      if (col1.includes('3. TOTAL DES SORTIES DE TRÉSORERIE DU FOYER')) {
        rowGrandTotal = rowNum;
        const cellVal = r.getCell(2).value as any;
        grandTotalFormula = typeof cellVal === 'object' && cellVal?.formula ? cellVal.formula : '';
      }
    });

    expect(rowConsolidationFoyer).toBeGreaterThan(0);
    expect(rowConsolidationSavings).toBeGreaterThan(rowConsolidationFoyer);
    expect(rowGrandTotal).toBeGreaterThan(rowConsolidationSavings);

    // La formule du Grand Total doit additionner les deux lignes précédentes sans référence circulaire à elle-même
    expect(grandTotalFormula).toBe(`B${rowConsolidationFoyer}+B${rowConsolidationSavings}`);
    expect(grandTotalFormula).not.toContain(`B${rowGrandTotal}`);

    // 4. Analyses croisées (Crédits et absence de la section prévisionnelle)
    const wsCross = workbook.getWorksheet('Analyses croisées');
    expect(wsCross).toBeDefined();

    let foundCrossLoan = false;
    let foundPlannedCrossSection = false;

    wsCross!.eachRow(r => {
      const col1 = String(r.getCell(1).value || '');
      if (col1.includes('Mensualités de crédits actives')) {
        foundCrossLoan = true;
        // Total engagé pour le crédit (colonne 5)
        expect(Number(r.getCell(5).value)).toBe(450);
      }
      if (col1.includes('PROJETS D\'ACHATS PRÉVISIONNELS')) {
        foundPlannedCrossSection = true;
      }
    });

    expect(foundCrossLoan).toBe(true);
    expect(foundPlannedCrossSection).toBe(false);
  });

  it('sépare clairement les versements vers l\'épargne et les retraits d\'épargne', async () => {
    const accCurrent = saveAccount(db, { id: 'acc-c', name: 'Courant', type: 'checking', initialBalance: 1500, referenceDate: '2026-01-01' });
    const accSavings = saveAccount(db, { id: 'acc-s', name: 'Livret Bleu', type: 'savings', initialBalance: 4000, referenceDate: '2026-01-01' });

    // Versement vers livret (+400 €)
    saveTransaction(db, {
      id: 't-dep-split',
      date: '2026-03-02',
      type: 'transfer',
      amount: 400,
      status: 'cleared',
      accountId: accCurrent.id!,
      destinationAccountId: accSavings.id!,
      label: 'Versement auto'
    });

    // Retrait depuis livret (-150 €)
    saveTransaction(db, {
      id: 't-with-split',
      date: '2026-03-18',
      type: 'transfer',
      amount: 150,
      status: 'cleared',
      accountId: accSavings.id!,
      destinationAccountId: accCurrent.id!,
      label: 'Retrait imprévu'
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const wsSav = workbook.getWorksheet('Épargne');
    expect(wsSav).toBeDefined();

    let foundDepTable = false;
    let foundWithTable = false;

    wsSav!.eachRow(r => {
      const title = String(r.getCell(1).value || '');
      if (title.includes('3. VERSEMENTS VERS L\'ÉPARGNE')) foundDepTable = true;
      if (title.includes('4. RETRAITS DEPUIS L\'ÉPARGNE')) foundWithTable = true;
    });

    expect(foundDepTable).toBe(true);
    expect(foundWithTable).toBe(true);
  });

  it('génère l\'onglet Graphiques avec 4 images insérées et leurs tables de données sources', async () => {
    const acc = saveAccount(db, { id: 'acc-chart-test', name: 'Courant Charts', type: 'checking', initialBalance: 3000, referenceDate: '2026-01-01' });
    const accSav = saveAccount(db, { id: 'acc-chart-sav', name: 'Livret Charts', type: 'savings', initialBalance: 5000, referenceDate: '2026-01-01' });

    // Revenus sur 2 mois
    saveTransaction(db, { id: 'tx-inc-1', date: '2026-01-10', type: 'income', amount: 2500, status: 'cleared', accountId: acc.id!, label: 'Salaire Janv' });
    saveTransaction(db, { id: 'tx-inc-2', date: '2026-02-10', type: 'income', amount: 2500, status: 'cleared', accountId: acc.id!, label: 'Salaire Févr' });

    // Dépenses fixes et courantes
    saveTransaction(db, { id: 'tx-fix-1', date: '2026-01-05', type: 'fixed_expense', amount: 800, status: 'cleared', accountId: acc.id!, label: 'Loyer Janv' });
    saveTransaction(db, { id: 'tx-day-1', date: '2026-01-15', type: 'daily', amount: 300, status: 'cleared', accountId: acc.id!, label: 'Courses Janv' });
    saveTransaction(db, { id: 'tx-fix-2', date: '2026-02-05', type: 'fixed_expense', amount: 800, status: 'cleared', accountId: acc.id!, label: 'Loyer Févr' });
    saveTransaction(db, { id: 'tx-day-2', date: '2026-02-18', type: 'daily', amount: 450, status: 'cleared', accountId: acc.id!, label: 'Courses Févr' });

    // Santé
    saveTransaction(db, { id: 'tx-hea-exp', date: '2026-01-20', type: 'health_expense', amount: 100, status: 'cleared', accountId: acc.id!, label: 'Dentiste' });
    saveTransaction(db, { id: 'tx-hea-rem', date: '2026-01-25', type: 'health_reimbursement', amount: 70, status: 'cleared', accountId: acc.id!, label: 'Sécu' });

    // Épargne (versement et retrait)
    saveTransaction(db, { id: 'tx-sav-dep', date: '2026-01-08', type: 'transfer', amount: 300, status: 'cleared', accountId: acc.id!, destinationAccountId: accSav.id!, label: 'Épargne Janv' });
    saveTransaction(db, { id: 'tx-sav-wit', date: '2026-02-12', type: 'transfer', amount: 100, status: 'cleared', accountId: accSav.id!, destinationAccountId: acc.id!, label: 'Retrait Févr' });

    // Crédit
    saveLoan(db, {
      id: 'loan-chart',
      name: 'Prêt Auto Famille',
      lender: 'Cofidis',
      loanType: 'consumer',
      initialAmount: 15000,
      remainingCapital: 11200,
      monthlyPayment: 260,
      startDate: '2025-06-01',
      accountId: acc.id!
    });

    const buffer = await generateFullExportExcelWorkbook(db);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // L'onglet Graphiques est supprimé
    const wsCharts = workbook.getWorksheet('Graphiques');
    expect(wsCharts).toBeUndefined();

    // Le classeur contient exactement 10 onglets
    expect(workbook.worksheets.length).toBe(10);

    // Vérification de l'insertion du graphique unique en anneau sur le Tableau de bord
    const wsDash = workbook.getWorksheet('Tableau de bord');
    expect(wsDash).toBeDefined();

    const images = wsDash!.getImages();
    expect(images.length).toBe(1);

    // Vérification de la présence de la section 3 dédiée au graphique
    let foundSection3 = false;
    wsDash!.eachRow(r => {
      const val = String(r.getCell(1).value || '');
      if (val.includes('3. RÉPARTITION DES DÉPENSES PAR CATÉGORIES (VISUALISATION)')) {
        foundSection3 = true;
      }
    });
    expect(foundSection3).toBe(true);

    // Vérification du calcul du taux d'endettement dans le Tableau de bord avec revenus réels
    // Revenus Janv 2400 + Févr 2600 = 5000 sur 2 mois => Moyenne mensuelle = 2500 €
    // Mensualité prêt = 260 € => Taux d'endettement = 260 / 2500 = 0.104 (10.4 %)
    let debtRatioRowVal: any = null;
    let debtRatioNumFmt = '';
    wsDash!.eachRow(r => {
      const col1 = String(r.getCell(1).value || '');
      if (col1.includes('Taux d’endettement')) {
        debtRatioRowVal = r.getCell(2).value;
        debtRatioNumFmt = r.getCell(2).numFmt || '';
      }
    });

    expect(Number(debtRatioRowVal)).toBeCloseTo(0.104, 3);
    expect(debtRatioNumFmt).toBe('0.0 %');
  });
});
