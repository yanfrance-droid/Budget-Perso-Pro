import type { Transaction, Loan, RecurrenceTemplate } from '../db/database';
import { roundCurrency, estimateLoanPayoffClient, getTransactionImpact } from './calculations';

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'success';

export type InsightCategory = 
  | 'crash_test' 
  | 'idle_cash' 
  | 'daily_cadence' 
  | 'emergency_fund' 
  | 'stalled_health' 
  | 'loan_prepayment'
  | 'consumer_debt_vulnerability'
  | 'loan_freedom_countdown'
  | 'upcoming_loan_tiers'
  | 'commitment_deadline'
  | 'contract_expiration';

export interface FinancialInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  actionTarget?: string;
  metadata?: Record<string, any>;
}

export interface ChargesBaselineInput {
  fixed?: number;
  variable?: number;
  loan?: number;
  daily?: number;
  health?: number;
  transfer?: number;
}

export interface InsightsContext {
  currentDate: string; // YYYY-MM-DD
  manualBalance: number;
  soldePrevisionnel: number;
  seuilFondRoulement?: number;
  pendingTransactions: Transaction[];
  currentDailyTotal?: number;
  average3MonthsDaily?: number;
  daysElapsed?: number;
  daysInMonth?: number;
  liquidSavingsTotal: number;
  totalObligatoires?: number;
  chargesBreakdown?: ChargesBaselineInput;
  healthExpenses?: Transaction[];
  healthReimbursements?: Transaction[];
  healthDaysThreshold?: number;
  loans?: Loan[];
  loanPayments?: Transaction[];
  loanPaymentHistory?: { loanId: string; effectiveMonth: string; monthlyPayment: number; previousPayment?: number | null; notes?: string | null }[];
  incomesPlanned?: number;
  templates?: RecurrenceTemplate[];
}

const SEVERITY_WEIGHTS: Record<InsightSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1
};

export function formatCurrencyFr(val: number): string {
  const rounded = roundCurrency(val);
  return `${rounded.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * 1. SENTINELLE CRASH-TEST / ANTI-DÉCOUVERT (Solde Réel projeté jour par jour)
 * Simule l'évolution quotidienne du solde bancaire réel à partir de J jusqu'au prochain revenu majeur
 * ou la fin du mois, pour détecter les creux de trésorerie avant les échéances incompressibles.
 */
export function auditCrashTest(
  manualBalance: number,
  pendingTransactions: Transaction[],
  currentDate: string
): FinancialInsight | null {
  const currentBal = roundCurrency(manualBalance);
  
  // Filtrer les opérations non pointées à venir à partir de currentDate
  const upcomingTx = pendingTransactions
    .filter(t => t.status !== 'disabled' && (t.status === 'pending' || t.status === 'planned') && t.date >= currentDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (upcomingTx.length === 0) {
    if (currentBal < 0) {
      return {
        id: 'crash_test_already_negative',
        category: 'crash_test',
        severity: 'critical',
        title: 'Compte bancaire actuellement à découvert',
        message: `Votre solde bancaire réel actuel est négatif (${formatCurrencyFr(currentBal)}). Aucune opération en attente n'est enregistrée pour régulariser la situation.`,
        actionLabel: 'Voir le Dashboard',
        actionTarget: '/',
        metadata: { currentBalance: currentBal, minBalance: currentBal, minDate: currentDate }
      };
    }
    return null;
  }

  // Détection du prochain revenu significatif (ex: salaire >= 300 €)
  const nextMajorIncome = upcomingTx.find(t => t.type === 'income' && (Number(t.amount) || 0) >= 300);
  const cutoffDate = nextMajorIncome ? nextMajorIncome.date : upcomingTx[upcomingTx.length - 1].date;

  // Regrouper par date
  const dateMap = new Map<string, Transaction[]>();
  upcomingTx.forEach(t => {
    if (t.date <= cutoffDate) {
      const arr = dateMap.get(t.date) || [];
      arr.push(t);
      dateMap.set(t.date, arr);
    }
  });

  const sortedDates = Array.from(dateMap.keys()).sort();
  let runningBalance = currentBal;
  let minBalance = currentBal;
  let minDate = currentDate;

  for (const date of sortedDates) {
    const txsOnDate = dateMap.get(date)!;
    
    // Si c'est la date du revenu majeur, on évalue d'abord les débits du jour AVANT le crédit
    if (nextMajorIncome && date === nextMajorIncome.date) {
      const debitsBeforeIncome = txsOnDate.filter(t => t.id !== nextMajorIncome.id);
      for (const t of debitsBeforeIncome) {
        runningBalance = roundCurrency(runningBalance + getTransactionImpact(t));
      }
      if (runningBalance < minBalance) {
        minBalance = runningBalance;
        minDate = date;
      }
      // Puis on applique le revenu
      runningBalance = roundCurrency(runningBalance + getTransactionImpact(nextMajorIncome));
      if (runningBalance < minBalance) {
        minBalance = runningBalance;
        minDate = date;
      }
    } else {
      for (const t of txsOnDate) {
        runningBalance = roundCurrency(runningBalance + getTransactionImpact(t));
      }
      if (runningBalance < minBalance) {
        minBalance = runningBalance;
        minDate = date;
      }
    }
  }

  if (minBalance < 0) {
    const nextIncomeInfo = nextMajorIncome 
      ? ` avant versement de ${formatCurrencyFr(nextMajorIncome.amount)} le ${nextMajorIncome.date}` 
      : '';
    return {
      id: 'crash_test_overdraft_risk',
      category: 'crash_test',
      severity: 'critical',
      title: 'Alerte Crash-Test : Risque de découvert bancaire',
      message: `Un creux de trésorerie à ${formatCurrencyFr(minBalance)} est projeté le ${minDate}${nextIncomeInfo}. Différez vos dépenses non urgentes ou effectuez un virement d'appoint depuis votre épargne.`,
      actionLabel: 'Voir la situation bancaire',
      actionTarget: '/',
      metadata: { minBalance, minDate, nextMajorIncomeDate: nextMajorIncome?.date }
    };
  }

  if (minBalance < 100 && currentBal >= 100) {
    return {
      id: 'crash_test_tight_cash',
      category: 'crash_test',
      severity: 'warning',
      title: 'Tension de trésorerie imminente',
      message: `Votre solde réel va descendre à ${formatCurrencyFr(minBalance)} le ${minDate} sous l'effet des prélèvements prévus. La marge de sécurité est faible.`,
      actionLabel: 'Consulter l\'échéancier',
      actionTarget: '/',
      metadata: { minBalance, minDate }
    };
  }

  return null;
}

