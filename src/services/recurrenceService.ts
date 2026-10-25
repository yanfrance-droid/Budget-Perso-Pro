export interface AmbiguousMatch {
  month: string;
  templateId: string;
  templateLabel?: string;
  existingTransactionId: string;
  existingTransactionDate: string;
  amount: number;
  reason: string;
}

export interface GenerationReport {
  templatesProcessed: number;
  occurrencesCreated: number;
  occurrencesPreserved: number;
  occurrencesUpdated: number;
  ambiguousMatches: AmbiguousMatch[];
}

export interface MigrationReport {
  templatesCreated: number;
  originalTransactionsPreserved: number;
  historicalOccurrencesCreated: number;
  futureOccurrencesCreated: number;
  ambiguousMatches: AmbiguousMatch[];
  realBalanceBefore: number;
  realBalanceAfter: number;
  balanceDifference: number;
}

/**
 * Calcule de manière déterministe et sécurisée la date d'une occurrence.
 * Gère le repli de fin de mois (ex: 31 février -> 28/29 février, 31 avril -> 30 avril).
 * Évite tout décalage horaire UTC.
 */
export function computeOccurrenceDate(year: number, month: number, recurrenceDay: number): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(1, recurrenceDay), daysInMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Génère la liste des mois au format YYYY-MM à partir d'un mois de départ.
 */
export function getMonthList(startMonth: string, count: number): string[] {
  const [startYear, startM] = startMonth.split('-').map(Number);
  const result: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const totalMonths = (startYear * 12) + (startM - 1) + i;
    const y = Math.floor(totalMonths / 12);
    const m = (totalMonths % 12) + 1;
    result.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  
  return result;
}

/**
 * Dérive l'identifiant technique déterministe pour une occurrence mensuelle.
 */
export function getOccurrenceId(templateId: string, monthStr: string): string {
  return `${templateId}_${monthStr}`;
}
