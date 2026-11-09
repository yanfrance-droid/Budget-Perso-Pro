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
  | 'commitment_deadline';

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
  totalObligatoires: number;
  healthExpenses?: Transaction[];
  healthReimbursements?: Transaction[];
  healthDaysThreshold?: number;
  loans?: Loan[];
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
 * 4. SENTINELLE MATELAS DE PRÉCAUTION (Socle des charges incompressibles totalObligatoires)
 * Calcule l'autonomie financière liquide sur la base stricte des charges incompressibles du foyer,
 * sans inventer de revenu théorique.
 */
export function auditEmergencyFund(
  liquidSavingsTotal: number,
  totalObligatoires: number
): FinancialInsight | null {
  const liquid = roundCurrency(liquidSavingsTotal);
  const obligations = roundCurrency(totalObligatoires);

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

  const emergencyFund = auditEmergencyFund(
    context.liquidSavingsTotal, 
    context.totalObligatoires
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

  const commitmentInsights = auditCommitmentDeadlines(
    context.templates || [],
    context.currentDate
  );
  if (commitmentInsights.length > 0) {
    insights.push(...commitmentInsights);
  }

  // Tri par priorité décroissante : critical (4) > warning (3) > info (2) > success (1)
  return insights.sort((a, b) => SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity]);
}