/**
 * 2. SENTINELLE CASH DORMANT / OPTIMISATION TRÉSORERIE (Solde Prévisionnel net)
 * Évalue la trésorerie disponible EXCLUSIVEMENT sur la base du solde prévisionnel net
 * de fin de mois (pour éviter le piège du gros solde réel temporaire de début de mois).
 */
export function auditIdleCash(
  soldePrevisionnel: number,
  seuilFondRoulement = 500
): FinancialInsight | null {
  const roundedPrevisionnel = roundCurrency(soldePrevisionnel);
  const roundedSeuil = roundCurrency(seuilFondRoulement);
  const availableToSave = roundCurrency(roundedPrevisionnel - roundedSeuil);

  if (availableToSave >= 50) {
    return {
      id: 'idle_cash_opportunity',
      category: 'idle_cash',
      severity: 'info',
      title: 'Opportunité d\'optimisation de trésorerie',
      message: `Votre solde prévisionnel net de fin de mois dégage un excédent garanti de ${formatCurrencyFr(availableToSave)} au-delà de votre fond de roulement de sécurité (${formatCurrencyFr(roundedSeuil)}). Vous pouvez placer cette somme sur vos livrets rémunérés sans aucun risque pour vos charges du mois.`,
      actionLabel: 'Effectuer un virement vers l\'épargne',
      actionTarget: '/epargne',
      metadata: { soldePrevisionnel: roundedPrevisionnel, seuilFondRoulement: roundedSeuil, availableToSave }
    };
  }

  return null;
}

/**
 * 3. SENTINELLE CADENCE DES DÉPENSES COURANTES (Rubrique "Dépenses")
 * Détecte les dérives de rythme sur les dépenses d'alimentation et du quotidien,
 * et calcule le rythme journalier soutenable jusqu'au dernier jour du mois.
 */
export function auditDailyExpenseCadence(
  currentDailyTotal?: number,
  average3Months?: number,
  daysElapsed?: number,
  daysInMonth?: number
): FinancialInsight | null {
  if (
    currentDailyTotal === undefined || 
    average3Months === undefined || 
    daysElapsed === undefined || 
    daysInMonth === undefined ||
    average3Months <= 0 ||
    daysInMonth <= 0 ||
    daysElapsed <= 0
  ) {
    return null;
  }

  const currentTotal = roundCurrency(currentDailyTotal);
  const avg = roundCurrency(average3Months);
  const elapsed = Math.min(daysElapsed, daysInMonth);
  const daysRemaining = Math.max(0, daysInMonth - elapsed);
  
  const timeProgress = elapsed / daysInMonth;
  const budgetConsumption = currentTotal / avg;
  const remainingBudget = roundCurrency(Math.max(0, avg - currentTotal));
  const recommendedDailyRate = daysRemaining > 0 ? roundCurrency(remainingBudget / daysRemaining) : 0;
  const currentDailyRate = elapsed > 0 ? roundCurrency(currentTotal / elapsed) : 0;

  // Cas 1 : Budget moyen 3 mois déjà dépassé avant la fin du mois
  if (budgetConsumption > 1.05) {
    const overrunPercent = Math.round((budgetConsumption - 1) * 100);
    return {
      id: 'daily_cadence_overrun',
      category: 'daily_cadence',
      severity: 'warning',
      title: 'Budget dépenses courantes dépassé',
      message: `Vous avez consommé ${formatCurrencyFr(currentTotal)} pour une moyenne habituelle de ${formatCurrencyFr(avg)} (+${overrunPercent} %). Il reste ${daysRemaining} jour(s) ce mois-ci. Modérez vos achats quotidiens pour limiter l'impact sur l'atterrissage.`,
      actionLabel: 'Analyser les dépenses courantes',
      actionTarget: '/depenses-courantes',
      metadata: { currentTotal, average3Months: avg, budgetConsumption, daysRemaining, recommendedDailyRate }
    };
  }

  // Cas 2 : Sur-cadence à mi-parcours (ex: à partir du 5ème jour, consommation > 120 % de l'avancement temporel)
  if (elapsed >= 5 && budgetConsumption > timeProgress * 1.25) {
    const pacePercent = Math.round(budgetConsumption * 100);
    const timePercent = Math.round(timeProgress * 100);
    return {
      id: 'daily_cadence_drift',
      category: 'daily_cadence',
      severity: 'warning',
      title: 'Sur-cadence sur les dépenses quotidiennes',
      message: `À ce jour (${elapsed}/${daysInMonth} jours, ${timePercent} % du mois), vous avez consommé ${pacePercent} % de votre budget moyen (${formatCurrencyFr(currentTotal)} sur ${formatCurrencyFr(avg)}). Rythme soutenable conseillé : ${formatCurrencyFr(recommendedDailyRate)} / jour jusqu'au ${daysInMonth}.`,
      actionLabel: 'Voir le détail des dépenses',
      actionTarget: '/depenses-courantes',
      metadata: { currentTotal, average3Months: avg, currentDailyRate, recommendedDailyRate, daysRemaining }
    };
  }

  // Cas 3 : Cadence exemplaire bien maîtrisée (après au moins 10 jours)
  if (elapsed >= 10 && budgetConsumption <= timeProgress * 0.85 && currentTotal > 0) {
    return {
      id: 'daily_cadence_mastered',
      category: 'daily_cadence',
      severity: 'success',
      title: 'Cadence des dépenses bien maîtrisée',
      message: `Excellente maîtrise : vous avez consommé seulement ${Math.round(budgetConsumption * 100)} % de votre enveloppe quotidienne pour ${Math.round(timeProgress * 100)} % du mois écoulé. Vous disposez de ${formatCurrencyFr(recommendedDailyRate)} / jour jusqu'à la fin du mois.`,
      actionLabel: 'Voir le récapitulatif',
      actionTarget: '/depenses-courantes',
      metadata: { currentTotal, average3Months: avg, recommendedDailyRate, daysRemaining }
    };
  }

  return null;
}

