import { v4 as uuidv4 } from 'uuid';

export type TransactionStatus = 'planned' | 'pending' | 'cleared' | 'disabled';
export type TransactionType = 'income' | 'fixed_expense' | 'variable_expense' | 'daily' | 'transfer' | 'health_expense' | 'health_reimbursement' | 'loan_payment';

export interface Category {
  id: string;
  name: string;
  type: TransactionType | 'system';
  color?: string;
  isArchived: boolean;
}

export interface IncomePayer {
  id: string;
  name: string;
  isArchived: boolean;
  createdAt?: string;
}

export type AccountType = 'checking' | 'savings' | 'cash';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  subType?: 'livret_a' | 'lep' | 'ldds' | 'checking' | 'other' | string;
  initialBalance: number;
  referenceDate: string; // YYYY-MM-DD
  interestRate?: number; // Taux d'intérêt annuel (%) - purement informatif
  targetAmount?: number; // Objectif d'épargne (€) - facultatif
  isClosed?: boolean;
  closedDate?: string; // YYYY-MM-DD
  closedBalance?: number;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  expectedDate?: string;
  recurrenceDay?: number; // 1-31
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  accountId: string;
  destinationAccountId?: string; // Compte destinataire pour les transferts d'épargne
  categoryId?: string;
  linkedId?: string; // e.g. for health reimbursement or loan
  label?: string;
  notes?: string;
  paymentMethod?: string; // Moyen de paiement (ex: Carte bancaire, Chèque, etc.)
  checkNumber?: string; // Numéro de chèque préservant les zéros initiaux (ex: '001245')
  amortizedCapital?: number;
  templateId?: string; // Référence vers le modèle récurrent RecurrenceTemplate
  isCustomized?: boolean; // Vrai si le montant ou le libellé a été personnalisé pour ce mois
  isReconstituted?: boolean; // Vrai si l'occurrence a été reconstituée historiquement sans pointage
  payerId?: string; // Référence vers l'organisme verseur IncomePayer
  deleted_at?: number | null; // Timestamp Unix ms de suppression logique (soft-delete)
}

export interface RecurrenceTemplate {
  id: string;
  type: TransactionType; // 'income' | 'fixed_expense' | 'variable_expense' | 'transfer'
  amount: number;
  recurrenceDay: number; // 1-31
  accountId: string;
  destinationAccountId?: string; // Compte destinataire pour les transferts d'épargne
  categoryId?: string;
  label?: string;
  notes?: string;
  startDate: string; // YYYY-MM (premier mois actif)
  endDate?: string; // YYYY-MM (optionnel, dernier mois actif inclus)
  isActive: boolean;
  disabledFromMonth?: string; // YYYY-MM (mois à partir duquel la récurrence est durablement désactivée)
  createdAt?: string;
  updatedAt?: string;
  payerId?: string; // Référence vers l'organisme verseur IncomePayer
  updateFutureOccurrencesFromDate?: string;
  commitment_end_date?: string | null; // YYYY-MM ou YYYY-MM-DD
  price_after_promo?: number | null; // Tarif appliqué post-promo
  notice_period_days?: number | null; // Délai de préavis en jours (défaut 30)
}

export interface Loan {
  id: string;
  name: string;
  lender: string;
  initialAmount: number;
  remainingCapital: number;
  monthlyPayment: number;
  interestRate?: number;
  insurancePart?: number;
  startDate: string;
  durationMonths: number;
  endDate?: string;
  debitDay?: number;
  prepaidInstallments?: number;
  monthsAdjustment?: number;
  accountId: string;
  notes?: string;
  isArchived: boolean;
  isPaused?: boolean;
  loanType?: 'consumer' | 'mortgage';
}

export interface LoanPaymentHistory {
  id: string;
  loanId: string;
  effectiveMonth: string; // YYYY-MM
  monthlyPayment: number;
  previousPayment?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface DashboardStorageKeys {
  manualBalance: string;
  card1: string;
  card2: string;
}

export type PlannedUrgency = 'urgent' | 'medium' | 'low';

export interface PlannedExpense {
  id: string;
  label: string;
  estimatedAmount: number;
  categoryId?: string | null;
  urgency: PlannedUrgency;
  targetDate?: string | null; // YYYY-MM-DD or YYYY-MM
  notes?: string | null;
  createdAt: string;
}

export function getDashboardStorageKeys(): DashboardStorageKeys {
  return {
    manualBalance: 'manualBalance',
    card1: 'card1',
    card2: 'card2'
  };
}

export const generateId = () => uuidv4();
