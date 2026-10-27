export interface MonthlyCapitalRecord {
  month: string;
  mortgageCapital: number | null;
  realEstateCapital?: number | null;
  mortgageMonthlyPayment: number;
  consumerCapital: number | null;
  consumerMonthlyPayment: number | null;
  totalMonthlyPayment?: number | null;
}

export interface LoanCapitalHistoryDataset {
  version: 1;
  currency: 'EUR';
  description: string;
  records: MonthlyCapitalRecord[];
}

/**
 * Jeu de données standard pour les installations génériques et indépendantes.
 * Initialisé à vide par défaut pour garantir la stricte confidentialité financière.
 */
export const PERSONAL_LOAN_CAPITAL_DATASET: LoanCapitalHistoryDataset = {
  version: 1,
  currency: 'EUR',
  description: 'Installation standard vierge',
  records: []
};