/**
 * Calcule l'assiette mensuelle des charges incompressibles pour le matelas de sécurité / précaution.
 *
 * RÈGLE D'OR : Exclut formellement et strictement les flux d'épargne volontaire (virements vers livrets/épargne)
 * afin d'éliminer la boucle infinie (« le serpent qui se mord la queue » : plus l'utilisateur épargne,
 * plus les charges obligatoires augmenteraient et plus le moteur exigerait d'épargne de sécurité).
 *
 * L'assiette repose EXCLUSIVEMENT sur les dépenses contraintes et de fonctionnement pures :
 * - Charges fixes (loyer, assurances, factures régulières, abonnements)
 * - Charges variables de subsistance et fonctionnement (énergie, carburant, etc.)
 * - Échéances de crédits / emprunts
 */
export function calculateEmergencyFundBaseline(charges: ChargesBaselineInput): number {
  return roundCurrency(
    (Number(charges.fixed) || 0) +
    (Number(charges.variable) || 0) +
    (Number(charges.loan) || 0)
  );
}

/**
 * 4. SENTINELLE MATELAS DE PRÉCAUTION (Socle des charges incompressibles)
 * Calcule l'autonomie financière liquide sur la base stricte des charges incompressibles du foyer,
 * sans inventer de revenu théorique et en excluant rigoureusement tout flux d'épargne volontaire.
 */
export function auditEmergencyFund(
  liquidSavingsTotal: number,
  totalObligatoiresOrCharges: number | ChargesBaselineInput
): FinancialInsight | null {
  const liquid = roundCurrency(liquidSavingsTotal);
  const obligations = typeof totalObligatoiresOrCharges === 'number'
    ? roundCurrency(totalObligatoiresOrCharges)
    : calculateEmergencyFundBaseline(totalObligatoiresOrCharges);

  if (obligations <= 0) {
    return null;
  }

  const rawRatio = liquid / obligations;
  const monthsCovered = Math.round(rawRatio * 10) / 10;

  if (monthsCovered < 1) {
    return {
      id: 'emergency_fund_critical',
      category: 'emergency_fund',
      severity: 'critical',
      title: 'Matelas de précaution critique (< 1 mois)',
      message: `Votre épargne liquide disponible (${formatCurrencyFr(liquid)}) couvre seulement ${monthsCovered} mois de charges incompressibles (${formatCurrencyFr(obligations)}/mois). En cas d'imprévu majeur, votre trésorerie serait immédiatement en péril.`,
      actionLabel: 'Renforcer l\'épargne',
      actionTarget: '/epargne',
      metadata: { liquidSavingsTotal: liquid, totalObligatoires: obligations, monthsCovered }
    };
  }

  if (monthsCovered < 3) {
    return {
      id: 'emergency_fund_warning',
      category: 'emergency_fund',
      severity: 'warning',
      title: 'Matelas de précaution partiel (1 à 3 mois)',
      message: `Votre épargne liquide couvre ${monthsCovered} mois de charges incompressibles (${formatCurrencyFr(liquid)}). La recommandation standard de sécurité sereine est de 3 à 6 mois (${formatCurrencyFr(obligations * 3)} à ${formatCurrencyFr(obligations * 6)}).`,
      actionLabel: 'Voir les livrets d\'épargne',
      actionTarget: '/epargne',
      metadata: { liquidSavingsTotal: liquid, totalObligatoires: obligations, monthsCovered }
    };
  }

  if (monthsCovered <= 6) {
    return {
      id: 'emergency_fund_optimal',
      category: 'emergency_fund',
      severity: 'success',
      title: 'Matelas de précaution optimal (3 à 6 mois)',
      message: `Excellente gestion financière : vous disposez de ${monthsCovered} mois de charges incompressibles sécurisées en épargne liquide (${formatCurrencyFr(liquid)}). Votre foyer est protégé contre les aléas majeurs.`,
      actionLabel: 'Consulter l\'épargne',
      actionTarget: '/epargne',
      metadata: { liquidSavingsTotal: liquid, totalObligatoires: obligations, monthsCovered }
    };
  }

  // Plus de 6 mois de charges incompressibles sur des livrets
  return {
    id: 'emergency_fund_surplus',
    category: 'emergency_fund',
    severity: 'info',
    title: 'Sur-épargne liquide disponible (> 6 mois)',
    message: `Votre épargne liquide couvre ${monthsCovered} mois de charges incompressibles (${formatCurrencyFr(liquid)}). Au-delà de 6 mois, l'excédent subit l'érosion de l'inflation sur les livrets et peut être orienté vers des placements plus rémunérateurs ou un désendettement accéléré.`,
    actionLabel: 'Gérer les transferts d\'épargne',
    actionTarget: '/epargne',
    metadata: { liquidSavingsTotal: liquid, totalObligatoires: obligations, monthsCovered }
  };
}

