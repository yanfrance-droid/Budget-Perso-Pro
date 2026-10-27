import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { getAllAccounts } from './accountService.ts';
import { getAllCategories } from './categoryService.ts';
import { getTransactions } from './transactionService.ts';
import { getAllLoans } from './loanService.ts';
import { getAllRecurrenceTemplates } from './recurrenceService.ts';
import { getAllIncomePayers } from './incomePayerService.ts';
import {
  generateDashboardExpenseDonutPng,
  type DashboardExpenseSlice
} from './dashboardChartService.ts';

/**
 * Traduction des types d'opérations bancaires pour affichage lisible
 */
export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  income: 'Revenu',
  fixed_expense: 'Charge fixe',
  variable_expense: 'Charge variable',
  daily: 'Dépense courante',
  health_expense: 'Dépense de santé',
  health_reimbursement: 'Remboursement santé',
  loan_payment: 'Remboursement crédit',
  transfer: 'Virement interne'
};

/**
 * Traduction contextuelle des statuts selon la nature du flux financier
 * - Revenus : Encaissé / En attente / Prévu / Désactivé
 * - Dépenses : Débité / En attente / Prévu / Désactivé
 * - Remboursements santé : Reçu / En attente / Prévu / Désactivé
 * - Virements d'épargne : Effectué / En attente / Prévu / Annulé
 */
export function getTransactionStatusLabel(type: string, status: string): string {
  if (type === 'income') {
    switch (status) {
      case 'cleared': return 'Encaissé';
      case 'pending': return 'En attente';
      case 'planned': return 'Prévu';
      case 'disabled': return 'Désactivé';
      default: return status || 'Inconnu';
    }
  }

  if (type === 'health_reimbursement') {
    switch (status) {
      case 'cleared': return 'Reçu';
      case 'pending': return 'En attente';
      case 'planned': return 'Prévu';
      case 'disabled': return 'Désactivé';
      default: return status || 'Inconnu';
    }
  }

  if (type === 'transfer') {
    switch (status) {
      case 'cleared': return 'Effectué';
      case 'pending': return 'En attente';
      case 'planned': return 'Prévu';
      case 'disabled': return 'Annulé';
      default: return status || 'Inconnu';
    }
  }

  // Dépenses fixes, variables, courantes, santé, mensualités de prêt
  switch (status) {
    case 'cleared': return 'Débité';
    case 'pending': return 'En attente';
    case 'planned': return 'Prévu';
    case 'disabled': return 'Désactivé';
    default: return status || 'Inconnu';
  }
}

/**
 * Traduction des types de comptes
 */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Compte courant',
  savings: 'Compte épargne',
  cash: 'Espèces'
};

/**
 * Traduction des sous-types de comptes
 */
const ACCOUNT_SUBTYPE_LABELS: Record<string, string> = {
  checking: 'Compte courant',
  livret_a: 'Livret A',
  lep: 'LEP (Livret d’épargne populaire)',
  ldds: 'LDDS (Développement durable)',
  livret_jeune: 'Livret jeune',
  livret_bancaire: 'Livret bancaire',
  pel: 'PEL (Plan d’épargne logement)',
  cel: 'CEL (Compte épargne logement)',
  assurance_vie: 'Assurance-vie',
  pea: 'PEA (Plan d’épargne en actions)',
  compte_a_terme: 'Compte à terme',
  pee: 'PEE (Épargne entreprise)',
  perco: 'PERCO',
  pereco: 'PERECO',
  other: 'Autre / Personnalisé'
};

/**
 * Traduction des types de prêts
 */
const LOAN_TYPE_LABELS: Record<string, string> = {
  consumer: 'Consommation',
  mortgage: 'Immobilier'
};

// ============================================================================
// CHARTE GRAPHIQUE COMPATIBLE EXCEL & LIBREOFFICE CALC
// ============================================================================
const COLOR_PRIMARY = 'FF1E3A8A';        // Bleu marine corporate
const COLOR_PRIMARY_LIGHT = 'FFEFF6FF';  // Bleu très doux pour totaux
const COLOR_ZEBRA = 'FFF8FAFC';          // Gris très clair
const COLOR_BORDER = 'FFCBD5E1';         // Bordure fine
const COLOR_SUBHEADER = 'FF334155';      // Gris ardoise soutenu
const COLOR_DISABLED = 'FFF1F5F9';       // Gris pour lignes désactivées

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLOR_PRIMARY }
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLOR_SUBHEADER }
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
};

const ZEBRA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLOR_ZEBRA }
};

const DISABLED_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLOR_DISABLED }
};

const DISABLED_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  color: { argb: 'FF94A3B8' }
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLOR_PRIMARY_LIGHT }
};

const TOTAL_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: COLOR_PRIMARY }
};

const CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLOR_BORDER } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } }
};

const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: COLOR_BORDER } },
  bottom: { style: 'double', color: { argb: COLOR_PRIMARY } },
  right: { style: 'thin', color: { argb: COLOR_BORDER } }
};

// Formats de cellules
const FMT_CURRENCY = '#,##0.00 €;[Red]-#,##0.00 €;"0.00 €"';
const FMT_PERCENT = '0.00 %';
const FMT_PERCENT_ONE = '0.0 %';
const FMT_DATE = 'YYYY-MM-DD';
const FMT_MONTH = 'YYYY-MM';
const FMT_TEXT = '@';
const FMT_INTEGER = '#,##0';

/**
 * Options d'exportation pour le filtrage par période
 */
export interface ExcelExportOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

/**
 * Calcul du solde réel actuel d'un compte (solde initial + transactions pointées/cleared)
 * Réplique rigoureusement la formule du moteur calculations.ts
 */
export function calculateAccountRealBalance(account: any, allTransactions: any[]): number {
  const initial = Number(account.initialBalance) || 0;
  return initial + allTransactions
    .filter(t => (t.accountId === account.id || t.destinationAccountId === account.id) && t.status === 'cleared')
    .reduce((sum, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'transfer') {
        if (t.accountId === account.id && t.destinationAccountId === account.id) {
          return sum;
        }
        if (t.destinationAccountId === account.id) {
          return sum + Math.abs(amt);
        }
        if (t.accountId === account.id) {
          return sum - Math.abs(amt);
        }
      }
      if (t.type === 'income') return sum + amt;
      if (['fixed_expense', 'variable_expense', 'daily', 'health_expense', 'loan_payment'].includes(t.type)) {
        return sum - amt;
      }
      if (t.type === 'health_reimbursement') {
        return sum + amt;
      }
      return sum;
    }, 0);
}

/**
 * Applique le centrage strict horizontal et vertical sur toutes les cellules de la feuille
 * tout en activant le retour à la ligne automatique pour les libellés et textes longs
 */
function applyUniversalCentering(worksheet: ExcelJS.Worksheet) {
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      };
    });
  });
}

/**
 * Ajuste automatiquement la largeur de toutes les colonnes actives
 * avec une marge de lisibilité et une largeur maximale de sécurité
 */
function autoFitAllColumns(worksheet: ExcelJS.Worksheet) {
  const maxColIndex = Math.max(
    worksheet.actualColumnCount || 0,
    worksheet.columnCount || 0,
    worksheet.lastColumn?.number || 0
  );

  for (let c = 1; c <= maxColIndex; c++) {
    const col = worksheet.getColumn(c);
    let maxLen = 0;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const val = cell.value;
      if (val !== null && val !== undefined) {
        let text = '';
        if (typeof val === 'object') {
          if ('result' in val && val.result !== undefined && val.result !== null) {
            text = String(val.result);
          } else if ('text' in val && (val as any).text !== undefined) {
            text = String((val as any).text);
          } else if ('formula' in val) {
            text = '123 456,78 €'; // Estimation standard pour les formules monétaires
          } else {
            text = String(val);
          }
        } else {
          text = String(val);
        }

        if (cell.numFmt === FMT_CURRENCY) {
          text = text.length > 0 ? `${text} 00 €` : text;
        }

        // On ne base pas la largeur sur les titres de lignes fusionnées (comme A1:G1)
        const rowIdx = typeof (cell as any).row === 'number' ? (cell as any).row : 0;
        if (rowIdx > 2 && text.length > maxLen) {
          maxLen = text.length;
        } else if (rowIdx <= 2 && maxLen === 0) {
          maxLen = Math.min(text.length, 25);
        }
      }
    });

    if (maxLen > 0) {
      // Largeur avec marge, min 14, max 50 pour laisser le texte s'enrouler
      col.width = Math.min(Math.max(maxLen + 4, 14), 50);
    }
  }
}

/**
 * Applique le style aux en-têtes principaux d'une feuille
 */
function applyHeaderRowStyle(worksheet: ExcelJS.Worksheet, headerRowIndex = 1) {
  worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.height = 28;
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = CELL_BORDER;
  });
}

/**
 * Construit un tableau vertical dans l'onglet Analyses croisées
 * Reste confiné dans les colonnes A à F pour supprimer tout défilement horizontal excessif.
 */
function renderCrossAnalysisSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rowsData: Array<{ label: string; values: number[]; total: number }>,
  totalLabel: string = 'TOTAL'
): number {
  let curRow = startRow;

  // 1. Titre de la section
  const titleCell = ws.getCell(`A${curRow}`);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLOR_PRIMARY } };
  curRow++;

  // 2. En-têtes du tableau
  const hRow = ws.getRow(curRow);
  hRow.height = 24;
  headers.forEach((h, idx) => {
    const c = hRow.getCell(idx + 1);
    c.value = h;
    c.fill = SUBHEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = CELL_BORDER;
  });
  curRow++;

  // 3. Lignes de données
  const firstDataRow = curRow;
  for (const rowItem of rowsData) {
    const r = ws.getRow(curRow);
    r.height = 20;

    const labelCell = r.getCell(1);
    labelCell.value = rowItem.label;
    labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    labelCell.border = CELL_BORDER;

    rowItem.values.forEach((val, valIdx) => {
      const c = r.getCell(valIdx + 2);
      c.value = val;
      c.numFmt = FMT_CURRENCY;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = CELL_BORDER;
    });

    const totCell = r.getCell(rowItem.values.length + 2);
    totCell.value = rowItem.total;
    totCell.numFmt = FMT_CURRENCY;
    totCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totCell.font = { bold: true };
    totCell.border = CELL_BORDER;

    curRow++;
  }
  const lastDataRow = curRow - 1;

  // 4. Ligne de total
  const totRow = ws.getRow(curRow);
  totRow.height = 24;
  const totLabelCell = totRow.getCell(1);
  totLabelCell.value = totalLabel;
  totLabelCell.font = TOTAL_FONT;
  totLabelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  totLabelCell.fill = TOTAL_FILL;
  totLabelCell.border = TOTAL_BORDER;

  const numCols = headers.length - 1; // colonnes numériques
  for (let c = 1; c <= numCols; c++) {
    const cell = totRow.getCell(c + 1);
    if (rowsData.length > 0) {
      const colLetter = String.fromCharCode(65 + c);
      cell.value = { formula: `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})` };
    } else {
      cell.value = 0;
    }
    cell.font = TOTAL_FONT;
    cell.numFmt = FMT_CURRENCY;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = TOTAL_FILL;
    cell.border = TOTAL_BORDER;
  }

  curRow++;
  // Retourne la prochaine ligne de départ (avec 2 lignes d'espacement)
  return curRow + 2;
}

/**
 * Génère le classeur Excel complet multi-onglets structuré exactement selon la navigation (11 onglets)
 */
