import type { Loan, Transaction } from '../db/database';
import { calculateAmortizedCapital } from '../engine/calculations';

/**
 * Structure d'un relevé mensuel de capital restant dû et de mensualité.
 */
export interface MonthlyCapitalRecord {
  month: string; // Format AAAA-MM (ex: 2019-07)
  mortgageCapital: number | null; // Capital restant dû immobilier en euros (null si non applicable)
  realEstateCapital?: number | null; // Alias pour compatibilité Recharts
  mortgageMonthlyPayment: number; // Mensualité prêt immobilier en euros
  consumerCapital: number | null; // Capital restant dû conso en euros (null si non applicable)
  consumerMonthlyPayment: number | null; // Mensualité conso en euros
  totalMonthlyPayment?: number | null; // Mensualité totale consolidée
  isForecast?: boolean; // Vrai si le mois relève de la projection prévisionnelle
  notes?: string | null;
}

export interface LoanCapitalRecordInput {
  month: string;
  realEstateCapital?: number | null;
  mortgageCapital?: number | null;
  realEstateMonthlyPayment?: number | null;
  mortgageMonthlyPayment?: number | null;
  consumerCapital?: number | null;
  consumerMonthlyPayment?: number | null;
  notes?: string | null;
}

export interface DiscrepancyReport {
  month: string;
  realEstateHistorical: number | null;
  realEstateLoansSum: number;
  realEstateDiscrepancy: number | null;
  consumerHistorical: number | null;
  consumerLoansSum: number;
  consumerDiscrepancy: number | null;
  hasDiscrepancy: boolean;
}

export interface HistoryComputationOptions {
  historyRecords?: LoanCapitalRecordInput[];
  currentMonth?: string;
  maxForecastMonths?: number; // Nombre max de mois de projection dans le futur (défaut : jusqu'à la fin des prêts actifs, plafonné à 120 mois)
}

/**
 * Calcule le mois d'échéance contractuel effectif d'un prêt en tenant compte
 * de startDate, durationMonths, prepaidInstallments, monthsAdjustment et endDate.
 */