/**
 * 5. SENTINELLE SOINS ET REMBOURSEMENTS DE SANTÉ (Créances en souffrance)
 * Détecte les soins médicaux débités non intégralement remboursés après un délai
 * anormalement long (par défaut > 35 jours).
 */
export function auditStalledHealth(
  healthExpenses: Transaction[],
  currentDate: string,
  daysThreshold = 35,
  reimbursements?: Transaction[]
): FinancialInsight | null {
  const currentTs = new Date(currentDate).getTime();
  if (isNaN(currentTs)) return null;

  // Extraction des dépenses de soins et des remboursements
  const expenses = healthExpenses.filter(t => t.type === 'health_expense' && t.status === 'cleared');
  const allReimbs = reimbursements || healthExpenses.filter(t => t.type === 'health_reimbursement');

  let stalledCount = 0;
  let stalledTotal = 0;
  let oldestDays = 0;

  for (const exp of expenses) {
    const expDateTs = new Date(exp.date).getTime();
    if (isNaN(expDateTs)) continue;

    const diffDays = Math.floor((currentTs - expDateTs) / (1000 * 60 * 60 * 24));
    if (diffDays <= daysThreshold) continue;

    const matchingClearedReimbs = allReimbs.filter(r => r.linkedId === exp.id && r.status === 'cleared');
    const totalReimbursed = matchingClearedReimbs.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const expAmount = Number(exp.amount) || 0;
    const remaining = roundCurrency(Math.max(0, expAmount - totalReimbursed));

    if (remaining > 0.5) {
      stalledCount++;
      stalledTotal = roundCurrency(stalledTotal + remaining);
      if (diffDays > oldestDays) {
        oldestDays = diffDays;
      }
    }
  }

  if (stalledCount > 0) {
    return {
      id: 'stalled_health_reimbursements',
      category: 'stalled_health',
      severity: 'warning',
      title: `Remboursements santé en souffrance (> ${daysThreshold} jours)`,
      message: `${stalledCount} soin(s) de santé débité(s) reste(nt) non remboursé(s) depuis plus de ${daysThreshold} jours (dont le plus ancien depuis ${oldestDays} jours), pour un total restant dû de ${formatCurrencyFr(stalledTotal)}. Pensez à relancer votre organisme de mutuelle ou à vérifier votre compte Ameli.`,
      actionLabel: 'Accéder au module Santé',
      actionTarget: '/sante',
      metadata: { stalledCount, stalledTotal, oldestDays, daysThreshold }
    };
  }

  return null;
}

/**
 * 6. SENTINELLE ARBITRAGE DE CRÉDIT (Remboursement anticipé partiel)
 * Simule le gain d'intérêts et le raccourcissement de durée d'un prêt via estimateLoanPayoffClient
 * si un excédent net prévisionnel pérenne est disponible.
 */
export function auditLoanPrepayment(
  loans: Loan[],
  soldePrevisionnel: number,
  seuilFondRoulement = 500
): FinancialInsight | null {
  const excess = roundCurrency(soldePrevisionnel - seuilFondRoulement);
  if (excess < 200) {
    return null;
  }

  const activeLoans = loans.filter(l => !l.isArchived && Number(l.remainingCapital) > 0 && !l.isPaused);
  if (activeLoans.length === 0) {
    return null;
  }

  // Tri par taux d'intérêt décroissant (règle rationnelle d'avalanche : cibler le prêt le plus coûteux)
  const sortedLoans = [...activeLoans].sort((a, b) => (Number(b.interestRate) || 0) - (Number(a.interestRate) || 0));
  const candidate = sortedLoans[0];
  const rate = Number(candidate.interestRate) || 0;
  const remainingCap = Number(candidate.remainingCapital) || 0;

  // Ne pas proposer si le taux d'intérêt est quasi nul (prêt à taux zéro)
  if (rate < 0.5) {
    return null;
  }

  const prepayAmount = roundCurrency(Math.min(remainingCap, Math.min(excess, 1000)));
  if (prepayAmount < 100) {
    return null;
  }

  const baseline = estimateLoanPayoffClient({
    remainingCapital: remainingCap,
    monthlyPayment: Number(candidate.monthlyPayment) || 0,
    interestRate: rate,
    insurancePart: Number(candidate.insurancePart) || 0
  });

  const withPrepay = estimateLoanPayoffClient({
    remainingCapital: Math.max(0, remainingCap - prepayAmount),
    monthlyPayment: Number(candidate.monthlyPayment) || 0,
    interestRate: rate,
    insurancePart: Number(candidate.insurancePart) || 0
  });

  if (baseline.possible && withPrepay.possible) {
    const monthsSaved = Math.max(0, (baseline.monthsRemaining || 0) - (withPrepay.monthsRemaining || 0));
    const interestSaved = roundCurrency(Math.max(0, (baseline.totalInterest || 0) - (withPrepay.totalInterest || 0)));

    if (monthsSaved > 0 || interestSaved > 0) {
      return {
        id: `loan_prepayment_${candidate.id}`,
        category: 'loan_prepayment',
        severity: 'info',
        title: `Opportunité d'arbitrage de crédit : ${candidate.name}`,
        message: `Votre excédent prévisionnel net (${formatCurrencyFr(excess)}) permettrait d'affecter ${formatCurrencyFr(prepayAmount)} en remboursement anticipé sur « ${candidate.name} » (taux : ${rate} %). Vous économiseriez ${formatCurrencyFr(interestSaved)} d'intérêts et réduiriez la durée de ${monthsSaved} mois.`,
        actionLabel: 'Simuler sur la page Crédits',
        actionTarget: '/credits',
        metadata: {
          loanId: candidate.id,
          loanName: candidate.name,
          prepayAmount,
          interestSaved,
          monthsSaved,
          newEndMonth: withPrepay.estimatedEndMonth
        }
      };
    }
  }

  return null;
}