export async function generateFullExportExcelWorkbook(
  db: DatabaseSync,
  options: ExcelExportOptions = {}
): Promise<Buffer> {
  const accounts = getAllAccounts(db);
  const categories = getAllCategories(db);
  const transactions = getTransactions(db);
  const loans = getAllLoans(db);
  const recurrenceTemplates = getAllRecurrenceTemplates(db);
  const incomePayers = getAllIncomePayers(db);

  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const categoryMap = new Map(categories.map(c => [c.id, c]));
  const payerMap = new Map(incomePayers.map(p => [p.id, p]));
  const loanMap = new Map(loans.map(l => [l.id, l]));

  // Déterminer la période filtrée éventuelle
  const hasPeriodFilter = Boolean(options.startDate || options.endDate);
  const filterStart = options.startDate || '1970-01-01';
  const filterEnd = options.endDate || '2099-12-31';

  const isDateInPeriod = (d?: string | null): boolean => {
    if (!hasPeriodFilter) return true;
    if (!d) return false;
    const fullDate = d.length === 7 ? `${d}-01` : d;
    return fullDate >= filterStart && fullDate <= filterEnd;
  };

  // Filtrage des transactions selon la date d'opération
  const allFilteredTransactions = hasPeriodFilter
    ? transactions.filter(t => isDateInPeriod(t.date))
    : transactions;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Budget Perso Pro';
  workbook.lastModifiedBy = 'Budget Perso Pro';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // CALCULS ET CLASSIFICATIONS FINANCIÈRES RIGOUREUSES (EXCLUSION DES DISABLED)
  // =========================================================================
  const txIncome = allFilteredTransactions.filter(t => t.type === 'income');
  const txFixed = allFilteredTransactions.filter(t => t.type === 'fixed_expense');
  const txVariable = allFilteredTransactions.filter(t => t.type === 'variable_expense');
  const txDaily = allFilteredTransactions.filter(t => t.type === 'daily');
  const txHealthAll = allFilteredTransactions.filter(t => t.type === 'health_expense' || t.type === 'health_reimbursement');
  const txHealthExpenses = allFilteredTransactions.filter(t => t.type === 'health_expense');
  const txHealthReimbursements = allFilteredTransactions.filter(t => t.type === 'health_reimbursement');
  const txLoanPayments = allFilteredTransactions.filter(t => t.type === 'loan_payment');
  const txTransfer = allFilteredTransactions.filter(t => t.type === 'transfer');

  // Classification directionnelle des transferts d'épargne sur la période
  const savingsDeposits: any[] = [];
  const savingsWithdrawals: any[] = [];
  const internalSavingsTransfers: any[] = [];

  for (const t of txTransfer) {
    const srcAcc = t.accountId ? accountMap.get(t.accountId) : undefined;
    const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : undefined;

    const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
    const isDestSavings = destAcc ? destAcc.type === 'savings' : true;

    if (isSrcSavings && isDestSavings) {
      internalSavingsTransfers.push(t);
    } else if (isDestSavings && !isSrcSavings) {
      savingsDeposits.push(t);
    } else if (isSrcSavings && !isDestSavings) {
      savingsWithdrawals.push(t);
    } else {
      // Par défaut si non déterminé : versement
      savingsDeposits.push(t);
    }
  }

  // Totaux des flux d'épargne (hors annulés/disabled)
  const totalSavingsDeposits = savingsDeposits
    .filter(t => t.status !== 'disabled')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  const totalSavingsWithdrawals = savingsWithdrawals
    .filter(t => t.status !== 'disabled')
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  const netSavingsFlow = totalSavingsDeposits - totalSavingsWithdrawals;

  // Calculs unifiés des mensualités de crédits pour la période ou globale
  // Prend en compte les transactions effectives (cleared, pending, planned hors disabled)
  // et à défaut les mensualités des crédits actifs
  const activeLoans = loans.filter(l => !l.isArchived);
  const totalRemainingCapital = activeLoans.reduce((sum, l) => sum + (Number(l.remainingCapital) || 0), 0);
  const totalMonthlyPayments = activeLoans.filter(l => !l.isPaused).reduce((sum, l) => sum + (Number(l.monthlyPayment) || 0), 0);

  // Mensualités de crédits enregistrées via des transactions
  const activeLoanPaymentsTxs = txLoanPayments.filter(t => t.status !== 'disabled');
  const recordedLoanPaymentsSum = activeLoanPaymentsTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // Montant effectif des mensualités de crédit pour l'export :
  // Si des transactions de remboursement existent, on utilise leur somme.
  // Sinon, on prend la mensualité théorique des crédits actifs non suspendus.
  const effectiveTotalLoanPayments = recordedLoanPaymentsSum > 0 ? recordedLoanPaymentsSum : totalMonthlyPayments;

  // Décomposition par statut des mensualités de crédit (utilisée dans Analyse des dépenses et Analyses croisées)
  let loanCleared = activeLoanPaymentsTxs.filter(t => t.status === 'cleared').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  let loanPending = activeLoanPaymentsTxs.filter(t => t.status === 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  let loanPlanned = activeLoanPaymentsTxs.filter(t => t.status === 'planned').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Si aucune transaction de crédit n'est saisie mais que des crédits actifs existent,
  // la mensualité théorique est positionnée en "Prévu"
  if (activeLoanPaymentsTxs.length === 0 && totalMonthlyPayments > 0) {
    loanPlanned = totalMonthlyPayments;
  }
  const loanTotalEffective = loanCleared + loanPending + loanPlanned;

  // Calculs détaillés des mensualités de crédits : capital vs intérêts si amortizedCapital renseigné
  let loanCapitalPaid = 0;
  let loanInterestPaid = 0;
  for (const lp of txLoanPayments) {
    if (lp.status === 'disabled') continue;
    const totalAmt = Math.abs(Number(lp.amount) || 0);
    const amortized = lp.amortizedCapital !== undefined && lp.amortizedCapital !== null && !isNaN(Number(lp.amortizedCapital))
      ? Number(lp.amortizedCapital)
      : null;

    if (amortized !== null && amortized > 0 && amortized <= totalAmt) {
      loanCapitalPaid += amortized;
      loanInterestPaid += (totalAmt - amortized);
    } else {
      // Si amortizedCapital n'est pas saisi sur l'opération, tout est comptabilisé en mensualité globale
      loanCapitalPaid += totalAmt;
    }
  }

  // =========================================================================
  // ONGLET 1 : Tableau de bord (Vue d'ensemble générale & indicateurs clés)
  // =========================================================================
  const wsDash = workbook.addWorksheet('Tableau de bord');
  wsDash.views = [{ state: 'frozen', ySplit: 2 }];

  wsDash.mergeCells('A1:G1');
  const tDash = wsDash.getCell('A1');
  tDash.value = 'BUDGET PERSO PRO — TABLEAU DE BORD GÉNÉRAL';
  tDash.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tDash.fill = HEADER_FILL;
  tDash.alignment = { vertical: 'middle', horizontal: 'center' };
  wsDash.getRow(1).height = 36;

  wsDash.mergeCells('A2:G2');
  const sDash = wsDash.getCell('A2');
  const periodSubtitle = hasPeriodFilter
    ? `Période sélectionnée : du ${options.startDate || 'Origine'} au ${options.endDate || 'Fin'} — Situation au ${new Date().toLocaleDateString('fr-FR')}`
    : `Situation au ${new Date().toLocaleDateString('fr-FR')} — Historique complet de l'ensemble des rubriques`;
  sDash.value = periodSubtitle;
  sDash.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  sDash.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sDash.alignment = { vertical: 'middle', horizontal: 'center' };
  wsDash.getRow(2).height = 20;

  // Calculs d'indicateurs globaux
  const activeAccounts = accounts.filter(a => !a.isClosed);
  const closedAccounts = accounts.filter(a => a.isClosed);
  const totalInitialBalanceActive = activeAccounts.reduce((sum, a) => sum + (Number(a.initialBalance) || 0), 0);

  wsDash.getCell('A4').value = '1. INDICATEURS CLÉS DU BUDGET & PATRIMOINE';
  wsDash.getCell('A4').font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  wsDash.getRow(5).values = ['Indicateur', 'Valeur', 'Périmètre fonctionnel'];
  wsDash.getRow(5).height = 24;
  wsDash.getRow(5).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Calcul du taux d'endettement budgétaire
  // Règle métier : ratio entre les mensualités actives de prêt et les revenus mensuels actifs
  const totalActiveIncome = txIncome.filter(t => t.status !== 'disabled').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const incomeMonthsSet = new Set(
    txIncome.filter(t => t.status !== 'disabled' && t.date)
      .map(t => t.date.substring(0, 7))
  );
  const distinctIncomeMonths = incomeMonthsSet.size > 0 ? incomeMonthsSet.size : 1;
  const monthlyAverageIncome = totalActiveIncome / distinctIncomeMonths;

  let debtRatioValue: number | string = 'N/A';
  let debtRatioFmt: string = FMT_TEXT;
  let debtRatioNote: string = 'Revenus indisponibles ou nuls';

  if (monthlyAverageIncome > 0 && Number.isFinite(monthlyAverageIncome)) {
    debtRatioValue = totalMonthlyPayments / monthlyAverageIncome;
    debtRatioFmt = FMT_PERCENT_ONE;
    debtRatioNote = `Calculé sur base d'un revenu moyen de ${(monthlyAverageIncome).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} €/mois`;
  }

  const dashKPIs: Array<[string, number | string, string, string]> = [
    ['Comptes bancaires actifs', activeAccounts.length, FMT_INTEGER, 'Comptes ouverts disponibles'],
    ['Comptes clôturés', closedAccounts.length, FMT_INTEGER, 'Comptes fermés ou archivés'],
    ['Total des soldes initiaux (comptes actifs)', totalInitialBalanceActive, FMT_CURRENCY, 'Somme des soldes de départ (hors flux)'],
    ['Capital restant dû des crédits en cours', totalRemainingCapital, FMT_CURRENCY, `${activeLoans.length} emprunt(s) actif(s) non archivé(s)`],
    ['Engagements mensuels de prêt', totalMonthlyPayments, FMT_CURRENCY, 'Mensualités actives non suspendues'],
    ['Taux d’endettement', debtRatioValue, debtRatioFmt, debtRatioNote]
  ];

  let dashRow = 6;
  for (const [lbl, val, fmt, note] of dashKPIs) {
    const row = wsDash.getRow(dashRow++);
    row.values = [lbl, val, note];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).numFmt = fmt;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }

  // Rubriques et volumes d'opérations actives
  dashRow += 2;
  wsDash.getCell(`A${dashRow}`).value = '2. VOLUMÉTRIE ET MONTANTS ACTIFS PAR RUBRIQUE (HORS DÉSACTIVÉS)';
  wsDash.getCell(`A${dashRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };
  
  dashRow++;
  wsDash.getRow(dashRow).values = ['Rubrique applicative (Onglet)', 'Nombre d\'éléments', 'Montant total actif (€)', 'Nature du contenu'];
  wsDash.getRow(dashRow).height = 24;
  wsDash.getRow(dashRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const sumActive = (txs: any[]) => txs.filter(t => t.status !== 'disabled').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const rubriquesSummary = [
    ['Revenus', txIncome.length, sumActive(txIncome), 'Salaires, aides et recettes actives'],
    ['Charges fixes', txFixed.length, sumActive(txFixed), 'Loyers, abonnements, assurances actifs'],
    ['Charges variables', txVariable.length, sumActive(txVariable), 'Factures d\'énergie, eau, charges périodiques actives'],
    ['Dépenses', txDaily.length, sumActive(txDaily), 'Courses, carburant, loisirs, dépenses courantes actives'],
    ['Santé (Dépenses de soins)', txHealthExpenses.length, sumActive(txHealthExpenses), 'Dépenses médicales actives'],
    ['Santé (Remboursements reçus/attendus)', txHealthReimbursements.length, sumActive(txHealthReimbursements), 'Remboursements sécurité sociale et mutuelle'],
    ['Crédits', loans.length, effectiveTotalLoanPayments, 'Mensualités d\'emprunts actives'],
    ['Épargne (Versements vers livrets)', savingsDeposits.length, totalSavingsDeposits, 'Alimentations nettes de l\'épargne']
  ];

  dashRow++;
  for (const [rName, count, amt, desc] of rubriquesSummary) {
    const row = wsDash.getRow(dashRow++);
    row.values = [rName, count, amt, desc];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).numFmt = FMT_INTEGER;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).numFmt = FMT_CURRENCY;
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }

  // -------------------------------------------------------------------------
  // 3. Graphique en anneau : « Répartition des dépenses par catégories »
  // Inséré immédiatement sous la table de volumétrie dans le Tableau de bord
  // -------------------------------------------------------------------------
  dashRow += 2;
  const chartSectionTitleRow = dashRow;
  wsDash.getCell(`A${chartSectionTitleRow}`).value = '3. RÉPARTITION DES DÉPENSES PAR CATÉGORIES (VISUALISATION)';
  wsDash.getCell(`A${chartSectionTitleRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  // Calcul rigoureux des 6 catégories demandées :
  // 1. Charges fixes (actives)
  const chartFixed = sumActive(txFixed);
  // 2. Charges variables (actives)
  const chartVariable = sumActive(txVariable);
  // 3. Dépenses courantes (actives)
  const chartDaily = sumActive(txDaily);
  // 4. Santé : dépenses de soins réelles nettes des remboursements reçus (sans compter les remb en revenus)
  const healthGross = sumActive(txHealthExpenses);
  const healthClearedReimbursements = txHealthReimbursements
    .filter(t => t.status === 'cleared')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const chartHealthNet = Math.max(0, healthGross - healthClearedReimbursements);
  // 5. Crédits : mensualités actives de la période
  const chartCredits = effectiveTotalLoanPayments;
  // 6. Épargne : versements nets vers l'épargne (dépôts - retraits, sans les transferts internes)
  const chartSavingsNet = Math.max(0, netSavingsFlow);

  const dashboardChartSlices: DashboardExpenseSlice[] = [
    { label: 'Charges fixes', amount: chartFixed, color: '#2563eb' },
    { label: 'Charges variables', amount: chartVariable, color: '#f59e0b' },
    { label: 'Dépenses courantes', amount: chartDaily, color: '#10b981' },
    { label: 'Santé (reste à charge)', amount: chartHealthNet, color: '#ec4899' },
    { label: 'Crédits (mensualités)', amount: chartCredits, color: '#8b5cf6' },
    { label: 'Épargne (versements nets)', amount: chartSavingsNet, color: '#0d9488', isSavings: true }
  ];

  const donutBuffer = await generateDashboardExpenseDonutPng(dashboardChartSlices);
  const donutImgId = workbook.addImage({ buffer: donutBuffer, extension: 'png' });

  // Insertion de l'image (environ 650 x 340 px) débutant sous le titre, colonnes A à G
  const imgStartRow = chartSectionTitleRow + 1; // 0-based row = chartSectionTitleRow
  wsDash.addImage(donutImgId, {
    tl: { col: 0.5, row: imgStartRow },
    ext: { width: 680, height: 355 }
  });

  // Définir la hauteur des lignes traversées par le graphique pour garantir un rendu aéré sans chevauchement
  for (let r = imgStartRow; r <= imgStartRow + 19; r++) {
    const rowObj = wsDash.getRow(r);
    if (!rowObj.height || rowObj.height < 18) {
      rowObj.height = 18;
    }
  }

  // Positionner dashRow au-delà du graphique pour toute éventuelle extension future
  dashRow = imgStartRow + 21;

  // =========================================================================
  // HELPER POUR CRÉER LES ONGLETS D'OPÉRATIONS DÉDIÉS
  // Ligne de total formulée avec SUMIF pour exclure rigoureusement les disabled
  // =========================================================================
  function createTransactionTab(
    sheetName: string,
    filteredTxs: any[],
    specificPayerColumn = false
  ) {
    const ws = workbook.addWorksheet(sheetName);
    const columns: any[] = [
      { header: 'Date', key: 'date' },
      { header: 'Mois', key: 'month' },
      { header: 'Statut', key: 'statusLabel' },
      { header: 'Libellé', key: 'label' },
      { header: 'Montant (€)', key: 'amount' },
      { header: 'Catégorie', key: 'categoryName' },
      { header: 'Compte', key: 'accountName' }
    ];

    if (specificPayerColumn) {
      columns.push({ header: 'Organisme verseur', key: 'payerName' });
    }

    columns.push(
      { header: 'Mode de règlement', key: 'paymentMethod' },
      { header: 'N° Chèque', key: 'checkNumber' },
      { header: 'Date prévue', key: 'expectedDate' },
      { header: 'Notes & Commentaires', key: 'notes' }
    );

    ws.columns = columns;

    let rIdx = 2;
    for (const t of filteredTxs) {
      const acc = accountMap.get(t.accountId);
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;
      const payer = t.payerId ? payerMap.get(t.payerId) : null;
      const m = t.date ? t.date.slice(0, 7) : '';
      const isDisabled = t.status === 'disabled';

      const rowData: any = {
        date: t.date || '',
        month: m,
        statusLabel: getTransactionStatusLabel(t.type, t.status),
        label: t.label || '',
        amount: typeof t.amount === 'number' ? t.amount : Number(t.amount || 0),
        categoryName: cat ? cat.name : 'Sans catégorie',
        accountName: acc ? acc.name : '',
        paymentMethod: t.paymentMethod || '',
        checkNumber: t.checkNumber ? String(t.checkNumber) : '',
        expectedDate: t.expectedDate || '',
        notes: t.notes || ''
      };

      if (specificPayerColumn) {
        rowData.payerName = payer ? payer.name : '';
      }

      const row = ws.addRow(rowData);
      row.height = 20;
      if (isDisabled) {
        row.eachCell({ includeEmpty: true }, c => {
          c.fill = DISABLED_FILL;
          c.font = DISABLED_FONT;
        });
      } else if (rIdx % 2 === 1) {
        row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });
      }

      row.getCell('date').numFmt = FMT_DATE;
      row.getCell('date').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('month').numFmt = FMT_MONTH;
      row.getCell('month').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('statusLabel').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('label').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.getCell('amount').numFmt = FMT_CURRENCY;
      row.getCell('amount').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('categoryName').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.getCell('accountName').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      row.getCell('checkNumber').numFmt = FMT_TEXT;
      row.getCell('checkNumber').alignment = { horizontal: 'center', vertical: 'middle' };

      row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
      rIdx++;
    }

    // Ligne de total du tableau de détail (exclut rigoureusement "Désactivé" via SUMIF)
    if (filteredTxs.length > 0) {
      const totRowData: any = {
        date: '',
        month: '',
        statusLabel: '',
        label: `TOTAL DES ${sheetName.toUpperCase()} ACTIFS`,
        amount: { formula: `SUMIF(C2:C${rIdx - 1}, "<>Désactivé", E2:E${rIdx - 1})` },
        categoryName: '',
        accountName: '',
        paymentMethod: '',
        checkNumber: '',
        expectedDate: '',
        notes: ''
      };
      if (specificPayerColumn) totRowData.payerName = '';
      const totRow = ws.addRow(totRowData);
      totRow.height = 24;
      totRow.font = TOTAL_FONT;
      totRow.eachCell({ includeEmpty: true }, c => {
        c.fill = TOTAL_FILL;
        c.border = TOTAL_BORDER;
      });
      totRow.getCell('label').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      totRow.getCell('amount').numFmt = FMT_CURRENCY;
      totRow.getCell('amount').alignment = { horizontal: 'center', vertical: 'middle' };
    }

    applyHeaderRowStyle(ws, 1);

    const lastColLetter = specificPayerColumn ? 'L' : 'K';
    const filterEndRow = rIdx > 2 ? rIdx - 1 : 1;
    ws.autoFilter = { from: 'A1', to: `${lastColLetter}${filterEndRow}` };

    return ws;
  }

  // =========================================================================
  // ONGLET 2 : Revenus (type === 'income')
  // =========================================================================
  createTransactionTab('Revenus', txIncome, true);

  // =========================================================================
  // ONGLET 3 : Charges fixes (type === 'fixed_expense')
  // =========================================================================
  createTransactionTab('Charges fixes', txFixed, false);

  // =========================================================================
  // ONGLET 4 : Charges variables (type === 'variable_expense')
  // =========================================================================
  createTransactionTab('Charges variables', txVariable, false);

  // =========================================================================
  // ONGLET 5 : Dépenses (type === 'daily')
  // =========================================================================
  createTransactionTab('Dépenses', txDaily, false);

  // =========================================================================
  // ONGLET 6 : Analyse des dépenses (Complété avec Crédits et Épargne)
  // Exclut rigoureusement les disabled et distingue dépenses réelles vs trésorerie
  // =========================================================================
  const wsAnalysis = workbook.addWorksheet('Analyse des dépenses');
  wsAnalysis.views = [{ state: 'frozen', ySplit: 2 }];

  wsAnalysis.mergeCells('A1:G1');
  const tAn = wsAnalysis.getCell('A1');
  tAn.value = 'ANALYSE TRANSVERSALE DES DÉPENSES & CHARGES DU FOYER';
  tAn.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tAn.fill = HEADER_FILL;
  tAn.alignment = { vertical: 'middle', horizontal: 'center' };
  wsAnalysis.getRow(1).height = 36;

  wsAnalysis.mergeCells('A2:G2');
  const sAn = wsAnalysis.getCell('A2');
  sAn.value = 'Consolidation exhaustive : charges fixes, charges variables, dépenses courantes, santé, crédits et flux vers l\'épargne';
  sAn.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  sAn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sAn.alignment = { vertical: 'middle', horizontal: 'center' };
  wsAnalysis.getRow(2).height = 20;

  // Tableau 1 : Répartition des dépenses réelles par nature (hors mouvements de trésorerie)
  wsAnalysis.getCell('A4').value = '1. RÉPARTITION DES DÉPENSES RÉELLES DU FOYER (HORS DÉSACTIVÉS)';
  wsAnalysis.getCell('A4').font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  wsAnalysis.getRow(5).values = ['Rubrique de dépense', 'Débité (€)', 'En attente (€)', 'Prévu (€)', 'Total engagé (€)'];
  wsAnalysis.getRow(5).height = 24;
  wsAnalysis.getRow(5).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const realExpenseBuckets = [
    { label: 'Charges fixes', txs: txFixed, customAmounts: null },
    { label: 'Charges variables', txs: txVariable, customAmounts: null },
    { label: 'Dépenses courantes', txs: txDaily, customAmounts: null },
    { label: 'Dépenses de santé (soins)', txs: txHealthExpenses, customAmounts: null },
    { label: 'Crédits (Mensualités de prêt)', txs: txLoanPayments, customAmounts: { cleared: loanCleared, pending: loanPending, planned: loanPlanned, total: loanTotalEffective } }
  ];

  let anRow = 6;
  const firstRealExpRow = anRow;
  for (const b of realExpenseBuckets) {
    let cleared = 0;
    let pending = 0;
    let planned = 0;
    let tot = 0;

    if (b.customAmounts) {
      cleared = b.customAmounts.cleared;
      pending = b.customAmounts.pending;
      planned = b.customAmounts.planned;
      tot = b.customAmounts.total;
    } else {
      cleared = b.txs.filter(t => t.status === 'cleared').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      pending = b.txs.filter(t => t.status === 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      planned = b.txs.filter(t => t.status === 'planned').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      tot = cleared + pending + planned;
    }

    const row = wsAnalysis.getRow(anRow++);
    row.values = [b.label, cleared, pending, planned, tot];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).numFmt = FMT_CURRENCY;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).numFmt = FMT_CURRENCY;
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).numFmt = FMT_CURRENCY;
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).font = { bold: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }
  const lastRealExpRow = anRow - 1;

  // Ligne de total des dépenses réelles
  const totRealExpRowNum = anRow;
  const totAnRow = wsAnalysis.getRow(anRow++);
  totAnRow.height = 24;
  totAnRow.values = [
    'SOUS-TOTAL DÉPENSES RÉELLES',
    { formula: `SUM(B${firstRealExpRow}:B${lastRealExpRow})` },
    { formula: `SUM(C${firstRealExpRow}:C${lastRealExpRow})` },
    { formula: `SUM(D${firstRealExpRow}:D${lastRealExpRow})` },
    { formula: `SUM(E${firstRealExpRow}:E${lastRealExpRow})` }
  ];
  totAnRow.font = TOTAL_FONT;
  totAnRow.eachCell({ includeEmpty: true }, c => {
    c.fill = TOTAL_FILL;
    c.border = TOTAL_BORDER;
    c.numFmt = FMT_CURRENCY;
  });
  totAnRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // Tableau 2 : Mouvements vers l'épargne (Trésorerie / Patrimoine)
  anRow += 2;
  wsAnalysis.getCell(`A${anRow}`).value = '2. EFFORT D\'ÉPARGNE & MOUVEMENTS DE TRÉSORERIE (DISTINCTS DES DÉPENSES)';
  wsAnalysis.getCell(`A${anRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  anRow++;
  wsAnalysis.getRow(anRow).values = ['Nature du mouvement', 'Effectué (€)', 'En attente (€)', 'Prévu (€)', 'Total flux (€)'];
  wsAnalysis.getRow(anRow).height = 24;
  wsAnalysis.getRow(anRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const depCleared = savingsDeposits.filter(t => t.status === 'cleared').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const depPending = savingsDeposits.filter(t => t.status === 'pending').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const depPlanned = savingsDeposits.filter(t => t.status === 'planned').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const depTotal = depCleared + depPending + depPlanned;

  anRow++;
  const savEffortRowNum = anRow;
  const savEffortRow = wsAnalysis.getRow(anRow++);
  savEffortRow.height = 20;
  savEffortRow.values = ['Versements vers l\'épargne (Alimentations)', depCleared, depPending, depPlanned, depTotal];
  savEffortRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  savEffortRow.getCell(2).numFmt = FMT_CURRENCY;
  savEffortRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
  savEffortRow.getCell(3).numFmt = FMT_CURRENCY;
  savEffortRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  savEffortRow.getCell(4).numFmt = FMT_CURRENCY;
  savEffortRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  savEffortRow.getCell(5).numFmt = FMT_CURRENCY;
  savEffortRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  savEffortRow.getCell(5).font = { bold: true };
  savEffortRow.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });

  // Tableau 3 : Récapitulatif global des sorties de trésorerie
  anRow += 2;
  wsAnalysis.getCell(`A${anRow}`).value = '3. CONSOLIDATION GLOBALE DES SORTIES DE TRÉSORERIE (DÉPENSES DU FOYER + ÉPARGNE)';
  wsAnalysis.getCell(`A${anRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  anRow++;
  wsAnalysis.getRow(anRow).values = ['Nature du décaissement', 'Débité / Effectué (€)', 'En attente (€)', 'Prévu (€)', 'Total (€)'];
  wsAnalysis.getRow(anRow).height = 24;
  wsAnalysis.getRow(anRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  anRow++;
  const rowConsolidationExpenses = anRow;
  const r1 = wsAnalysis.getRow(anRow++);
  r1.height = 20;
  r1.values = [
    '1. Dépenses du foyer (charges, vie courante, santé & crédits)',
    { formula: `B${totRealExpRowNum}` },
    { formula: `C${totRealExpRowNum}` },
    { formula: `D${totRealExpRowNum}` },
    { formula: `E${totRealExpRowNum}` }
  ];
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let c = 2; c <= 5; c++) {
    r1.getCell(c).numFmt = FMT_CURRENCY;
    r1.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  r1.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });

  const rowConsolidationSavings = anRow;
  const r2 = wsAnalysis.getRow(anRow++);
  r2.height = 20;
  r2.values = [
    '2. Versements placés sur l\'épargne (trésorerie épargnée)',
    { formula: `B${savEffortRowNum}` },
    { formula: `C${savEffortRowNum}` },
    { formula: `D${savEffortRowNum}` },
    { formula: `E${savEffortRowNum}` }
  ];
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let c = 2; c <= 5; c++) {
    r2.getCell(c).numFmt = FMT_CURRENCY;
    r2.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  r2.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });

  const grandTotalRow = wsAnalysis.getRow(anRow++);
  grandTotalRow.height = 24;
  grandTotalRow.values = [
    '3. TOTAL DES SORTIES DE TRÉSORERIE DU FOYER (1 + 2)',
    { formula: `B${rowConsolidationExpenses}+B${rowConsolidationSavings}` },
    { formula: `C${rowConsolidationExpenses}+C${rowConsolidationSavings}` },
    { formula: `D${rowConsolidationExpenses}+D${rowConsolidationSavings}` },
    { formula: `E${rowConsolidationExpenses}+E${rowConsolidationSavings}` }
  ];
  grandTotalRow.font = TOTAL_FONT;
  grandTotalRow.eachCell({ includeEmpty: true }, c => {
    c.fill = TOTAL_FILL;
    c.border = TOTAL_BORDER;
    c.numFmt = FMT_CURRENCY;
  });
  grandTotalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // =========================================================================
  // ONGLET 8 : Santé (Séparation stricte des Dépenses de santé et Remboursements)
  // Ne mélange jamais les remboursements avec les dépenses !
  // =========================================================================
  const wsHealth = workbook.addWorksheet('Santé');
  wsHealth.views = [{ state: 'frozen', ySplit: 2 }];

  wsHealth.mergeCells('A1:G1');
  const tHea = wsHealth.getCell('A1');
  tHea.value = 'SANTÉ — DÉPENSES MÉDICALES & REMBOURSEMENTS ASSOCIÉS';
  tHea.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tHea.fill = HEADER_FILL;
  tHea.alignment = { vertical: 'middle', horizontal: 'center' };
  wsHealth.getRow(1).height = 36;

  wsHealth.mergeCells('A2:G2');
  const sHea = wsHealth.getCell('A2');
  sHea.value = 'Distinction stricte entre les dépenses engagées et les remboursements perçus ou attendus (sécurité sociale / mutuelle)';
  sHea.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  sHea.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sHea.alignment = { vertical: 'middle', horizontal: 'center' };
  wsHealth.getRow(2).height = 20;

  // 1. Tableau A : Dépenses de santé
  let hRowIdx = 4;
  wsHealth.getCell(`A${hRowIdx}`).value = '1. DÉPENSES DE SOINS DE SANTÉ (SORTIES)';
  wsHealth.getCell(`A${hRowIdx}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  hRowIdx++;
  wsHealth.getRow(hRowIdx).values = [
    'Date du soin',
    'Mois',
    'Statut',
    'Libellé du soin',
    'Montant de la dépense (€)',
    'Compte débité',
    'Catégorie'
  ];
  wsHealth.getRow(hRowIdx).height = 24;
  wsHealth.getRow(hRowIdx).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  hRowIdx++;
  const firstExpHealthRow = hRowIdx;
  for (const t of txHealthExpenses) {
    const acc = accountMap.get(t.accountId);
    const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;
    const isDisabled = t.status === 'disabled';

    const row = wsHealth.getRow(hRowIdx++);
    row.values = [
      t.date || '',
      t.date ? t.date.slice(0, 7) : '',
      getTransactionStatusLabel(t.type, t.status),
      t.label || '',
      Number(t.amount) || 0,
      acc ? acc.name : '',
      cat ? cat.name : 'Santé'
    ];
    row.height = 20;

    if (isDisabled) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = DISABLED_FILL; c.font = DISABLED_FONT; });
    } else if (hRowIdx % 2 === 1) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });
    }

    row.getCell(1).numFmt = FMT_DATE;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).numFmt = FMT_MONTH;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }
  const lastExpHealthRow = hRowIdx - 1;

  if (txHealthExpenses.length > 0) {
    const totExpRow = wsHealth.getRow(hRowIdx++);
    totExpRow.height = 24;
    totExpRow.values = [
      'TOTAL DES DÉPENSES DE SANTÉ ACTIVES',
      '',
      '',
      '',
      { formula: `SUMIF(C${firstExpHealthRow}:C${lastExpHealthRow}, "<>Désactivé", E${firstExpHealthRow}:E${lastExpHealthRow})` },
      '',
      ''
    ];
    totExpRow.font = TOTAL_FONT;
    totExpRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totExpRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totExpRow.getCell(5).numFmt = FMT_CURRENCY;
    totExpRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // 2. Tableau B : Remboursements de santé
  hRowIdx += 2;
  wsHealth.getCell(`A${hRowIdx}`).value = '2. REMBOURSEMENTS DE SANTÉ PERÇUS OU ATTENDUS (ENTRÉES)';
  wsHealth.getCell(`A${hRowIdx}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  hRowIdx++;
  wsHealth.getRow(hRowIdx).values = [
    'Date versement',
    'Mois',
    'Statut',
    'Organisme verseur (Libellé)',
    'Montant remboursé (€)',
    'Compte crédité',
    'Notes / Soin associé'
  ];
  wsHealth.getRow(hRowIdx).height = 24;
  wsHealth.getRow(hRowIdx).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  hRowIdx++;
  const firstReimbHealthRow = hRowIdx;
  for (const t of txHealthReimbursements) {
    const acc = accountMap.get(t.accountId);
    const isDisabled = t.status === 'disabled';

    const row = wsHealth.getRow(hRowIdx++);
    row.values = [
      t.date || '',
      t.date ? t.date.slice(0, 7) : '',
      getTransactionStatusLabel(t.type, t.status),
      t.label || '',
      Number(t.amount) || 0,
      acc ? acc.name : '',
      t.notes || ''
    ];
    row.height = 20;

    if (isDisabled) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = DISABLED_FILL; c.font = DISABLED_FONT; });
    } else if (hRowIdx % 2 === 1) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });
    }

    row.getCell(1).numFmt = FMT_DATE;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).numFmt = FMT_MONTH;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }
  const lastReimbHealthRow = hRowIdx - 1;

  if (txHealthReimbursements.length > 0) {
    const totReimbRow = wsHealth.getRow(hRowIdx++);
    totReimbRow.height = 24;
    totReimbRow.values = [
      'TOTAL DES REMBOURSEMENTS ACTIFS',
      '',
      '',
      '',
      { formula: `SUMIF(C${firstReimbHealthRow}:C${lastReimbHealthRow}, "<>Désactivé", E${firstReimbHealthRow}:E${lastReimbHealthRow})` },
      '',
      ''
    ];
    totReimbRow.font = TOTAL_FONT;
    totReimbRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totReimbRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totReimbRow.getCell(5).numFmt = FMT_CURRENCY;
    totReimbRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // 3. Synthèse financière Santé & Reste à charge global
  const activeExpSum = txHealthExpenses.filter(t => t.status !== 'disabled').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const activeReimbSum = txHealthReimbursements.filter(t => t.status !== 'disabled').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const resteACharge = activeExpSum - activeReimbSum;

  hRowIdx += 2;
  wsHealth.getCell(`A${hRowIdx}`).value = '3. BILAN FINANCIER SANTÉ SUR LA PÉRIODE';
  wsHealth.getCell(`A${hRowIdx}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  hRowIdx++;
  wsHealth.getRow(hRowIdx).values = ['Indicateur santé', 'Montant (€)', 'Signification financière'];
  wsHealth.getRow(hRowIdx).height = 24;
  wsHealth.getRow(hRowIdx).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const healthBilanKPIs: Array<[string, number, string]> = [
    ['Total des dépenses de santé actives (Soins)', activeExpSum, 'Montant brut engagé pour les consultations et soins'],
    ['Total des remboursements actifs (Sécu / Mutuelle)', activeReimbSum, 'Indemnités perçues ou attendues'],
    ['Reste à charge net du foyer sur la période', resteACharge, 'Coût réel final à charge du budget familial (Dépenses - Remboursements)']
  ];

  hRowIdx++;
  for (const [kpiName, kpiVal, kpiDesc] of healthBilanKPIs) {
    const row = wsHealth.getRow(hRowIdx++);
    row.values = [kpiName, kpiVal, kpiDesc];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).numFmt = FMT_CURRENCY;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }

  // =========================================================================
  // ONGLET 9 : Crédits (Emprunts, amortissements et mensualités sans ID Prêt)
  // =========================================================================
  const wsLoans = workbook.addWorksheet('Crédits');
  wsLoans.columns = [
    { header: 'Nom du prêt', key: 'name' },
    { header: 'Établissement prêteur', key: 'lender' },
    { header: 'Type de prêt', key: 'loanTypeLabel' },
    { header: 'Statut du prêt', key: 'loanStatus' },
    { header: 'Capital initial emprunté (€)', key: 'initialAmount' },
    { header: 'Capital restant dû (€)', key: 'remainingCapital' },
    { header: 'Mensualité totale (€)', key: 'monthlyPayment' },
    { header: 'Taux annuel (%)', key: 'interestRate' },
    { header: 'Part assurance (€)', key: 'insurancePart' },
    { header: 'Mois début', key: 'startDate' },
    { header: 'Mois fin', key: 'endDate' },
    { header: 'Durée (mois)', key: 'durationMonths' },
    { header: 'Compte prélevé', key: 'accountName' },
    { header: 'Jour prélèvement', key: 'debitDay' },
    { header: 'Notes', key: 'notes' }
  ];

  let lIdx = 2;
  for (const l of loans) {
    const acc = accountMap.get(l.accountId);
    let rateRatio: number | null = null;
    if (l.interestRate !== undefined && l.interestRate !== null && !isNaN(Number(l.interestRate))) {
      rateRatio = Number(l.interestRate) / 100;
    }

    let loanStatusLabel = 'En cours';
    if (l.isArchived) {
      loanStatusLabel = 'Archivé';
    } else if (Number(l.remainingCapital) <= 0) {
      loanStatusLabel = 'Soldé';
    } else if (l.isPaused) {
      loanStatusLabel = 'Suspendu';
    }

    const row = wsLoans.addRow({
      name: l.name,
      lender: l.lender,
      loanTypeLabel: LOAN_TYPE_LABELS[l.loanType || 'consumer'] || l.loanType,
      loanStatus: loanStatusLabel,
      initialAmount: Number(l.initialAmount) || 0,
      remainingCapital: Number(l.remainingCapital) || 0,
      monthlyPayment: Number(l.monthlyPayment) || 0,
      interestRate: rateRatio,
      insurancePart: Number(l.insurancePart) || 0,
      startDate: l.startDate || '',
      endDate: l.endDate || '',
      durationMonths: l.durationMonths,
      accountName: acc ? acc.name : '',
      debitDay: l.debitDay ?? null,
      notes: l.notes || ''
    });
    row.height = 20;
    if (lIdx % 2 === 1) row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });

    row.getCell('name').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell('lender').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell('loanStatus').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('initialAmount').numFmt = FMT_CURRENCY;
    row.getCell('initialAmount').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('remainingCapital').numFmt = FMT_CURRENCY;
    row.getCell('remainingCapital').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('monthlyPayment').numFmt = FMT_CURRENCY;
    row.getCell('monthlyPayment').alignment = { horizontal: 'center', vertical: 'middle' };
    if (rateRatio !== null) {
      row.getCell('interestRate').numFmt = FMT_PERCENT;
      row.getCell('interestRate').alignment = { horizontal: 'center', vertical: 'middle' };
    }
    row.getCell('insurancePart').numFmt = FMT_CURRENCY;
    row.getCell('insurancePart').alignment = { horizontal: 'center', vertical: 'middle' };

    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
    lIdx++;
  }

  if (loans.length > 0) {
    const totRow = wsLoans.addRow({
      name: 'TOTAL DES CRÉDITS ENREGISTRÉS',
      lender: '',
      loanTypeLabel: '',
      loanStatus: '',
      initialAmount: { formula: `SUM(E2:E${lIdx - 1})` },
      remainingCapital: { formula: `SUM(F2:F${lIdx - 1})` },
      monthlyPayment: { formula: `SUM(G2:G${lIdx - 1})` },
      interestRate: null,
      insurancePart: { formula: `SUM(I2:I${lIdx - 1})` },
      startDate: '',
      endDate: '',
      durationMonths: null,
      accountName: '',
      debitDay: null,
      notes: ''
    });
    totRow.height = 24;
    totRow.font = TOTAL_FONT;
    totRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totRow.getCell('name').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totRow.getCell('initialAmount').numFmt = FMT_CURRENCY;
    totRow.getCell('initialAmount').alignment = { horizontal: 'center', vertical: 'middle' };
    totRow.getCell('remainingCapital').numFmt = FMT_CURRENCY;
    totRow.getCell('remainingCapital').alignment = { horizontal: 'center', vertical: 'middle' };
    totRow.getCell('monthlyPayment').numFmt = FMT_CURRENCY;
    totRow.getCell('monthlyPayment').alignment = { horizontal: 'center', vertical: 'middle' };
  }

  applyHeaderRowStyle(wsLoans, 1);
  const lFilterEndRow = lIdx > 2 ? lIdx - 1 : 1;
  wsLoans.autoFilter = { from: 'A1', to: `O${lFilterEndRow}` };

  // =========================================================================
  // ONGLET 10 : Épargne (Séparation stricte Versements vs Retraits)
  // Tableaux séparés pour les alimentations et les retraits vers le courant
  // =========================================================================
  const wsSavings = workbook.addWorksheet('Épargne');
  wsSavings.views = [{ state: 'frozen', ySplit: 2 }];

  // Titre
  wsSavings.mergeCells('A1:H1');
  const tSav = wsSavings.getCell('A1');
  tSav.value = 'ÉPARGNE & PATRIMOINE FINANCIER DU FOYER';
  tSav.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tSav.fill = HEADER_FILL;
  tSav.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSavings.getRow(1).height = 36;

  // 1. Tableau des comptes d'épargne avec soldes actuels et écarts
  wsSavings.getCell('A3').value = '1. LIVRETS, PLANS & SUPPORTS D\'ÉPARGNE (SITUATION ACTUELLE)';
  wsSavings.getCell('A3').font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  wsSavings.getRow(4).values = [
    'Nom du livret / compte',
    'Type / Support',
    'Statut',
    'Solde initial (€)',
    'Solde actuel (€)',
    'Taux annuel (%)',
    'Objectif cible (€)',
    'Écart solde / objectif (€)'
  ];
  wsSavings.getRow(4).height = 24;
  wsSavings.getRow(4).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const savingsAccounts = accounts.filter(a => a.type === 'savings');
  let savRow = 5;
  const firstSavRow = savRow;

  for (const sa of savingsAccounts) {
    const rateRatio = sa.interestRate !== undefined && sa.interestRate !== null ? Number(sa.interestRate) / 100 : null;
    const realBalance = calculateAccountRealBalance(sa, transactions);
    const targetAmt = sa.targetAmount !== undefined && sa.targetAmount !== null ? Number(sa.targetAmount) : null;
    const diff = targetAmt !== null ? realBalance - targetAmt : null;

    const row = wsSavings.getRow(savRow);
    row.values = [
      sa.name,
      ACCOUNT_SUBTYPE_LABELS[sa.subType || ''] || sa.subType || 'Épargne',
      sa.isClosed ? 'Clôturé' : 'Actif',
      Number(sa.initialBalance) || 0,
      realBalance,
      rateRatio,
      targetAmt,
      diff
    ];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).numFmt = FMT_CURRENCY;
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).font = { bold: true };
    if (rateRatio !== null) {
      row.getCell(6).numFmt = FMT_PERCENT;
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (targetAmt !== null) {
      row.getCell(7).numFmt = FMT_CURRENCY;
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    if (diff !== null) {
      row.getCell(8).numFmt = FMT_CURRENCY;
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
    savRow++;
  }
  const lastSavRow = savRow - 1;

  if (savingsAccounts.length > 0) {
    const totSavRow = wsSavings.getRow(savRow);
    totSavRow.height = 24;
    totSavRow.values = [
      'TOTAL DE L\'ÉPARGNE PLACÉE',
      '',
      '',
      { formula: `SUM(D${firstSavRow}:D${lastSavRow})` },
      { formula: `SUM(E${firstSavRow}:E${lastSavRow})` },
      null,
      { formula: `SUM(G${firstSavRow}:G${lastSavRow})` },
      { formula: `SUM(H${firstSavRow}:H${lastSavRow})` }
    ];
    totSavRow.font = TOTAL_FONT;
    totSavRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totSavRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totSavRow.getCell(4).numFmt = FMT_CURRENCY;
    totSavRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    totSavRow.getCell(5).numFmt = FMT_CURRENCY;
    totSavRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    totSavRow.getCell(7).numFmt = FMT_CURRENCY;
    totSavRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    totSavRow.getCell(8).numFmt = FMT_CURRENCY;
    totSavRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    savRow++;
  }

  // 2. Zone de synthèse complète des flux d'épargne sur la période
  const totalCurrentBalance = savingsAccounts.reduce((sum, sa) => sum + calculateAccountRealBalance(sa, transactions), 0);
  const totalTargets = savingsAccounts.reduce((sum, sa) => sum + (sa.targetAmount !== undefined && sa.targetAmount !== null ? Number(sa.targetAmount) : 0), 0);
  const globalGap = totalCurrentBalance - totalTargets;

  savRow += 2;
  wsSavings.getCell(`A${savRow}`).value = '2. SYNTHÈSE GLOBALE & FLUX D\'ÉPARGNE SUR LA PÉRIODE (HORS DÉSACTIVÉS)';
  wsSavings.getCell(`A${savRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  savRow++;
  wsSavings.getRow(savRow).values = ['Indicateur patrimonial & flux d\'épargne', 'Montant (€)', 'Description'];
  wsSavings.getRow(savRow).height = 24;
  wsSavings.getRow(savRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const savingsKPIs: Array<[string, number, string]> = [
    ['Total des soldes actuels des comptes d\'épargne', totalCurrentBalance, 'Situation réelle consolidée à date'],
    ['Total des objectifs d\'épargne renseignés', totalTargets, 'Somme des cibles patrimoniales définies'],
    ['Écart entre total des soldes actuels et objectifs', globalGap, 'Avance (+) ou effort restant (-) sur les objectifs'],
    ['Total des versements / alimentations d\'épargne', totalSavingsDeposits, 'Flux entrants depuis le compte courant vers les livrets sur la période'],
    ['Total des retraits d\'épargne', totalSavingsWithdrawals, 'Flux sortants depuis les livrets vers le compte courant sur la période'],
    ['Solde net des flux d\'épargne sur la période', netSavingsFlow, 'Effort net d\'épargne réalisé sur la période (Versements - Retraits)']
  ];

  savRow++;
  for (const [kpiName, kpiVal, kpiDesc] of savingsKPIs) {
    const row = wsSavings.getRow(savRow++);
    row.values = [kpiName, kpiVal, kpiDesc];
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(2).numFmt = FMT_CURRENCY;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }

  // 3. Tableau A : Versements vers l'épargne (Compte courant -> Comptes d'épargne)
  savRow += 2;
  wsSavings.getCell(`A${savRow}`).value = '3. VERSEMENTS VERS L\'ÉPARGNE (ALIMENTATIONS)';
  wsSavings.getCell(`A${savRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  savRow++;
  wsSavings.getRow(savRow).values = [
    'Date',
    'Mois',
    'Statut',
    'Libellé de l\'opération',
    'Montant (€)',
    'Compte débité (Courant)',
    'Compte crédité (Épargne)',
    'Notes'
  ];
  wsSavings.getRow(savRow).height = 24;
  wsSavings.getRow(savRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  savRow++;
  const firstDepRow = savRow;
  for (const t of savingsDeposits) {
    const srcAcc = accountMap.get(t.accountId);
    const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : null;
    const isDisabled = t.status === 'disabled';

    const row = wsSavings.getRow(savRow++);
    row.values = [
      t.date || '',
      t.date ? t.date.slice(0, 7) : '',
      getTransactionStatusLabel(t.type, t.status),
      t.label || '',
      Math.abs(Number(t.amount) || 0),
      srcAcc ? srcAcc.name : '',
      destAcc ? destAcc.name : '',
      t.notes || ''
    ];
    row.height = 20;

    if (isDisabled) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = DISABLED_FILL; c.font = DISABLED_FONT; });
    } else if (savRow % 2 === 1) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });
    }

    row.getCell(1).numFmt = FMT_DATE;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).numFmt = FMT_MONTH;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }
  const lastDepRow = savRow - 1;

  if (savingsDeposits.length > 0) {
    const totDepRow = wsSavings.getRow(savRow++);
    totDepRow.height = 24;
    totDepRow.values = [
      'TOTAL DES VERSEMENTS VERS L\'ÉPARGNE ACTIFS',
      '',
      '',
      '',
      { formula: `SUMIF(C${firstDepRow}:C${lastDepRow}, "<>Annulé", E${firstDepRow}:E${lastDepRow})` },
      '',
      '',
      ''
    ];
    totDepRow.font = TOTAL_FONT;
    totDepRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totDepRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totDepRow.getCell(5).numFmt = FMT_CURRENCY;
    totDepRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // 4. Tableau B : Retraits depuis l'épargne (Comptes d'épargne -> Compte courant)
  savRow += 2;
  wsSavings.getCell(`A${savRow}`).value = '4. RETRAITS DEPUIS L\'ÉPARGNE (VERS LE COMPTE COURANT)';
  wsSavings.getCell(`A${savRow}`).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLOR_PRIMARY } };

  savRow++;
  wsSavings.getRow(savRow).values = [
    'Date',
    'Mois',
    'Statut',
    'Libellé de l\'opération',
    'Montant (€)',
    'Compte débité (Épargne)',
    'Compte crédité (Courant)',
    'Notes'
  ];
  wsSavings.getRow(savRow).height = 24;
  wsSavings.getRow(savRow).eachCell({ includeEmpty: false }, c => {
    c.fill = HEADER_FILL;
    c.font = HEADER_FONT;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  savRow++;
  const firstWithRow = savRow;
  for (const t of savingsWithdrawals) {
    const srcAcc = accountMap.get(t.accountId);
    const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : null;
    const isDisabled = t.status === 'disabled';

    const row = wsSavings.getRow(savRow++);
    row.values = [
      t.date || '',
      t.date ? t.date.slice(0, 7) : '',
      getTransactionStatusLabel(t.type, t.status),
      t.label || '',
      Math.abs(Number(t.amount) || 0),
      srcAcc ? srcAcc.name : '',
      destAcc ? destAcc.name : '',
      t.notes || ''
    ];
    row.height = 20;

    if (isDisabled) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = DISABLED_FILL; c.font = DISABLED_FONT; });
    } else if (savRow % 2 === 1) {
      row.eachCell({ includeEmpty: true }, c => { c.fill = ZEBRA_FILL; });
    }

    row.getCell(1).numFmt = FMT_DATE;
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).numFmt = FMT_MONTH;
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(5).numFmt = FMT_CURRENCY;
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; });
  }
  const lastWithRow = savRow - 1;

  if (savingsWithdrawals.length > 0) {
    const totWithRow = wsSavings.getRow(savRow++);
    totWithRow.height = 24;
    totWithRow.values = [
      'TOTAL DES RETRAITS DEPUIS L\'ÉPARGNE ACTIFS',
      '',
      '',
      '',
      { formula: `SUMIF(C${firstWithRow}:C${lastWithRow}, "<>Annulé", E${firstWithRow}:E${lastWithRow})` },
      '',
      '',
      ''
    ];
    totWithRow.font = TOTAL_FONT;
    totWithRow.eachCell({ includeEmpty: true }, c => {
      c.fill = TOTAL_FILL;
      c.border = TOTAL_BORDER;
    });
    totWithRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    totWithRow.getCell(5).numFmt = FMT_CURRENCY;
    totWithRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // =========================================================================
  // ONGLET 11 : Analyses croisées (Section Rentrées vs Section Dépenses & Sorties)
  // Ventilation méthodique sans défilement horizontal et exclusion des disabled
  // =========================================================================
  const wsCross = workbook.addWorksheet('Analyses croisées');
  wsCross.views = [{ state: 'frozen', ySplit: 2 }];

  wsCross.mergeCells('A1:F1');
  const tCross = wsCross.getCell('A1');
  tCross.value = 'BUDGET PERSO PRO — ANALYSES CROISÉES & SYNTHÈSES TRANSVERSALES';
  tCross.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tCross.fill = HEADER_FILL;
  tCross.alignment = { vertical: 'middle', horizontal: 'center' };
  wsCross.getRow(1).height = 36;

  wsCross.mergeCells('A2:F2');
  const sCross = wsCross.getCell('A2');
  sCross.value = 'Rentrées de trésorerie (revenus, remboursements, retraits d\'épargne) vs Sorties (dépenses réelles et alimentation de l\'épargne)';
  sCross.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  sCross.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sCross.alignment = { vertical: 'middle', horizontal: 'center' };
  wsCross.getRow(2).height = 20;

  let crossCurrentRow = 4;

  // Helper pour agréger les opérations actives par catégorie
  const buildActiveCatRows = (txs: any[], allowedStatuses: string[]) => {
    const catMap = new Map<string, { label: string; values: number[]; total: number }>();
    for (const t of txs) {
      if (t.status === 'disabled') continue; // Exclut rigoureusement les disabled
      const cId = t.categoryId || 'none';
      const cName = t.categoryId ? (categoryMap.get(t.categoryId)?.name || 'Catégorie inconnue') : 'Sans catégorie';
      if (!catMap.has(cId)) {
        catMap.set(cId, { label: cName, values: allowedStatuses.map(() => 0), total: 0 });
      }
      const entry = catMap.get(cId)!;
      const sIdx = allowedStatuses.indexOf(t.status);
      const amt = Number(t.amount) || 0;
      if (sIdx >= 0) {
        entry.values[sIdx] += amt;
      }
      entry.total += amt;
    }
    return Array.from(catMap.values()).sort((a, b) => b.total - a.total);
  };

  // -------------------------------------------------------------------------
  // PARTIE A : RENTRÉES DE TRÉSORERIE (ENTRÉES D'ARGENT)
  // -------------------------------------------------------------------------
  const sumStatus = (txs: any[], st: string) => txs.filter(t => t.status === st).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const sumAbsStatus = (txs: any[], st: string) => txs.filter(t => t.status === st).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  const activeIncomes = txIncome.filter(t => t.status !== 'disabled');
  const activeReimbs = txHealthReimbursements.filter(t => t.status !== 'disabled');
  const activeWithdrawals = savingsWithdrawals.filter(t => t.status !== 'disabled');

  const cashInRows = [
    {
      label: 'Revenus habituels du foyer (Salaires, aides, recettes)',
      values: [sumStatus(activeIncomes, 'cleared'), sumStatus(activeIncomes, 'pending'), sumStatus(activeIncomes, 'planned')],
      total: activeIncomes.reduce((s, t) => s + (Number(t.amount) || 0), 0)
    },
    {
      label: 'Remboursements de santé perçus (Sécu, mutuelle)',
      values: [sumStatus(activeReimbs, 'cleared'), sumStatus(activeReimbs, 'pending'), sumStatus(activeReimbs, 'planned')],
      total: activeReimbs.reduce((s, t) => s + (Number(t.amount) || 0), 0)
    },
    {
      label: 'Retraits de l\'épargne vers le compte courant (Trésorerie rapatriée)',
      values: [sumAbsStatus(activeWithdrawals, 'cleared'), sumAbsStatus(activeWithdrawals, 'pending'), sumAbsStatus(activeWithdrawals, 'planned')],
      total: activeWithdrawals.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
    }
  ];

  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    'A. SYNTHÈSE GLOBALE DES RENTRÉES D\'ARGENT ET DE TRÉSORERIE (HORS DÉSACTIVÉS)',
    ['Origine du flux entrant', 'Encaissé / Effectué (€)', 'En attente (€)', 'Prévu (€)', 'Total flux (€)'],
    cashInRows,
    'TOTAL DES RENTRÉES DE TRÉSORERIE'
  );

  // Ventilation des Revenus par Catégorie
  const incomeCatRows = buildActiveCatRows(txIncome, ['cleared', 'pending', 'planned']);
  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    '1. DÉTAIL DES REVENUS PAR CATÉGORIE & STATUT (HORS DÉSACTIVÉS)',
    ['Catégorie de revenu', 'Encaissé (€)', 'En attente (€)', 'Prévu (€)', 'Total Catégorie (€)'],
    incomeCatRows,
    'SOUS-TOTAL REVENUS'
  );

  // -------------------------------------------------------------------------
  // PARTIE B : SORTIES D'ARGENT ET DÉPENSES DU FOYER
  // -------------------------------------------------------------------------
  const activeFixed = txFixed.filter(t => t.status !== 'disabled');
  const activeVar = txVariable.filter(t => t.status !== 'disabled');
  const activeDaily = txDaily.filter(t => t.status !== 'disabled');
  const activeHealth = txHealthExpenses.filter(t => t.status !== 'disabled');
  const activeDeposits = savingsDeposits.filter(t => t.status !== 'disabled');

  const cashOutSummaryRows = [
    {
      label: 'Charges fixes actives (Loyers, abonnements)',
      values: [sumStatus(activeFixed, 'cleared'), sumStatus(activeFixed, 'pending'), sumStatus(activeFixed, 'planned')],
      total: sumActive(activeFixed)
    },
    {
      label: 'Charges variables actives (Factures énergies, eau)',
      values: [sumStatus(activeVar, 'cleared'), sumStatus(activeVar, 'pending'), sumStatus(activeVar, 'planned')],
      total: sumActive(activeVar)
    },
    {
      label: 'Dépenses courantes actives (Vie quotidienne, courses)',
      values: [sumStatus(activeDaily, 'cleared'), sumStatus(activeDaily, 'pending'), sumStatus(activeDaily, 'planned')],
      total: sumActive(activeDaily)
    },
    {
      label: 'Dépenses de santé actives (Soins médicaux engagés)',
      values: [sumStatus(activeHealth, 'cleared'), sumStatus(activeHealth, 'pending'), sumStatus(activeHealth, 'planned')],
      total: sumActive(activeHealth)
    },
    {
      label: 'Mensualités de crédits actives (Emprunts)',
      values: [loanCleared, loanPending, loanPlanned],
      total: loanTotalEffective
    },
    {
      label: 'Transferts vers l\'épargne (Alimentation des livrets)',
      values: [sumAbsStatus(activeDeposits, 'cleared'), sumAbsStatus(activeDeposits, 'pending'), sumAbsStatus(activeDeposits, 'planned')],
      total: totalSavingsDeposits
    }
  ];

  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    'B. SYNTHÈSE GLOBALE DES SORTIES DE TRÉSORERIE (DÉPENSES DU FOYER + ÉPARGNE)',
    ['Poste de sortie', 'Débité / Effectué (€)', 'En attente (€)', 'Prévu (€)', 'Total engagé (€)'],
    cashOutSummaryRows,
    'TOTAL DES SORTIES DE TRÉSORERIE'
  );

  // Ventilation des Crédits par Prêt / Part de capital si connue
  const loanSummaryByLoan = loans.map(l => {
    const pmt = txLoanPayments.filter(t => t.linkedId === l.id && t.status !== 'disabled');
    let clr = pmt.filter(t => t.status === 'cleared').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    let pnd = pmt.filter(t => t.status === 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    let pln = pmt.filter(t => t.status === 'planned').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    
    // Si aucune transaction explicite n'a été saisie pour ce prêt actif, imputer sa mensualité théorique en 'Prévu'
    if (pmt.length === 0 && !l.isArchived && !l.isPaused) {
      pln = Number(l.monthlyPayment) || 0;
    }

    return {
      label: `${l.name} (${l.lender})`,
      values: [clr, pnd, pln],
      total: clr + pnd + pln
    };
  }).filter(item => item.total > 0);

  if (loanSummaryByLoan.length > 0) {
    crossCurrentRow = renderCrossAnalysisSection(
      wsCross,
      crossCurrentRow,
      '2. VENTILATION DES MENSUALITÉS DE CRÉDITS PAR EMPRUNT (HORS DÉSACTIVÉS)',
      ['Emprunt', 'Débité (€)', 'En attente (€)', 'Prévu (€)', 'Total mensualités (€)'],
      loanSummaryByLoan,
      'SOUS-TOTAL CRÉDITS'
    );
  }

  // Ventilation des Charges Fixes par Catégorie
  const fixedCatRows = buildActiveCatRows(txFixed, ['cleared', 'pending', 'planned']);
  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    '3. RÉPARTITION DES CHARGES FIXES PAR CATÉGORIE & STATUT (HORS DÉSACTIVÉS)',
    ['Catégorie de charge fixe', 'Débité (€)', 'En attente (€)', 'Prévu (€)', 'Total Catégorie (€)'],
    fixedCatRows,
    'SOUS-TOTAL CHARGES FIXES'
  );

  // Ventilation des Charges Variables par Catégorie
  const variableCatRows = buildActiveCatRows(txVariable, ['cleared', 'pending', 'planned']);
  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    '4. RÉPARTITION DES CHARGES VARIABLES PAR CATÉGORIE & STATUT (HORS DÉSACTIVÉS)',
    ['Catégorie de charge variable', 'Débité (€)', 'En attente (€)', 'Prévu (€)', 'Total Catégorie (€)'],
    variableCatRows,
    'SOUS-TOTAL CHARGES VARIABLES'
  );

  // Ventilation des Dépenses Courantes par Catégorie
  const dailyCatRows = buildActiveCatRows(txDaily, ['cleared', 'pending', 'planned']);
  crossCurrentRow = renderCrossAnalysisSection(
    wsCross,
    crossCurrentRow,
    '5. RÉPARTITION DES DÉPENSES COURANTES PAR CATÉGORIE & STATUT (HORS DÉSACTIVÉS)',
    ['Catégorie de dépense courante', 'Débité (€)', 'En attente (€)', 'Prévu (€)', 'Total Catégorie (€)'],
    dailyCatRows,
    'SOUS-TOTAL DÉPENSES COURANTES'
  );

  // =========================================================================
  // FINALISATION : CENTRAGE ABSOLU DE TOUTES LES CELLULES & AJUSTEMENT COLONNES
  // =========================================================================
  workbook.worksheets.forEach((ws) => {
    applyUniversalCentering(ws);
    autoFitAllColumns(ws);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