export function getEffectiveLoanEndMonth(loan: Loan): string | null {
  if (loan.endDate) {
    return loan.endDate.substring(0, 7);
  }
  if (!loan.startDate || !loan.durationMonths) {
    return null;
  }

  const [startYear, startMonth] = loan.startDate.substring(0, 7).split('-').map(Number);
  const totalMonths = Number(loan.durationMonths) || 0;
  const prepaid = Number(loan.prepaidInstallments) || 0;
  const adjustment = Number(loan.monthsAdjustment) || 0;

  // Durée restante à partir de la date de démarrage
  const effectiveDuration = Math.max(0, totalMonths - prepaid - adjustment);
  if (effectiveDuration <= 0) {
    return loan.startDate.substring(0, 7);
  }

  let y = startYear;
  let m = startMonth + effectiveDuration - 1;
  while (m > 12) {
    m -= 12;
    y++;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Détermine si un prêt est actif et admissible pour un mois cible donné.
 * Règle stricte :
 * - Prêt archivé -> exclu
 * - Prêt désactivé (status === 'disabled' ou isActive === false) -> exclu
 * - Prêt soldé sans capital (remainingCapital <= 0) à date -> exclu
 * - Date de début non atteinte -> exclu
 * - Date de fin dépassée -> exclu
 */
export function isLoanEligibleForMonth(loan: Loan, targetMonth: string): boolean {
  if (loan.isArchived) return false;
  if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return false;
  if ((Number(loan.remainingCapital) || 0) <= 0) return false;

  const startMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
  if (startMonth && targetMonth < startMonth) return false;

  const effectiveEnd = getEffectiveLoanEndMonth(loan);
  if (effectiveEnd && targetMonth > effectiveEnd) return false;

  return true;
}

/**
 * Calcule l'écart éventuel entre les données réelles constatées au dernier mois historique
 * et la somme des fiches de prêts individuels enregistrés dans l'application.
 * Ne modifie aucune donnée. Pure fonction d'analyse et d'observation.
 */
export function checkLastHistoricalDiscrepancy(
  historyRecords?: LoanCapitalRecordInput[],
  loans?: Loan[]
): DiscrepancyReport | null {
  if (!historyRecords || historyRecords.length === 0) return null;

  const sorted = [...historyRecords].sort((a, b) => a.month.localeCompare(b.month));
  const lastRecord = sorted[sorted.length - 1];
  const lastMonth = lastRecord.month;

  const eligibleLoans = (loans || []).filter(l => isLoanEligibleForMonth(l, lastMonth));

  let realEstateSum = 0;
  let consumerSum = 0;

  eligibleLoans.forEach(l => {
    const cap = Number(l.remainingCapital) || 0;
    if (l.loanType === 'mortgage') {
      realEstateSum += cap;
    } else {
      consumerSum += cap;
    }
  });

  const lastImmoReal = lastRecord.realEstateCapital !== undefined ? lastRecord.realEstateCapital : (lastRecord.mortgageCapital ?? null);
  const lastConsoReal = lastRecord.consumerCapital !== undefined ? lastRecord.consumerCapital : null;

  const immoDisc = lastImmoReal !== null ? Math.round((realEstateSum - lastImmoReal) * 100) / 100 : null;
  const consoDisc = lastConsoReal !== null ? Math.round((consumerSum - lastConsoReal) * 100) / 100 : null;

  const hasDiscrepancy = (immoDisc !== null && Math.abs(immoDisc) >= 0.01) || (consoDisc !== null && Math.abs(consoDisc) >= 0.01);

  return {
    month: lastMonth,
    realEstateHistorical: lastImmoReal,
    realEstateLoansSum: Math.round(realEstateSum * 100) / 100,
    realEstateDiscrepancy: immoDisc,
    consumerHistorical: lastConsoReal,
    consumerLoansSum: Math.round(consumerSum * 100) / 100,
    consumerDiscrepancy: consoDisc,
    hasDiscrepancy
  };
}

/**
 * Calcule l'historique complet pour le graphique Recharts.
 * RÈGLE ABSOLUE :
 * - Aucune anticipation du futur : la courbe s'arrête STRICTEMENT au mois en cours (currentMonth).
 * - Zéro projection au-delà de currentMonth : on ne calcule et n'affiche JAMAIS de mois > currentMonth.
 * - Si un historique réel est importé (historyRecords), il est restitué jusqu'à currentMonth inclus.
 * - S'il n'y a pas d'historique importé (ou pour les mois postérieurs au dernier relevé importé jusqu'à currentMonth inclus),
 *   les données réelles sont construites à partir des crédits de l'onglet Crédits (loans et transactions).
 * - Si ni historique ni crédit actif n'existe, retourne [].
 */
export function getLoanCapitalHistory(
  loans?: Loan[],
  transactions?: Transaction[],
  currentMonth?: string,
  options?: HistoryComputationOptions
): MonthlyCapitalRecord[] {
  const effectiveCurrentMonth = currentMonth || new Date().toISOString().substring(0, 7);
  const history = options?.historyRecords ? [...options.historyRecords] : [];
  history.sort((a, b) => a.month.localeCompare(b.month));

  // Filtrer l'historique pour ne JAMAIS dépasser le mois courant
  const boundedHistory = history.filter(h => h.month <= effectiveCurrentMonth);

  const activeLoans = (loans || []).filter(l => !l.isArchived && (l as any).status !== 'disabled');

  // Si ni historique réel ni crédits actifs : aucun affichage (état vide)
  if (boundedHistory.length === 0 && activeLoans.length === 0) {
    return [];
  }

  const result: MonthlyCapitalRecord[] = [];
  const existingMonths = new Set<string>();

  // 1. Restitution exacte des relevés historiques réels jusqu'à effectiveCurrentMonth inclus
  boundedHistory.forEach(rec => {
    const immoCap = rec.realEstateCapital !== undefined ? rec.realEstateCapital : (rec.mortgageCapital ?? null);
    const immoPay = rec.realEstateMonthlyPayment !== undefined ? Number(rec.realEstateMonthlyPayment) : (Number(rec.mortgageMonthlyPayment) || 0);
    const consoCap = rec.consumerCapital !== undefined ? rec.consumerCapital : null;
    const consoPay = rec.consumerMonthlyPayment !== undefined ? (rec.consumerMonthlyPayment !== null ? Number(rec.consumerMonthlyPayment) : null) : null;
    const totPay = consoPay !== null ? Math.round((immoPay + consoPay) * 100) / 100 : immoPay;

    result.push({
      month: rec.month,
      mortgageCapital: immoCap,
      realEstateCapital: immoCap,
      mortgageMonthlyPayment: immoPay,
      consumerCapital: consoCap,
      consumerMonthlyPayment: consoPay,
      totalMonthlyPayment: totPay,
      isForecast: false,
      notes: rec.notes || null
    });
    existingMonths.add(rec.month);
  });

  // Si aucun crédit actif n'est présent, on s'arrête à l'historique restitué
  if (activeLoans.length === 0) {
    return result;
  }

  // 2. Compléter au fil de l'eau avec les crédits réels (loans / transactions) jusqu'à effectiveCurrentMonth inclus
  const clearedTxs = (transactions || []).filter(t => t.type === 'loan_payment' && t.status === 'cleared' && t.date.substring(0, 7) <= effectiveCurrentMonth);

  // Ensemble des mois concernés par les paiements réels constatés ou le mois courant
  const candidateMonthsSet = new Set<string>();
  clearedTxs.forEach(t => candidateMonthsSet.add(t.date.substring(0, 7)));
  if (effectiveCurrentMonth) {
    candidateMonthsSet.add(effectiveCurrentMonth);
  }

  // Si aucun historique importé, on peut aussi remonter les mois passés où les crédits étaient déjà actifs
  // tout en bornant strictement au mois courant
  const candidateMonths = Array.from(candidateMonthsSet).filter(m => m <= effectiveCurrentMonth).sort();

  if (boundedHistory.length === 0) {
    // Cas sans historique importé : reconstitution basée sur les fiches de crédits et débits réels
    // Dernier mois connu = candidateMonths[candidateMonths.length - 1] (qui est au plus effectiveCurrentMonth)
    const latestMonth = candidateMonths[candidateMonths.length - 1];

    const loanCapitalByMonth = new Map<string, Map<string, number>>();
    activeLoans.forEach(loan => {
      const capMap = new Map<string, number>();
      let currentCap = Number(loan.remainingCapital) || 0;
      capMap.set(latestMonth, currentCap);

      for (let i = candidateMonths.length - 2; i >= 0; i--) {
        const mAfter = candidateMonths[i + 1];
        const amortPaidInAfter = clearedTxs
          .filter(t => t.linkedId === loan.id && t.date.startsWith(mAfter))
          .reduce((sum, t) => {
            if (t.amortizedCapital !== undefined && t.amortizedCapital !== null) {
              return sum + Number(t.amortizedCapital);
            }
            return sum + (Number(t.amount) || 0) * 0.6;
          }, 0);

        currentCap += amortPaidInAfter;
        capMap.set(candidateMonths[i], Math.min(Number(loan.initialAmount) || currentCap, currentCap));
      }
      loanCapitalByMonth.set(loan.id, capMap);
    });

    candidateMonths.forEach(m => {
      const monthPayments = clearedTxs.filter(t => t.date.startsWith(m));
      let mortgageCap = 0;
      let hasMortgage = false;
      let mortgagePay = 0;

      let consumerCap = 0;
      let hasConsumer = false;
      let consumerPay = 0;

      activeLoans.forEach(loan => {
        const isEligible = isLoanEligibleForMonth(loan, m);
        if (!isEligible) return;

        const capMap = loanCapitalByMonth.get(loan.id);
        const cap = capMap ? capMap.get(m) : Number(loan.remainingCapital) || 0;
        const loanMonthPayments = monthPayments.filter(p => p.linkedId === loan.id);
        const pay = loanMonthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) || (Number(loan.monthlyPayment) || 0);

        if (loan.loanType === 'mortgage') {
          if (cap !== undefined) {
            hasMortgage = true;
            mortgageCap += cap;
            mortgagePay += pay;
          }
        } else {
          if (cap !== undefined) {
            hasConsumer = true;
            consumerCap += cap;
            consumerPay += pay;
          }
        }
      });

      const mCap = hasMortgage ? Math.round(mortgageCap * 100) / 100 : null;
      const cCap = hasConsumer ? Math.round(consumerCap * 100) / 100 : null;
      const totPay = (hasMortgage || hasConsumer) ? Math.round((mortgagePay + consumerPay) * 100) / 100 : null;

      result.push({
        month: m,
        mortgageCapital: mCap,
        realEstateCapital: mCap,
        mortgageMonthlyPayment: mortgagePay,
        consumerCapital: cCap,
        consumerMonthlyPayment: hasConsumer ? consumerPay : null,
        totalMonthlyPayment: totPay,
        isForecast: false
      });
    });

    return result;
  }

  // Cas avec historique importé : si le dernier relevé historique est antérieur à effectiveCurrentMonth,
  // on ajoute les mois écoulés réels entre le dernier mois historique et effectiveCurrentMonth
  const lastHistoricalMonth = boundedHistory[boundedHistory.length - 1].month;
  if (lastHistoricalMonth < effectiveCurrentMonth) {
    let [curY, curM] = lastHistoricalMonth.split('-').map(Number);
    const [curMaxY, curMaxM] = effectiveCurrentMonth.split('-').map(Number);

    while (curY < curMaxY || (curY === curMaxY && curM < curMaxM)) {
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
      const nextMonth = `${curY}-${String(curM).padStart(2, '0')}`;
      if (nextMonth > effectiveCurrentMonth) break;
      if (existingMonths.has(nextMonth)) continue;

      const monthPayments = clearedTxs.filter(t => t.date.startsWith(nextMonth));
      let mortgageCap = 0;
      let hasMortgage = false;
      let mortgagePay = 0;

      let consumerCap = 0;
      let hasConsumer = false;
      let consumerPay = 0;

      activeLoans.forEach(loan => {
        const isEligible = isLoanEligibleForMonth(loan, nextMonth);
        if (!isEligible) return;

        const cap = Number(loan.remainingCapital) || 0;
        const loanMonthPayments = monthPayments.filter(p => p.linkedId === loan.id);
        const pay = loanMonthPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) || (Number(loan.monthlyPayment) || 0);

        if (loan.loanType === 'mortgage') {
          hasMortgage = true;
          mortgageCap += cap;
          mortgagePay += pay;
        } else {
          hasConsumer = true;
          consumerCap += cap;
          consumerPay += pay;
        }
      });

      const mCap = hasMortgage ? Math.round(mortgageCap * 100) / 100 : null;
      const cCap = hasConsumer ? Math.round(consumerCap * 100) / 100 : null;
      const totPay = (hasMortgage || hasConsumer) ? Math.round((mortgagePay + consumerPay) * 100) / 100 : null;

      result.push({
        month: nextMonth,
        mortgageCapital: mCap,
        realEstateCapital: mCap,
        mortgageMonthlyPayment: mortgagePay,
        consumerCapital: cCap,
        consumerMonthlyPayment: hasConsumer ? consumerPay : null,
        totalMonthlyPayment: totPay,
        isForecast: false
      });
      existingMonths.add(nextMonth);
    }
  }

  // Tri final chronologique et garantie absolue : AUCUN mois > effectiveCurrentMonth
  return result.filter(r => r.month <= effectiveCurrentMonth).sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Extrait les repères temporels lisibles (repères annuels et bornes) pour l'axe X Recharts.
 */
export function getLoanCapitalYearTicks(records: MonthlyCapitalRecord[]): string[] {
  if (!records || records.length === 0) return [];
  const ticks: string[] = [];
  const first = records[0].month;
  const last = records[records.length - 1].month;

  const totalMonths = records.length;
  // Intervalle dynamique selon l'étendue totale
  const yearStep = totalMonths > 240 ? 4 : totalMonths > 120 ? 2 : 1;

  ticks.push(first);
  records.forEach(r => {
    if (r.month.endsWith('-01') && r.month !== first && r.month !== last) {
      const year = parseInt(r.month.substring(0, 4), 10);
      if (year % yearStep === 0) {
        ticks.push(r.month);
      }
    }
  });
  if (!ticks.includes(last)) {
    ticks.push(last);
  }
  return ticks;
}