/**
 * SENTINELLE : VULNÉRABILITÉ DU CRÉDIT À LA CONSOMMATION
 * Alerte (type warning) si les mensualités cumulées des crédits conso dépassent 15 % des revenus prévus.
 */
export function auditConsumerDebtVulnerability(
  loans: Loan[],
  incomesPlanned: number
): FinancialInsight | null {
  if (!loans || loans.length === 0 || !incomesPlanned || incomesPlanned <= 0) {
    return null;
  }

  const activeConsumerLoans = loans.filter(l => 
    !l.isArchived && 
    !l.isPaused && 
    (l.loanType === 'consumer' || !l.loanType) && 
    (Number(l.remainingCapital) || 0) > 0
  );

  if (activeConsumerLoans.length === 0) {
    return null;
  }

  const totalConsumerMonthly = roundCurrency(
    activeConsumerLoans.reduce((sum, l) => sum + (Number(l.monthlyPayment) || 0), 0)
  );

  const consumerRatio = (totalConsumerMonthly / incomesPlanned) * 100;

  if (consumerRatio > 15) {
    const formattedRatio = consumerRatio.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return {
      id: 'consumer_debt_vulnerability',
      category: 'consumer_debt_vulnerability',
      severity: 'warning',
      title: 'Poids élevé des crédits à la consommation',
      message: `Vos crédits à la consommation absorbent ${formattedRatio} % de vos revenus (${formatCurrencyFr(totalConsumerMonthly)}/mois sur ${formatCurrencyFr(incomesPlanned)}). Ce niveau dépasse le seuil de vigilance recommandé de 15 % et fragilise votre capacité d'épargne.`,
      actionLabel: 'Analyser mes crédits',
      actionTarget: '/credits',
      metadata: {
        totalConsumerMonthly,
        incomesPlanned,
        consumerRatio
      }
    };
  }

  return null;
}

/**
 * SENTINELLE : COMPTE À REBOURS DE LIBÉRATION DE CRÉDIT (Cash-flow libéré)
 * Notification (type success/info) lorsqu'un crédit actif arrive à échéance dans 3 mois ou moins (1, 2 ou 3 mensualités restantes).
 */
export function auditLoanFreedomCountdown(
  loans: Loan[],
  loanPayments: Transaction[] = [],
  currentMonth?: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  if (!loans || loans.length === 0) return insights;

  const activeLoans = loans.filter(l => !l.isArchived && !l.isPaused && (Number(l.remainingCapital) || 0) > 0);

  for (const loan of activeLoans) {
    const appCleared = loanPayments.filter(p => p.linkedId === loan.id && p.status === 'cleared').length;
    const prepaid = Number(loan.prepaidInstallments) || 0;
    const adj = Number(loan.monthsAdjustment) || 0;
    let cleared = appCleared + prepaid + adj;
    const duration = Number(loan.durationMonths) || 0;
    if (cleared < 0) cleared = 0;
    if (duration > 0 && cleared > duration) cleared = duration;

    let remainingInstallments = 0;
    if (duration > 0) {
      remainingInstallments = Math.max(0, duration - cleared);
    } else {
      const rem = Number(loan.remainingCapital) || 0;
      const pay = Number(loan.monthlyPayment) || 0;
      if (rem > 0 && pay > 0) {
        const sim = estimateLoanPayoffClient({
          remainingCapital: rem,
          monthlyPayment: pay,
          interestRate: Number(loan.interestRate) || 0,
          insurancePart: Number(loan.insurancePart) || 0,
          startMonth: currentMonth
        });
        remainingInstallments = sim.monthsRemaining || 0;
      }
    }

    if (remainingInstallments > 0 && remainingInstallments <= 3) {
      const freedAmount = Number(loan.monthlyPayment) || 0;
      const formattedFreed = formatCurrencyFr(freedAmount);
      const isLastMonth = remainingInstallments === 1;

      insights.push({
        id: `loan_freedom_${loan.id}`,
        category: 'loan_freedom_countdown',
        severity: isLastMonth ? 'success' : 'info',
        title: isLastMonth 
          ? `Dernière mensualité pour « ${loan.name} » !` 
          : `Fin proche pour « ${loan.name} »`,
        message: isLastMonth
          ? `Plus qu'une seule mensualité ! Dès le mois prochain, vous récupérerez définitivement +${formattedFreed}/mois de cash-flow net.`
          : `Plus que ${remainingInstallments} mensualités : vous allez bientôt récupérer définitivement +${formattedFreed}/mois de reste à vivre !`,
        actionLabel: 'Voir le crédit',
        actionTarget: '/credits',
        metadata: {
          loanId: loan.id,
          loanName: loan.name,
          remainingInstallments,
          freedMonthlyAmount: freedAmount
        }
      });
    }
  }

  return insights;
}

/**
 * SENTINELLE : ANTICIPATION DE PALIERS DE CRÉDIT (dans les 60 jours)
 * Détecte si un palier de mensualité est programmé dans les 60 prochains jours (ou mois M+1 / M+2).
 */
export function auditUpcomingLoanTiers(
  tiers: { loanId: string; effectiveMonth: string; monthlyPayment: number; previousPayment?: number | null; notes?: string | null }[],
  loans: Loan[],
  currentDate: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  if (!tiers || tiers.length === 0 || !loans || loans.length === 0) return insights;

  const currentYm = currentDate.slice(0, 7);
  const loanMap = new Map(loans.map(l => [l.id, l]));

  // Calcul des 2 mois à venir (M+1 et M+2)
  const [curY, curM] = currentYm.split('-').map(Number);
  const targetMonths: string[] = [];
  for (let offset = 1; offset <= 2; offset++) {
    const m = curM + offset;
    const y = curY + Math.floor((m - 1) / 12);
    const normalizedM = ((m - 1) % 12) + 1;
    targetMonths.push(`${y}-${String(normalizedM).padStart(2, '0')}`);
  }

  for (const tier of tiers) {
    if (!targetMonths.includes(tier.effectiveMonth)) continue;

    const loan = loanMap.get(tier.loanId);
    if (!loan || loan.isArchived) continue;

    const currentPay = Number(loan.monthlyPayment) || 0;
    const newPay = Number(tier.monthlyPayment) || 0;
    if (newPay === currentPay) continue;

    const diff = roundCurrency(newPay - currentPay);
    const isIncrease = diff > 0;
    const formattedDiff = formatCurrencyFr(Math.abs(diff));
    const formattedNew = formatCurrencyFr(newPay);

    insights.push({
      id: `upcoming_tier_${tier.loanId}_${tier.effectiveMonth}`,
      category: 'upcoming_loan_tiers',
      severity: isIncrease ? 'warning' : 'info',
      title: isIncrease 
        ? `Hausse de mensualité programmée : « ${loan.name} »`
        : `Baisse de mensualité programmée : « ${loan.name} »`,
      message: isIncrease
        ? `À compter de ${tier.effectiveMonth}, la mensualité de « ${loan.name} » passera à ${formattedNew} (+${formattedDiff}/mois). Anticipez cette hausse dans votre budget.`
        : `À compter de ${tier.effectiveMonth}, la mensualité de « ${loan.name} » passera à ${formattedNew} (-${formattedDiff}/mois de reste à vivre en plus).`,
      actionLabel: 'Gérer les paliers',
      actionTarget: '/credits',
      metadata: {
        loanId: loan.id,
        loanName: loan.name,
        effectiveMonth: tier.effectiveMonth,
        currentPayment: currentPay,
        newPayment: newPay,
        difference: diff
      }
    });
  }

  return insights;
}

function formatDateFr(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

/**
 * SENTINELLE : VEILLE SUR LES ÉCHÉANCES D'ENGAGEMENT & FINS DE PROMOTION
 * Déclenche une alerte prioritaire quand la date actuelle entre dans la fenêtre de préavis
 * ou lorsqu'une hausse tarifaire post-promo prend effet prochainement.
 */
export function auditCommitmentDeadlines(
  templates: RecurrenceTemplate[],
  currentDate: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const currentTs = new Date(`${currentDate}T00:00:00`).getTime();
  if (isNaN(currentTs)) return insights;

  const activeTemplates = templates.filter(t => t.isActive !== false && t.commitment_end_date);

  for (const t of activeTemplates) {
    const commitmentEndDate = t.commitment_end_date!;
    const noticePeriodDays = t.notice_period_days !== undefined && t.notice_period_days !== null ? Number(t.notice_period_days) : 30;
    const currentAmount = Number(t.amount) || 0;
    const priceAfter = t.price_after_promo !== undefined && t.price_after_promo !== null ? Number(t.price_after_promo) : null;
    const annualIncrease = priceAfter !== null && priceAfter > currentAmount 
      ? roundCurrency((priceAfter - currentAmount) * 12) 
      : 0;

    let fullEndDate = commitmentEndDate;
    if (commitmentEndDate.length === 7) {
      const [y, m] = commitmentEndDate.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      fullEndDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const [ey, em, ed] = fullEndDate.split('-').map(Number);
    const deadlineDate = new Date(Date.UTC(ey, em - 1, ed - noticePeriodDays));
    const noticeDeadlineStr = deadlineDate.toISOString().slice(0, 10);
    // Fenêtre critique : de (noticeDeadline - 15 jours) à commitmentEndDate
    const criticalStartDate = new Date(Date.UTC(ey, em - 1, ed - noticePeriodDays - 15));
    const criticalWindowStartStr = criticalStartDate.toISOString().slice(0, 10);

    const [curY, curM] = currentDate.split('-').map(Number);
    const [endY, endM] = fullEndDate.split('-').map(Number);
    const monthsDiff = (endY - curY) * 12 + (endM - curM);
    const isIncreasingNextMonth = monthsDiff === 1 && annualIncrease > 0;

    const inCriticalWindow = currentDate >= criticalWindowStartStr && currentDate <= fullEndDate;

    if (inCriticalWindow || isIncreasingNextMonth) {
      const isUrgent = currentDate >= noticeDeadlineStr;
      const severity: InsightSeverity = isUrgent ? 'critical' : 'warning';
      const contractLabel = t.label || 'Contrat / Abonnement';

      const deadlineFr = formatDateFr(noticeDeadlineStr);
      const endFr = formatDateFr(fullEndDate);
      const increaseInfo = annualIncrease > 0
        ? ` (hausse prévue de +${formatCurrencyFr(roundCurrency(priceAfter! - currentAmount))}/mois, soit +${formatCurrencyFr(annualIncrease)}/an)`
        : '';

      const title = isUrgent
        ? `Préavis urgent : résiliation de « ${contractLabel} » requise`
        : `Fin d'engagement proche : « ${contractLabel} »`;

      const message = isUrgent
        ? `Votre engagement sur « ${contractLabel} » expire le ${endFr}. La date limite de préavis (${noticePeriodDays} j) est le ${deadlineFr}${increaseInfo}. Résiliez sans attendre pour éviter le renouvellement.`
        : `Votre engagement sur « ${contractLabel} » prend fin le ${endFr}. Vous devez résilier avant le ${deadlineFr} (${noticePeriodDays} jours de préavis)${increaseInfo}.`;

      insights.push({
        id: `commitment_deadline_${t.id}`,
        category: 'commitment_deadline',
        severity,
        title,
        message,
        actionLabel: 'Analyser mes charges fixes',
        actionTarget: '/analyse-charges',
        metadata: {
          templateId: t.id,
          contractName: contractLabel,
          commitmentEndDate: fullEndDate,
          noticeDeadline: noticeDeadlineStr,
          noticePeriodDays,
          currentAmount,
          priceAfterPromo: priceAfter,
          annualIncrease,
          isUrgent
        }
      });
    }
  }

  return insights;
}

/**
 * 8. SENTINELLE : VEILLE SUR LES FINS DE CONTRAT & ÉCHÉANCES D'EXPIRATION (v1.3.9)
 * Scanne l'ensemble des charges fixes possédant un contract_end_date.
 * Si la date de fin arrive à échéance dans les 30 prochains jours (ou est déjà passée),
 * génère une alerte critique/avertissement sur le Dashboard pour anticiper la résiliation ou renégociation.
 */
export function auditContractExpirations(
  templates: RecurrenceTemplate[],
  currentDate: string,
  transactions?: Transaction[]
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const [curY, curM, curD] = currentDate.split('-').map(Number);
  const currentTs = Date.UTC(curY, curM - 1, curD);
  if (isNaN(currentTs)) return insights;

  const handledIds = new Set<string>();

  // 1. Scan des modèles de récurrence (charges fixes récurrentes)
  const activeTemplates = (templates || []).filter(t => t.isActive !== false && t.contract_end_date);

  for (const t of activeTemplates) {
    const rawEndDate = t.contract_end_date!.trim();
    let endIso = rawEndDate;
    if (rawEndDate.length === 7) {
      const [y, m] = rawEndDate.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      endIso = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const [ey, em, ed] = endIso.split('-').map(Number);
    const endTs = Date.UTC(ey, em - 1, ed);
    if (isNaN(endTs)) continue;

    const diffDays = Math.round((endTs - currentTs) / (1000 * 60 * 60 * 24));
    const contractLabel = t.label || 'Contrat / Abonnement';
    const endFormatted = formatDateFr(endIso);

    // Si expiration dans les 30 jours ou déjà expirée
    if (diffDays <= 30) {
      handledIds.add(t.id);
      const isExpired = diffDays < 0;
      const isUrgent = diffDays <= 15;
      const severity: InsightSeverity = isExpired || isUrgent ? 'critical' : 'warning';

      let title: string;
      let message: string;

      if (isExpired) {
        const daysAgo = Math.abs(diffDays);
        title = `Contrat expiré : « ${contractLabel} »`;
        message = `Attention, votre contrat « ${contractLabel} » est arrivé à échéance le ${endFormatted} (expiré depuis ${daysAgo} jour${daysAgo > 1 ? 's' : ''}). Pensez à résilier, renégocier ou actualiser cette charge fixe pour éviter toute reconduction tacite non désirée.`;
      } else if (diffDays === 0) {
        title = `Échéance aujourd'hui : « ${contractLabel} »`;
        message = `Attention, votre contrat « ${contractLabel} » expire aujourd'hui (${endFormatted}). Résiliez ou renégociez sans attendre avant reconduction tacite.`;
      } else if (isUrgent) {
        title = `Fin de contrat imminente (J-${diffDays}) : « ${contractLabel} »`;
        message = `Attention, votre contrat « ${contractLabel} » expire dans ${diffDays} jour${diffDays > 1 ? 's' : ''} (le ${endFormatted}). Pensez à résilier ou renégocier avant tacite reconduction.`;
      } else {
        title = `Fin de contrat proche : « ${contractLabel} »`;
        message = `Votre contrat « ${contractLabel} » arrive à expiration le ${endFormatted} (dans ${diffDays} jours). Anticipez dès maintenant sa résiliation ou renégociation.`;
      }

      insights.push({
        id: `contract_expiration_${t.id}`,
        category: 'contract_expiration',
        severity,
        title,
        message,
        actionLabel: 'Gérer mes charges fixes',
        actionTarget: '/charges-fixes',
        metadata: {
          templateId: t.id,
          contractName: contractLabel,
          contractEndDate: endIso,
          diffDays,
          isExpired
        }
      });
    }
  }

  // 2. Scan des transactions directes possédant un contract_end_date
  if (transactions) {
    const candidateTx = transactions.filter(t => 
      t.status !== 'disabled' && 
      (t as any).contract_end_date && 
      (!t.templateId || !handledIds.has(t.templateId))
    );

    for (const tx of candidateTx) {
      const rawEndDate = (tx as any).contract_end_date.trim();
      let endIso = rawEndDate;
      if (rawEndDate.length === 7) {
        const [y, m] = rawEndDate.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        endIso = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }

      const [ey, em, ed] = endIso.split('-').map(Number);
      const endTs = Date.UTC(ey, em - 1, ed);
      if (isNaN(endTs)) continue;

      const diffDays = Math.round((endTs - currentTs) / (1000 * 60 * 60 * 24));
      const contractLabel = tx.label || 'Charge fixe';
      const endFormatted = formatDateFr(endIso);

      if (diffDays <= 30) {
        handledIds.add(tx.id);
        const isExpired = diffDays < 0;
        const isUrgent = diffDays <= 15;
        const severity: InsightSeverity = isExpired || isUrgent ? 'critical' : 'warning';

        let title: string;
        let message: string;

        if (isExpired) {
          const daysAgo = Math.abs(diffDays);
          title = `Contrat expiré : « ${contractLabel} »`;
          message = `Attention, votre contrat « ${contractLabel} » est arrivé à échéance le ${endFormatted} (expiré depuis ${daysAgo} jour${daysAgo > 1 ? 's' : ''}). Pensez à résilier, renégocier ou actualiser cette charge fixe.`;
        } else if (diffDays === 0) {
          title = `Échéance aujourd'hui : « ${contractLabel} »`;
          message = `Attention, votre contrat « ${contractLabel} » expire aujourd'hui (${endFormatted}). Résiliez ou renégociez sans attendre.`;
        } else if (isUrgent) {
          title = `Fin de contrat imminente (J-${diffDays}) : « ${contractLabel} »`;
          message = `Attention, votre contrat « ${contractLabel} » expire dans ${diffDays} jour${diffDays > 1 ? 's' : ''} (le ${endFormatted}). Pensez à résilier ou renégocier avant tacite reconduction.`;
        } else {
          title = `Fin de contrat proche : « ${contractLabel} »`;
          message = `Votre contrat « ${contractLabel} » arrive à expiration le ${endFormatted} (dans ${diffDays} jours). Anticipez dès maintenant sa résiliation ou renégociation.`;
        }

        insights.push({
          id: `contract_expiration_tx_${tx.id}`,
          category: 'contract_expiration',
          severity,
          title,
          message,
          actionLabel: 'Gérer mes charges fixes',
          actionTarget: '/charges-fixes',
          metadata: {
            transactionId: tx.id,
            contractName: contractLabel,
            contractEndDate: endIso,
            diffDays,
            isExpired
          }
        });
      }
    }
  }

  return insights;
}

/**
 * ORCHESTRATION CENTRALE DU CONSEILLER FINANCIER
 * Évalue l'ensemble des sentinelles et retourne la liste des insights
 * triée par niveau de sévérité / priorité d'urgence décroissante.
 */
export function generateInsights(context: InsightsContext): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  const crashTest = auditCrashTest(
    context.manualBalance, 
    context.pendingTransactions, 
    context.currentDate
  );
  if (crashTest) insights.push(crashTest);

  const idleCash = auditIdleCash(
    context.soldePrevisionnel, 
    context.seuilFondRoulement
  );
  if (idleCash) insights.push(idleCash);

  const dailyCadence = auditDailyExpenseCadence(
    context.currentDailyTotal,
    context.average3MonthsDaily,
    context.daysElapsed,
    context.daysInMonth
  );
  if (dailyCadence) insights.push(dailyCadence);

  const emergencyFundBase = context.chargesBreakdown
    ? calculateEmergencyFundBaseline(context.chargesBreakdown)
    : (context.totalObligatoires ?? 0);

  const emergencyFund = auditEmergencyFund(
    context.liquidSavingsTotal, 
    emergencyFundBase
  );
  if (emergencyFund) insights.push(emergencyFund);

  const stalledHealth = auditStalledHealth(
    context.healthExpenses || [], 
    context.currentDate, 
    context.healthDaysThreshold ?? 35,
    context.healthReimbursements
  );
  if (stalledHealth) insights.push(stalledHealth);

  const loanPrepay = auditLoanPrepayment(
    context.loans || [], 
    context.soldePrevisionnel, 
    context.seuilFondRoulement
  );
  if (loanPrepay) insights.push(loanPrepay);

  // Sentinelles Crédits (Palier 2)
  if (context.loans && context.incomesPlanned) {
    const consumerVulnerability = auditConsumerDebtVulnerability(
      context.loans,
      context.incomesPlanned
    );
    if (consumerVulnerability) insights.push(consumerVulnerability);
  }

  if (context.loans) {
    const freedomInsights = auditLoanFreedomCountdown(
      context.loans,
      context.loanPayments || [],
      context.currentDate.slice(0, 7)
    );
    if (freedomInsights.length > 0) {
      insights.push(...freedomInsights);
    }
  }

  if (context.loanPaymentHistory && context.loans) {
    const tiersInsights = auditUpcomingLoanTiers(
      context.loanPaymentHistory,
      context.loans,
      context.currentDate
    );
    if (tiersInsights.length > 0) {
      insights.push(...tiersInsights);
    }
  }

  const commitmentInsights = auditCommitmentDeadlines(
    context.templates || [],
    context.currentDate
  );
  if (commitmentInsights.length > 0) {
    insights.push(...commitmentInsights);
  }

  const contractInsights = auditContractExpirations(
    context.templates || [],
    context.currentDate,
    context.pendingTransactions
  );
  if (contractInsights.length > 0) {
    insights.push(...contractInsights);
  }

  // Tri par priorité décroissante : critical (4) > warning (3) > info (2) > success (1)
  return insights.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);
}
