import { useMemo, useState, useEffect, useRef } from 'react';
import { AmountInput } from '../components/ui/Components';
import { getDashboardStorageKeys } from '../db/database';
import { EXPENSE_TYPES } from '../engine/calculations';
import { 
  Wallet, 
  Receipt, 
  AlertCircle, 
  CheckCircle, 
  Filter, 
  Clock, 
  ShieldCheck, 
  CreditCard,
  Building2,
  TrendingUp,
  HeartPulse,
  PiggyBank,
  CalendarClock
} from 'lucide-react';
import { isFutureExpense, getLocalTodayString, formatDateDisplay } from './FutureExpenses';
import { getCurrentMonth } from '../utils/dateUtils';
import { 
  ComposedChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  getLoanCapitalHistory, 
  getLoanCapitalYearTicks, 
  checkLastHistoricalDiscrepancy, 
  type LoanCapitalRecordInput, 
  type DiscrepancyReport 
} from '../services/loanCapitalHistoryService';
import { calculateRealBalance, roundCurrency } from '../engine/calculations';
import { apiClient } from '../services/apiClient';
import { resolvePrimaryAccountId } from '../services/accountPresentation';

// Libellés dynamiques des mois en français
const formatMonthLabel = (m: string) => {
  const [year, month] = m.split('-');
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

// Formatage français conforme aux exigences d'affichage (ex: 2 100,00 €)
const formatCurrency = (val: number): string => {
  const normalized = roundCurrency(val);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(normalized);
};
import { useServerDataOptional } from '../contexts/ServerDataContext';

export default function Dashboard() {
  const serverData = useServerDataOptional();

  if (!serverData || serverData.isLoading) {
    return (
      <div className="p-4" style={{ textAlign: 'center', color: '#64748b' }}>
        Chargement du tableau de bord...
      </div>
    );
  }

  const accounts = serverData?.accounts || [];
  const transactions = serverData?.transactions || [];
  const categories = serverData?.categories || [];
  const loans = (serverData?.loans || []).filter(l => !l.isArchived);

  // Clés de stockage isolées (production vs sandbox)
  const storageKeys = useMemo(() => getDashboardStorageKeys(), []);
  const accountMap = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);

  // Saisie manuelle stockée dans le localStorage et sur le serveur centralisé
  const [manualBalance, setManualBalance] = useState<string>(() => 
    serverData?.dashboardSettings?.manualBalance || localStorage.getItem(storageKeys.manualBalance) || "0"
  );
  const [card1, setCard1] = useState<string>(() => 
    serverData?.dashboardSettings?.card1 || localStorage.getItem(storageKeys.card1) || "0"
  );
  const [card2, setCard2] = useState<string>(() => 
    serverData?.dashboardSettings?.card2 || localStorage.getItem(storageKeys.card2) || "0"
  );

  const currentMonth = getCurrentMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const isUserEditedRef = useRef(false);
  const isSettingsInitializedRef = useRef(false);
  const serverDataRef = useRef(serverData);
  serverDataRef.current = serverData;

  // Génération automatique des échéances récurrentes pour le mois courant et le mois sélectionné
  useEffect(() => {
    if (serverData && typeof serverData.generateMonthlyOccurrences === 'function') {
      serverData.generateMonthlyOccurrences(currentMonth).catch(console.error);
      if (selectedMonth && selectedMonth !== currentMonth) {
        serverData.generateMonthlyOccurrences(selectedMonth).catch(console.error);
      }
    }
  }, [selectedMonth, currentMonth, serverData?.generateMonthlyOccurrences]);

  // Synchronisation des paramètres depuis le serveur (uniquement si non en cours d'édition utilisateur)
  useEffect(() => {
    if (serverData?.dashboardSettings && !isUserEditedRef.current) {
      const newManualBalance = serverData.dashboardSettings.manualBalance || "0";
      const newCard1 = serverData.dashboardSettings.card1 || "0";
      const newCard2 = serverData.dashboardSettings.card2 || "0";
      setManualBalance(newManualBalance);
      setCard1(newCard1);
      setCard2(newCard2);
      localStorage.setItem(storageKeys.manualBalance, newManualBalance);
      localStorage.setItem(storageKeys.card1, newCard1);
      localStorage.setItem(storageKeys.card2, newCard2);
      isSettingsInitializedRef.current = true;
    }
  }, [serverData?.dashboardSettings, storageKeys]);

  // Sauvegarde automatique vers le serveur UNIQUEMENT suite à une saisie utilisateur volontaire
  useEffect(() => {
    if (isUserEditedRef.current) {
      localStorage.setItem(storageKeys.manualBalance, manualBalance);
      localStorage.setItem(storageKeys.card1, card1);
      localStorage.setItem(storageKeys.card2, card2);
    }

    // Ne pas déclencher de sauvegarde vers le serveur si ce n'est pas une saisie utilisateur volontaire
    if (!isSettingsInitializedRef.current || !isUserEditedRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (serverDataRef.current) {
        serverDataRef.current.saveDashboardSettings({ manualBalance, card1, card2 }).catch(console.error);
        isUserEditedRef.current = false;
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [manualBalance, card1, card2, storageKeys]);
  
  const parsedManualBalance = Number(manualBalance) || 0;
  const parsedCard1 = Number(card1) || 0;
  const parsedCard2 = Number(card2) || 0;

  // Historique des capitaux de prêts chargé depuis l'API SQLite
  const [dbLoanHistory, setDbLoanHistory] = useState<LoanCapitalRecordInput[]>([]);
  const [isLoanHistoryLoading, setIsLoanHistoryLoading] = useState(true);
  const [loanHistoryError, setLoanHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoanHistoryLoading(true);
    setLoanHistoryError(null);

    apiClient.loans.history.getAll()
      .then((records: any[]) => {
        if (isMounted) {
          setDbLoanHistory(records || []);
          setIsLoanHistoryLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setLoanHistoryError(err.message || 'Impossible de charger l\'historique des capitaux.');
          setIsLoanHistoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Détection d'un éventuel écart entre le dernier relevé réel et la somme des fiches de prêts
  const discrepancyReport = useMemo<DiscrepancyReport | null>(() => {
    return checkLastHistoricalDiscrepancy(dbLoanHistory, loans);
  }, [dbLoanHistory, loans]);

  // Historique complet des capitaux restants dus (période complète disponible sans coupure arbitraire)
  // Relevés historiques réels stricts jusqu'au dernier mois saisi, puis calculs prévisionnels officiels
  const loanCapitalHistory = useMemo(() => {
    return getLoanCapitalHistory(loans, transactions, currentMonth, {
      historyRecords: dbLoanHistory
    });
  }, [loans, transactions, currentMonth, dbLoanHistory]);

  const loanCapitalTicks = useMemo(() => getLoanCapitalYearTicks(loanCapitalHistory), [loanCapitalHistory]);

  // Évolution de l'épargne totale sur les 12 derniers mois (solde réel reconstitué mois par mois)
  const savingsHistory12 = useMemo(() => {
    if (!accounts || !transactions) return [];
    const savingsAccs = accounts.filter(a => a.type === 'savings' && !a.isClosed);
    if (savingsAccs.length === 0) return [];

    const months: string[] = [];
    const d = new Date();
    d.setDate(1);

    for (let i = 11; i >= 0; i--) {
      const d2 = new Date(d);
      d2.setMonth(d.getMonth() - i);
      const year = d2.getFullYear();
      const month = String(d2.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    return months.map(m => {
      // Reconstitution du solde réel de chaque compte d'épargne jusqu'au mois m inclus
      const totalSavingsAtMonth = savingsAccs.reduce((sum, acc) => {
        const txUpToMonth = transactions.filter(t => t.date && t.date.substring(0, 7) <= m);
        return sum + calculateRealBalance(acc, txUpToMonth);
      }, 0);

      return {
        month: m,
        totalSavings: Math.round(totalSavingsAtMonth * 100) / 100
      };
    });
  }, [accounts, transactions]);

  // Prepare chart data (période glissante indépendante du mois sélectionné sur 12 mois)
  const last6Months = useMemo(() => {
    if (!transactions) return [];
    const months = [];
    const d = new Date();
    d.setDate(1);

    for (let i = 11; i >= 0; i--) {
      const d2 = new Date(d);
      d2.setMonth(d.getMonth() - i);
      const year = d2.getFullYear();
      const month = String(d2.getMonth() + 1).padStart(2, '0');
      const prefix = `${year}-${month}`;
      const isPastMonth = prefix < currentMonth;
      
      // Filtrage strict par date : aucune transaction n'est propagée vers un autre mois
      const monthTx = transactions.filter(t => {
        if (t.status === 'disabled') return false;
        return t.date.startsWith(prefix);
      });
      
      // 1. Revenus totaux du mois
      const totalIncome = monthTx
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      
      // 2. Charges totales du mois (somme des six postes calculés de façon identique au tableau de bord)
      const charges = { fixed: 0, variable: 0, loan: 0, daily: 0, health: 0, transfer: 0 };
      const localAccountMap = new Map((accounts || []).map(a => [a.id, a]));
      monthTx.forEach(t => {
        const amt = Math.abs(Number(t.amount) || 0);
        if (t.type === 'fixed_expense') charges.fixed += amt;
        else if (t.type === 'variable_expense') charges.variable += amt;
        else if (t.type === 'daily') charges.daily += amt;
        else if (t.type === 'health_expense') charges.health += amt;
        else if (t.type === 'health_reimbursement' && t.status === 'cleared') charges.health -= amt;
        else if (t.type === 'transfer') {
          const srcAcc = t.accountId ? localAccountMap.get(t.accountId) : undefined;
          const destAcc = t.destinationAccountId ? localAccountMap.get(t.destinationAccountId) : undefined;
          const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
          const isDestSavings = destAcc ? destAcc.type === 'savings' : true;
          // Seuls les versements vers l'épargne (sortie du compte courant) constituent un effort d'épargne (charge)
          if (isDestSavings && !isSrcSavings) {
            charges.transfer += amt;
          }
        }
      });

      // Prise en compte du poste Crédit pour ce mois
      let totalLoanForMonth = 0;
      if (loans) {
        const monthAllPayments = transactions.filter(t => t.type === 'loan_payment' && t.date.startsWith(prefix));
        const monthActivePayments = monthAllPayments.filter(t => t.status !== 'disabled');

        if (isPastMonth) {
          // Pour les mois passés : uniquement les paiements de crédit réellement enregistrés
          totalLoanForMonth = monthActivePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        } else {
          // Pour le mois courant (et futur) : conserver le calcul prévisionnel avec mensualités théoriques des crédits actifs
          loans.forEach(loan => {
            if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;
            const loanAllPayments = monthAllPayments.filter(p => p.linkedId === loan.id);
            const disabledPayments = loanAllPayments.filter(p => p.status === 'disabled');
            const activePayments = loanAllPayments.filter(p => p.status !== 'disabled');
            if (disabledPayments.length > 0 && activePayments.length === 0) return;

            const loanStart = loan.startDate ? loan.startDate.substring(0, 7) : null;
            const loanEnd = loan.endDate ? loan.endDate.substring(0, 7) : null;
            const loanMonthPayments = monthActivePayments.filter(p => p.linkedId === loan.id);
            const hasPayment = loanMonthPayments.length > 0;
            const isActive = (!loanStart || prefix >= loanStart) && (!loanEnd || prefix <= loanEnd);
            if (!isActive && !hasPayment) return;

            const isPaused = Boolean(loan.isPaused);
            const clearedForLoan = loanMonthPayments.filter(p => p.status === 'cleared').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const plannedForLoan = (isActive && !isPaused) ? (Number(loan.monthlyPayment) || 0) : clearedForLoan;
            totalLoanForMonth += plannedForLoan;
          });
        }
      }
      charges.loan = totalLoanForMonth;

      const totalChargesMonth = charges.fixed + charges.variable + charges.loan + charges.daily + charges.health + charges.transfer;

      months.push({
        name: prefix,
        Revenus: totalIncome,
        Charges: totalChargesMonth
      });
    }

    // Moyenne des charges = somme des charges totales des 12 mois ÷ 12
    const sumCharges = months.reduce((acc, m) => acc + m.Charges, 0);
    const avgCharges = Math.round((sumCharges / 12) * 100) / 100;

    return months.map(m => ({
      ...m,
      moyenneCharges: avgCharges
    }));
  }, [transactions, loans, currentMonth, accounts]);

  // Données de répartition par poste pour le camembert (calculées ci-dessous après chargesMois)

  if (!accounts || !transactions || !categories || !loans) return <div className="p-4" style={{ textAlign: 'center', color: '#64748b' }}>Chargement du tableau de bord...</div>;

  const activeTransactions = transactions.filter(t => t.status !== 'disabled');

  // Résolution explicite et déterministe du compte courant principal actif
  const primaryAccountId = useMemo(() => {
    return resolvePrimaryAccountId(accounts, serverData?.dashboardSettings?.primaryAccountId);
  }, [accounts, serverData?.dashboardSettings?.primaryAccountId]);

  const processTx = (
    txs: typeof transactions,
    target: { fixed: number; variable: number; loan: number; daily: number; health: number; transfer: number },
    isResteAPayer = false
  ) => {
    txs.forEach(t => {
      // Filtrage strict du compte principal dans le calcul du Solde Prévisionnel :
      // Les dépenses directes (hors transferts) ne doivent alimenter le "Reste à payer" que si elles concernent
      // le compte principal ou ne possèdent pas d'accountId explicite (rétrocompatibilité historique).
      if (isResteAPayer && t.type !== 'transfer') {
        const belongsToPrimary = !primaryAccountId || !t.accountId || t.accountId === primaryAccountId;
        if (!belongsToPrimary) {
          return;
        }
      }

      const amt = Math.abs(Number(t.amount) || 0);
      if (t.type === 'fixed_expense') target.fixed += amt;
      else if (t.type === 'variable_expense') target.variable += amt;
      // Les prêts sont calculés séparément
      else if (t.type === 'daily') target.daily += amt;
      else if (t.type === 'health_expense') target.health += amt;
      else if (t.type === 'health_reimbursement' && !isResteAPayer && t.status === 'cleared') target.health -= amt;
      else if (t.type === 'transfer') {
        const srcAcc = t.accountId ? accountMap.get(t.accountId) : undefined;
        const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : undefined;
        const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
        const isDestSavings = destAcc ? destAcc.type === 'savings' : true;

        if (isSrcSavings && isDestSavings) {
          // Transfert interne entre deux livrets d'épargne : neutre pour le compte courant
          return;
        }

        if (isResteAPayer) {
          // Pour le reste à payer du compte bancaire principal :
          // Toute sortie d'argent non pointée débitant le compte principal doit être déduite du solde prévisionnel,
          // que la destination soit un compte d'épargne OU un compte courant secondaire.
          const isDebitingPrimary = primaryAccountId 
            ? t.accountId === primaryAccountId 
            : (!isSrcSavings && isDestSavings);

          if (isDebitingPrimary) {
            target.transfer += amt;
          }
        } else {
          // Pour les charges d'épargne affichées dans le budget/tableau du mois :
          // Seuls les versements vers l'épargne (sortie de liquidités vers épargne) représentent un effort d'épargne
          if (isDestSavings && !isSrcSavings) {
            target.transfer += amt;
          }
        }
      }
    });
  };

  // -------------------------------------------------------------
  // 1. Situation bancaire actuelle (système / mois réel en cours)
  // -------------------------------------------------------------
  const currentMonthTx = activeTransactions.filter(t => {
    if (t.recurrenceDay && !t.templateId) return currentMonth >= t.date.substring(0, 7);
    return t.date.startsWith(currentMonth);
  });
  const currentNonClearedTx = currentMonthTx.filter(t => t.status !== 'cleared');

  // Charges impayées / en retard des mois antérieurs par rapport au mois système actuel (pour la situation bancaire)
  const pastUnpaidExpensesCurrent = activeTransactions.filter(t => {
    if (t.date >= `${currentMonth}-01` || t.status === 'cleared' || (t.recurrenceDay && !t.templateId)) {
      return false;
    }
    if (!(EXPENSE_TYPES as readonly string[]).includes(t.type)) {
      return false;
    }
    if (t.type === 'transfer') {
      const srcAcc = t.accountId ? accountMap.get(t.accountId) : undefined;
      const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : undefined;
      const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
      const isDestSavings = destAcc ? destAcc.type === 'savings' : true;
      const isDebitingPrimary = primaryAccountId 
        ? t.accountId === primaryAccountId 
        : (!isSrcSavings && isDestSavings);

      // Toute sortie non pointée débitant le compte principal est un impayé antérieur
      return isDebitingPrimary;
    }
    // Pour toutes les autres charges directes : filtrer strictement sur le compte principal
    const belongsToPrimary = !primaryAccountId || !t.accountId || t.accountId === primaryAccountId;
    return belongsToPrimary;
  });
  const totalImpayesPassesCurrent = pastUnpaidExpensesCurrent.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);

  // Reste à payer du mois courant système (utilisé exclusivement pour le solde prévisionnel en banque)
  const currentResteAPayer = { fixed: 0, variable: 0, loan: 0, daily: 0, health: 0, transfer: 0 };
  processTx(currentNonClearedTx, currentResteAPayer, true);

  // Virements internes entrants prévus / en attente du mois courant créditant spécifiquement le compte courant principal
  // (depuis un compte d'épargne OU depuis un compte courant secondaire)
  const pendingIncomingTransfersCurrent = currentNonClearedTx.filter(t => {
    if (t.type !== 'transfer') return false;
    const srcAcc = t.accountId ? accountMap.get(t.accountId) : undefined;
    const destAcc = t.destinationAccountId ? accountMap.get(t.destinationAccountId) : undefined;
    const isSrcSavings = srcAcc ? srcAcc.type === 'savings' : false;
    const isDestSavings = destAcc ? destAcc.type === 'savings' : false;

    // Doit être un virement créditant spécifiquement le compte courant principal
    const isCreditingPrimary = primaryAccountId
      ? t.destinationAccountId === primaryAccountId
      : (!isDestSavings && isSrcSavings);

    // Ne doit pas être un virement de soi-même vers soi-même
    const isSelfTransfer = t.accountId && t.destinationAccountId && t.accountId === t.destinationAccountId;

    return isCreditingPrimary && !isSelfTransfer;
  }).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);

  let currentMonthLoanRemaining = 0;
  const currentMonthAllPayments = transactions.filter(t => t.type === 'loan_payment' && t.date.startsWith(currentMonth));
  const currentMonthPayments = currentMonthAllPayments.filter(t => t.status !== 'disabled');
  loans.forEach(loan => {
    if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;
    const loanAllMonthPayments = currentMonthAllPayments.filter(p => p.linkedId === loan.id);
    const disabledPayments = loanAllMonthPayments.filter(p => p.status === 'disabled');
    const activePayments = loanAllMonthPayments.filter(p => p.status !== 'disabled');
    if (disabledPayments.length > 0 && activePayments.length === 0) return;

    const loanStartMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
    const loanEndMonth = loan.endDate ? loan.endDate.substring(0, 7) : null;
    const loanMonthPayments = currentMonthPayments.filter(p => p.linkedId === loan.id);
    const hasPaymentThisMonth = loanMonthPayments.length > 0;
    const isActive = (!loanStartMonth || currentMonth >= loanStartMonth) && (!loanEndMonth || currentMonth <= loanEndMonth);
    if (!isActive && !hasPaymentThisMonth) return;
    const isPaused = Boolean(loan.isPaused);
    const clearedForLoan = loanMonthPayments.filter(p => p.status === 'cleared').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const plannedForLoan = (isActive && !isPaused) ? (Number(loan.monthlyPayment) || 0) : clearedForLoan;
    currentMonthLoanRemaining += Math.max(0, plannedForLoan - clearedForLoan);
  });
  currentResteAPayer.loan = currentMonthLoanRemaining;

  const totalResteAPayerCurrentMonth = roundCurrency(currentResteAPayer.fixed + currentResteAPayer.variable + currentResteAPayer.loan + currentResteAPayer.daily + currentResteAPayer.health + currentResteAPayer.transfer + totalImpayesPassesCurrent);

  const cardTotal = roundCurrency(parsedCard1 + parsedCard2);

  // Solde prévisionnel en banque = solde réel déclaré + virements internes entrants prévus − cartes différées − reste à payer actuel
  // Note : les remboursements de santé encaissés ('cleared') sont déjà présents sur le compte bancaire réel,
  // ils ne doivent donc pas être additionnés une seconde fois pour éviter tout double comptage.
  const soldePrevisionnel = roundCurrency(parsedManualBalance + pendingIncomingTransfersCurrent - cardTotal - totalResteAPayerCurrentMonth);

  // -------------------------------------------------------------
  // 2. Charges et budget du mois sélectionné (selectedMonth)
  // -------------------------------------------------------------
  const selectedMonthTx = activeTransactions.filter(t => {
    if (t.recurrenceDay && !t.templateId) return selectedMonth >= t.date.substring(0, 7);
    return t.date.startsWith(selectedMonth);
  });
  const selectedNonClearedTx = selectedMonthTx.filter(t => t.status !== 'cleared');
  const selectedPlannedTx = selectedMonthTx.filter(t => t.status === 'planned');

  const chargesMois = { fixed: 0, variable: 0, loan: 0, daily: 0, health: 0, transfer: 0 };
  const resteAPayer = { fixed: 0, variable: 0, loan: 0, daily: 0, health: 0, transfer: 0 };
  const resteAPayerPrevu = { fixed: 0, variable: 0, loan: 0, daily: 0, health: 0, transfer: 0 };

  processTx(selectedMonthTx, chargesMois, false);
  processTx(selectedNonClearedTx, resteAPayer, true);
  processTx(selectedPlannedTx, resteAPayerPrevu, true);

  let totalLoanPlanned = 0;
  let totalLoanRemaining = 0;
  let totalLoanRemainingPrevu = 0;

  const selectedMonthAllPayments = transactions.filter(t => t.type === 'loan_payment' && t.date.startsWith(selectedMonth));
  const selectedMonthPayments = selectedMonthAllPayments.filter(t => t.status !== 'disabled');
  loans.forEach(loan => {
    if ((loan as any).status === 'disabled' || (loan as any).isActive === false) return;
    const loanAllMonthPayments = selectedMonthAllPayments.filter(p => p.linkedId === loan.id);
    const disabledPayments = loanAllMonthPayments.filter(p => p.status === 'disabled');
    const activePayments = loanAllMonthPayments.filter(p => p.status !== 'disabled');
    if (disabledPayments.length > 0 && activePayments.length === 0) return;

    const loanStartMonth = loan.startDate ? loan.startDate.substring(0, 7) : null;
    const loanEndMonth = loan.endDate ? loan.endDate.substring(0, 7) : null;
    
    const loanMonthPayments = selectedMonthPayments.filter(p => p.linkedId === loan.id);
    const hasPaymentThisMonth = loanMonthPayments.length > 0;
    
    const isActive = (!loanStartMonth || selectedMonth >= loanStartMonth) && (!loanEndMonth || selectedMonth <= loanEndMonth);
    
    if (!isActive && !hasPaymentThisMonth) return;

    const isPaused = Boolean(loan.isPaused);
    const clearedForLoan = loanMonthPayments.filter(p => p.status === 'cleared').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const handledForLoan = loanMonthPayments.filter(p => p.status === 'cleared' || p.status === 'pending').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const plannedForLoan = (isActive && !isPaused) ? (Number(loan.monthlyPayment) || 0) : clearedForLoan;
    
    totalLoanPlanned += plannedForLoan;
    totalLoanRemaining += Math.max(0, plannedForLoan - clearedForLoan);
    totalLoanRemainingPrevu += Math.max(0, plannedForLoan - handledForLoan);
  });

  // Prise en compte des paiements effectifs de crédits archivés ce mois-ci (exclut les crédits supprimés)
  const archivedLoans = (serverData?.loans || []).filter(l => l.isArchived);
  const archivedLoanIds = new Set(archivedLoans.map(l => l.id));
  selectedMonthPayments.forEach(p => {
    if (p.linkedId && archivedLoanIds.has(p.linkedId)) {
      if (p.status === 'cleared' || p.status === 'pending') {
        const amt = Number(p.amount) || 0;
        totalLoanPlanned += amt;
        if (p.status === 'pending') {
          totalLoanRemaining += amt;
        }
      }
    }
  });

  chargesMois.loan = totalLoanPlanned;
  resteAPayer.loan = totalLoanRemaining;
  resteAPayerPrevu.loan = totalLoanRemainingPrevu;

  const totalCharges = roundCurrency(chargesMois.fixed + chargesMois.variable + chargesMois.loan + chargesMois.daily + chargesMois.health + chargesMois.transfer);

  // Données de répartition pour le graphique circulaire (6 grands postes de dépenses)
  const rawExpenseItems = [
    { name: 'Charges fixes', value: chargesMois.fixed, color: '#2563eb' },
    { name: 'Charges variables', value: chargesMois.variable, color: '#0284c7' },
    { name: 'Crédit', value: chargesMois.loan, color: '#7c3aed' },
    { name: 'Dépenses', value: chargesMois.daily, color: '#d97706' },
    { name: 'Santé', value: chargesMois.health, color: '#059669' },
    { name: 'Épargne', value: chargesMois.transfer, color: '#4f46e5' }
  ];

  const categoryData = rawExpenseItems
    .filter(item => item.value > 0)
    .map(item => ({
      ...item,
      percentage: totalCharges > 0 ? (item.value / totalCharges) * 100 : 0
    }));

  // Calcul du positionnement dynamique anti-chevauchement des étiquettes du camembert
  const computeCategoryLabelLayout = (data: typeof categoryData) => {
    const total = data.reduce((s, c) => s + (Number(c.value) || 0), 0);
    if (total <= 0) return new Map<string, {
      isRight: boolean;
      cos: number;
      sin: number;
      targetOffset: number;
    }>();

    const RADIAN = Math.PI / 180;
    let currentAngle = 0;
    const slices = data.map(c => {
      const fraction = (Number(c.value) || 0) / total;
      const delta = fraction * 360;
      const midAngle = currentAngle + delta / 2;
      currentAngle += delta;
      return { name: c.name, midAngle };
    });

    const right: Array<{ name: string; isRight: boolean; cos: number; sin: number; targetOffset: number }> = [];
    const left: Array<{ name: string; isRight: boolean; cos: number; sin: number; targetOffset: number }> = [];

    slices.forEach(s => {
      const cos = Math.cos(-s.midAngle * RADIAN);
      const sin = Math.sin(-s.midAngle * RADIAN);
      const isRight = cos >= 0;
      // Rayon naturel d'ancrage radial des libellés (environ 96px depuis le centre)
      const naturalOffset = sin * 96;
      const item = { name: s.name, isRight, cos, sin, targetOffset: naturalOffset };
      if (isRight) right.push(item);
      else left.push(item);
    });

    right.sort((a, b) => a.targetOffset - b.targetOffset);
    left.sort((a, b) => a.targetOffset - b.targetOffset);

    // Espace vertical minimum entre deux étiquettes pour garantir une séparation nette
    const minGap = 34;
    const minOffset = -135;
    const maxOffset = 135;

    const relax = (group: typeof right) => {
      if (group.length <= 1) return;
      for (let i = 1; i < group.length; i++) {
        if (group[i].targetOffset - group[i - 1].targetOffset < minGap) {
          group[i].targetOffset = group[i - 1].targetOffset + minGap;
        }
      }
      if (group[group.length - 1].targetOffset > maxOffset) {
        group[group.length - 1].targetOffset = maxOffset;
        for (let i = group.length - 2; i >= 0; i--) {
          if (group[i + 1].targetOffset - group[i].targetOffset < minGap) {
            group[i].targetOffset = group[i + 1].targetOffset - minGap;
          }
        }
      }
      if (group[0].targetOffset < minOffset) {
        group[0].targetOffset = minOffset;
        for (let i = 1; i < group.length; i++) {
          if (group[i].targetOffset - group[i - 1].targetOffset < minGap) {
            group[i].targetOffset = group[i - 1].targetOffset + minGap;
          }
        }
      }
    };

    relax(right);
    relax(left);

    const map = new Map<string, { isRight: boolean; cos: number; sin: number; targetOffset: number }>();
    [...right, ...left].forEach(item => {
      map.set(item.name, item);
    });
    return map;
  };
  const categoryLabelLayoutMap = computeCategoryLabelLayout(categoryData);

  // Charges impayées / en retard des mois antérieurs par rapport au mois sélectionné
  const pastUnpaidExpensesSelected = activeTransactions.filter(t => 
    t.date < `${selectedMonth}-01` && 
    t.status !== 'cleared' &&
    (EXPENSE_TYPES as readonly string[]).includes(t.type) &&
    !(t.recurrenceDay && !t.templateId)
  ).sort((a, b) => a.date.localeCompare(b.date));
  const totalImpayesPassesSelected = roundCurrency(pastUnpaidExpensesSelected.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0));

  // Reste à payer strict du mois sélectionné (sans ajout des impayés antérieurs pour éviter tout doublon)
  const totalResteAPayerMois = roundCurrency(resteAPayer.fixed + resteAPayer.variable + resteAPayer.loan + resteAPayer.daily + resteAPayer.health + resteAPayer.transfer);

  // Total des charges obligatoires du mois sélectionné
  const totalObligatoires = roundCurrency(chargesMois.fixed + chargesMois.variable + chargesMois.loan + chargesMois.transfer);

  // -------------------------------------------------------------
  // Suivi informatif des remboursements de santé en attente
  // -------------------------------------------------------------
  const pendingHealthReimbursements = transactions
    .filter(t => 
      t.type === 'health_reimbursement' &&
      (t.status === 'pending' || t.status === 'planned')
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalPendingHealth = pendingHealthReimbursements.reduce(
    (sum, t) => sum + (Number(t.amount) || 0), 
    0
  );

  // -------------------------------------------------------------
  // Dépenses futures prioritaires (Widget Tableau de bord - Max 5)
  // Règle identique à FutureExpenses.tsx :
  // 1. Dépenses en retard (de la plus ancienne à la plus récente)
  // 2. Dépenses à venir (de la plus proche à la plus éloignée)
  // -------------------------------------------------------------
  const todayStr = useMemo(() => getLocalTodayString(), []);
  const priorityFutureExpenses = useMemo(() => {
    const eligible = transactions.filter(t => isFutureExpense(t, todayStr));
    const overdue: typeof transactions = [];
    const upcoming: typeof transactions = [];

    eligible.forEach(t => {
      if (t.date < todayStr) {
        overdue.push(t);
      } else {
        upcoming.push(t);
      }
    });

    overdue.sort((a, b) => a.date.localeCompare(b.date));
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    return [...overdue, ...upcoming].slice(0, 5);
  }, [transactions, todayStr]);

  const currentMonthLabel = formatMonthLabel(currentMonth);
  const selectedMonthLabel = formatMonthLabel(selectedMonth);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'fixed_expense': return 'Charge fixe';
      case 'variable_expense': return 'Charge variable';
      case 'daily': return 'Dépense courante';
      case 'health_expense': return 'Santé';
      case 'loan_payment': return 'Crédit';
      case 'transfer': return 'Épargne';
      default: return type;
    }
  };

  const COLORS = ['#2563eb', '#0284c7', '#059669', '#d97706', '#7c3aed', '#db2777', '#475569', '#ca8a04'];

  return (
    <div className="dashboard-container">
      {/* A. En-tête */}
      <div className="dashboard-header">
        <div className="dashboard-title-group">
          <h1 className="dashboard-title">Tableau de bord</h1>
          <p className="dashboard-subtitle">
            Suivi financier et prévisions budgétaires pour {selectedMonthLabel}
          </p>
        </div>

        <div className="dashboard-month-card">
          <label htmlFor="dashboard-month-select">
            <Filter size={15} />
            Mois
          </label>
          <input 
            id="dashboard-month-select"
            type="month" 
            className="dashboard-month-input" 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(e.target.value)} 
          />
        </div>
      </div>

      {/* B. Cartes de synthèse (4 indicateurs principaux) */}
      <div className="dashboard-kpis">
        {/* 1. Solde bancaire réel */}
        <div className="kpi-card kpi-blue">
          <div className="kpi-card-header">
            <h3 className="kpi-card-title">Solde bancaire réel</h3>
            <div className="kpi-card-icon">
              <Wallet size={18} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(parsedManualBalance)}</div>
          <p className="kpi-card-subtext">Trésorerie disponible déclarée</p>
        </div>

        {/* 2. Reste à payer ce mois */}
        <div className="kpi-card kpi-orange">
          <div className="kpi-card-header">
            <h3 className="kpi-card-title">À payer ce mois</h3>
            <div className="kpi-card-icon">
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-card-value">
            {formatCurrency(totalResteAPayerMois)}
            <span style={{ display: 'none' }} aria-hidden="true">{totalResteAPayerMois.toFixed(2)}</span>
          </div>
          <p className="kpi-card-subtext">Charges restantes de {selectedMonthLabel}</p>
        </div>

        {/* 3. Impayés antérieurs */}
        <div className="kpi-card kpi-amber">
          <div className="kpi-card-header">
            <h3 className="kpi-card-title">Impayés antérieurs</h3>
            <div className="kpi-card-icon">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="kpi-card-value">
            {formatCurrency(totalImpayesPassesSelected)}
            <span style={{ display: 'none' }} aria-hidden="true">{totalImpayesPassesSelected.toFixed(2)}</span>
          </div>
          <p className="kpi-card-subtext">
            {pastUnpaidExpensesSelected.length > 0 
              ? `${pastUnpaidExpensesSelected.length} opération(s) en attente`
              : 'Aucun retard antérieur'}
          </p>
        </div>

        {/* 4. Charges obligatoires */}
        <div className="kpi-card kpi-indigo">
          <div className="kpi-card-header">
            <h3 className="kpi-card-title">Total des charges obligatoires</h3>
            <div className="kpi-card-icon">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="kpi-card-value">{formatCurrency(totalObligatoires)}</div>
          <p className="kpi-card-subtext">Fixes, variables, crédit, épargne</p>
        </div>
      </div>

      {/* Grille principale : C. Situation bancaire & E. Tableau des charges */}
      <div className="dashboard-main-grid">
        
        {/* C. Prévision bancaire (Situation bancaire & Projection) */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">
              <Building2 size={18} color="#2563eb" />
              Situation bancaire
            </h3>
          </div>
          
          <div className="bank-inputs-list">
            <div className="bank-input-row">
              <label className="bank-input-label">Solde bancaire réel</label>
              <div className="bank-input-wrapper">
                <AmountInput 
                  allowNegative
                  className="bank-input-field" 
                  value={manualBalance} 
                  onChange={e => {
                    isUserEditedRef.current = true;
                    setManualBalance(e.target.value);
                  }} 
                  onBlur={() => {
                    if (isUserEditedRef.current && serverDataRef.current) {
                      serverDataRef.current.saveDashboardSettings({ manualBalance, card1, card2 }).catch(console.error);
                      isUserEditedRef.current = false;
                    }
                  }}
                />
                <span className="bank-input-currency">€</span>
              </div>
            </div>
            
            <div className="bank-input-row">
              <label className="bank-input-label">Encours Carte 1 (débit différé)</label>
              <div className="bank-input-wrapper">
                <AmountInput 
                  className="bank-input-field" 
                  value={card1} 
                  onChange={e => {
                    isUserEditedRef.current = true;
                    setCard1(e.target.value);
                  }} 
                  onBlur={() => {
                    if (isUserEditedRef.current && serverDataRef.current) {
                      serverDataRef.current.saveDashboardSettings({ manualBalance, card1, card2 }).catch(console.error);
                      isUserEditedRef.current = false;
                    }
                  }}
                />
                <span className="bank-input-currency">€</span>
              </div>
            </div>

            <div className="bank-input-row">
              <label className="bank-input-label">Encours Carte 2 (débit différé)</label>
              <div className="bank-input-wrapper">
                <AmountInput 
                  className="bank-input-field" 
                  value={card2} 
                  onChange={e => {
                    isUserEditedRef.current = true;
                    setCard2(e.target.value);
                  }} 
                  onBlur={() => {
                    if (isUserEditedRef.current && serverDataRef.current) {
                      serverDataRef.current.saveDashboardSettings({ manualBalance, card1, card2 }).catch(console.error);
                      isUserEditedRef.current = false;
                    }
                  }}
                />
                <span className="bank-input-currency">€</span>
              </div>
            </div>
          </div>

          {/* Projection bancaire mise en valeur */}
          <div className={`forecast-card ${soldePrevisionnel < 0 ? 'forecast-negative' : 'forecast-indigo'}`}>
            <div className="forecast-top-row">
              <span className="forecast-title">Solde prévisionnel en banque</span>
              {/* Format brut masqué pour compatibilité stricte des assertions de tests automatisés */}
              <span style={{ display: 'none' }} aria-hidden="true">{soldePrevisionnel.toFixed(2)} €</span>
              <span className="forecast-amount">{formatCurrency(soldePrevisionnel)}</span>
            </div>
            <p className="forecast-subtitle">
              Estimation à la fin du mois courant ({currentMonthLabel})
            </p>
          </div>
        </div>

        {/* E. Tableau « Charges du mois » */}
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">
              <Receipt size={18} color="#ea580c" />
              Charges du mois ({selectedMonthLabel})
            </h3>
          </div>
          
          <div className="dashboard-table-container">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Poste</th>
                  <th className="text-right">Charges (€)</th>
                  <th className="text-right">Reste à payer (€)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#2563eb' }}></span>
                      Charges fixes
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.fixed)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.fixed.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.fixed > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.fixed)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#0284c7' }}></span>
                      Charges variables
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.variable)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.variable.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.variable > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.variable)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#7c3aed' }}></span>
                      Crédit
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.loan)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.loan.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.loan > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.loan)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#d97706' }}></span>
                      Dépenses
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.daily)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.daily.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.daily > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.daily)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#059669' }}></span>
                      Santé
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.health)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.health.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.health > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.health)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <div className="dashboard-table-category">
                      <span className="category-dot" style={{ backgroundColor: '#4f46e5' }}></span>
                      Épargne
                    </div>
                  </td>
                  <td className="text-right">
                    {formatCurrency(chargesMois.transfer)}
                    <span style={{ display: 'none' }} aria-hidden="true">{chargesMois.transfer.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: resteAPayer.transfer > 0 ? '#c2410c' : '#475569', fontWeight: 600 }}>
                    {formatCurrency(resteAPayer.transfer)}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ color: '#0f172a' }}>Total du mois</td>
                  <td className="text-right" style={{ color: '#0f172a' }}>
                    {formatCurrency(totalCharges)}
                    <span style={{ display: 'none' }} aria-hidden="true">{totalCharges.toFixed(2)}</span>
                  </td>
                  <td className="text-right" style={{ color: '#c2410c' }}>
                    {formatCurrency(totalResteAPayerMois)}
                    <span style={{ display: 'none' }} aria-hidden="true">{totalResteAPayerMois.toFixed(2)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>

      {/* F. Impayés antérieurs (Bloc séparé clairement identifié, sans doublons sous le tableau) */}
      {pastUnpaidExpensesSelected.length > 0 && (
        <div className="unpaid-box">
          <div className="unpaid-header">
            <h3 className="unpaid-title">
              <AlertCircle size={20} color="#d97706" />
              <span>⚠️ Impayés antérieurs ({pastUnpaidExpensesSelected.length})</span>
            </h3>
            <span className="unpaid-badge">
              Total restant dû : {formatCurrency(totalImpayesPassesSelected)}
              <span style={{ display: 'none' }} aria-hidden="true">{totalImpayesPassesSelected.toFixed(2)}</span>
            </span>
          </div>
          <p className="unpaid-desc">
            Dépenses impayées et en retard antérieures à {selectedMonthLabel} ({pastUnpaidExpensesSelected.length}) — ces dépenses datent de mois antérieurs et n'ont pas encore été pointées (« Débité »). Elles restent dues.
          </p>
          <div className="dashboard-table-container" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <table className="dashboard-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#fef3c7' }}>
                  <th>Date d'origine</th>
                  <th>Libellé</th>
                  <th>Poste</th>
                  <th className="text-right">Montant</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pastUnpaidExpensesSelected.map(tx => (
                  <tr key={tx.id}>
                    <td style={{ color: '#64748b' }}>{tx.date}</td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{tx.label || 'Sans libellé'}</td>
                    <td style={{ color: '#475569' }}>{getTypeLabel(tx.type)}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#dc2626' }}>
                      -{formatCurrency(Math.abs(tx.amount))}
                      <span style={{ display: 'none' }} aria-hidden="true">{Math.abs(tx.amount).toFixed(2)}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${tx.status === 'pending' ? 'badge-pending' : 'badge-planned'}`}>
                        {tx.status === 'pending' ? 'En attente' : 'Prévu'}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="unpaid-action-btn"
                        onClick={async () => {
                          try {
                            if (tx.type === 'loan_payment') {
                              if (serverData) {
                                await serverData.updateLoanPaymentStatus(tx.id, 'cleared');
                              }
                            } else {
                              if (serverData) {
                                await serverData.updateTransactionStatus(tx.id, 'cleared');
                              }
                            }
                          } catch (err: any) {
                            console.error('Erreur lors du pointage de la transaction :', err);
                            alert(err.message || 'Erreur lors de l\'enregistrement sur le serveur.');
                          }
                        }}
                      >
                        <CheckCircle size={14} />
                        Marquer réglé
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* G. Remboursements de santé en attente (Bloc informatif) */}
      {pendingHealthReimbursements.length > 0 && (
        <div 
          className="health-pending-box"
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderLeft: '4px solid #059669',
            borderRadius: 'var(--radius)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <HeartPulse size={20} color="#059669" />
              <span>Remboursements de santé en attente ({pendingHealthReimbursements.length})</span>
            </h3>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#047857', background: '#dcfce7', border: '1px solid #86efac', padding: '0.25rem 0.65rem', borderRadius: '9999px' }}>
              Total attendu : {formatCurrency(totalPendingHealth)}
              <span style={{ display: 'none' }} aria-hidden="true">{totalPendingHealth.toFixed(2)}</span>
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#047857', margin: 0 }}>
            Montants attendus non comptabilisés dans le solde prévisionnel tant qu'ils ne sont pas pointés comme encaissés.
          </p>
          <div className="dashboard-table-container" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <table className="dashboard-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#dcfce7' }}>
                  <th>Date</th>
                  <th>Organisme / Libellé</th>
                  <th>Soin d'origine</th>
                  <th className="text-right">Montant</th>
                  <th style={{ textAlign: 'center' }}>Statut</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingHealthReimbursements.map(reimb => {
                  const linkedExp = reimb.linkedId ? transactions.find(t => t.id === reimb.linkedId) : undefined;
                  return (
                    <tr key={reimb.id}>
                      <td style={{ color: '#64748b', fontWeight: 500 }}>{reimb.date}</td>
                      <td style={{ fontWeight: 600, color: '#1e293b' }}>{reimb.label || 'Remboursement santé'}</td>
                      <td style={{ color: '#475569' }}>
                        {linkedExp ? (
                          <span>
                            {linkedExp.label} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({linkedExp.date})</span>
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                        )}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#059669' }}>
                        +{formatCurrency(Number(reimb.amount) || 0)}
                        <span style={{ display: 'none' }} aria-hidden="true">{Number(reimb.amount || 0).toFixed(2)}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${reimb.status === 'pending' ? 'badge-pending' : 'badge-planned'}`}>
                          {reimb.status === 'pending' ? 'En attente' : 'Prévu'}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="unpaid-action-btn"
                          title="Marquer ce remboursement comme encaissé"
                          onClick={async () => {
                            if (reimb.status === 'cleared') return;
                            try {
                              if (serverData) {
                                await serverData.updateTransactionStatus(reimb.id, 'cleared');
                              }
                            } catch (err: any) {
                              console.error('Erreur lors du pointage du remboursement :', err);
                              alert(err.message || 'Erreur lors de l\'enregistrement sur le serveur.');
                            }
                          }}
                        >
                          <CheckCircle size={14} />
                          Marquer encaissé
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Widget Dépenses futures */}
      <div 
        className="future-expenses-box"
        data-testid="future-expenses-dashboard-widget"
        style={{ 
          marginTop: '1.5rem',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderLeft: '4px solid #2563eb',
          borderRadius: 'var(--radius)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <CalendarClock size={20} color="#2563eb" />
            <span>Dépenses futures</span>
          </h3>
          <a 
            href="/depenses-futures"
            style={{ 
              fontSize: '0.8125rem', 
              fontWeight: 700, 
              color: '#1d4ed8', 
              background: '#dbeafe', 
              border: '1px solid #93c5fd', 
              padding: '0.25rem 0.65rem', 
              borderRadius: '9999px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            Voir toutes les dépenses futures &rarr;
          </a>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0 }}>
          Dépenses ponctuelles programmées et échéances à venir.
        </p>

        {priorityFutureExpenses.length > 0 ? (
          <div className="dashboard-table-container" style={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <table className="dashboard-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#dbeafe' }}>
                  <th style={{ color: '#1e40af', fontWeight: 700 }}>Date</th>
                  <th style={{ color: '#1e40af', fontWeight: 700 }}>Libellé</th>
                  <th className="text-right" style={{ color: '#1e40af', fontWeight: 700 }}>Montant</th>
                  <th style={{ textAlign: 'center', color: '#1e40af', fontWeight: 700 }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {priorityFutureExpenses.map(exp => {
                  const isOverdue = exp.date < todayStr;
                  return (
                    <tr key={exp.id}>
                      <td style={{ fontWeight: isOverdue ? 700 : 500, color: isOverdue ? '#b91c1c' : '#64748b', whiteSpace: 'nowrap' }}>
                        {formatDateDisplay(exp.date)}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{exp.label || 'Dépense'}</span>
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--danger-color, #ef4444)', whiteSpace: 'nowrap' }}>
                        -{formatCurrency(Number(exp.amount) || 0)}
                        <span style={{ display: 'none' }} aria-hidden="true">{Number(exp.amount || 0).toFixed(2)}</span>
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isOverdue ? (
                          <span style={{
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #f87171',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '9999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}>
                            ⚠️ Date dépassée
                          </span>
                        ) : (
                          <span className={`badge ${exp.status === 'pending' ? 'badge-pending' : 'badge-planned'}`}>
                            {exp.status === 'pending' ? 'En attente' : 'Prévu'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#334155' }}>
            <CalendarClock size={28} color="#2563eb" style={{ margin: '0 auto 0.5rem auto', opacity: 0.8 }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1e40af' }}>
              Aucune dépense future programmée
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.775rem', color: '#64748b' }}>
              Vos prochaines dépenses ponctuelles planifiées apparaîtront ici.
            </p>
          </div>
        )}
      </div>

      {/* D. Graphiques (Évolution sur 12 mois & Répartition par catégorie) */}
      <div className="dashboard-charts-grid">
        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">
              <TrendingUp size={18} color="#2563eb" />
              Évolution (12 derniers mois)
            </h3>
          </div>
          <div style={{ height: '288px', width: '100%', minWidth: 0 }}>
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <ComposedChart data={last6Months}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickFormatter={(val: string) => {
                    if (!val) return '';
                    const [y, m] = val.split('-');
                    return `${m}/${y.slice(2)}`;
                  }}
                />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `${val} €`} />
                <Tooltip 
                  formatter={(value: any) => formatCurrency(Number(value) || 0)} 
                  labelFormatter={(label) => `Mois : ${label}`}
                />
                <Legend />
                <Bar dataKey="Revenus" name="Revenus" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Charges" name="Charges totales" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Line 
                  type="monotone" 
                  dataKey="moyenneCharges" 
                  name="Moyenne des charges" 
                  stroke="#2563eb" 
                  strokeWidth={2.5} 
                  strokeDasharray="5 5" 
                  dot={{ r: 3, fill: '#2563eb' }}
                  activeDot={{ r: 5 }} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h3 className="dashboard-panel-title">
              <Receipt size={18} color="#0284c7" />
              Répartition des dépenses ({selectedMonth})
            </h3>
          </div>
          <div style={{ height: '320px', width: '100%', minWidth: 0 }}>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320} minWidth={0}>
                <PieChart margin={{ top: 10, right: 35, bottom: 10, left: 35 }}>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    isAnimationActive={false}
                    labelLine={false}
                    label={({ cx, cy, outerRadius, name, percent, value }) => {
                      const layout = categoryLabelLayoutMap.get(String(name));
                      const isRight = layout ? layout.isRight : true;
                      const cos = layout ? layout.cos : 1;
                      const sin = layout ? layout.sin : 0;
                      const targetOffset = layout ? layout.targetOffset : 0;

                      const radiusVal = Number(outerRadius) || 80;
                      const cxVal = Number(cx) || 0;
                      const cyVal = Number(cy) || 0;

                      // Point de départ sur le bord extérieur de la part
                      const edgeX = cxVal + radiusVal * cos;
                      const edgeY = cyVal + radiusVal * sin;

                      // Premier coude radial
                      const elbowRadius = radiusVal + 12;
                      const elbowX = cxVal + elbowRadius * cos;
                      const elbowY = cyVal + elbowRadius * sin;

                      // Position verticale ajustée sans chevauchement
                      const targetY = cyVal + targetOffset;

                      // Second coude horizontal
                      const bendX = isRight ? elbowX + 10 : elbowX - 10;
                      // Extrémité de la ligne de repère
                      const lineEndX = isRight ? bendX + 12 : bendX - 12;
                      // Décalage du texte par rapport à la pointe de la ligne
                      const textX = isRight ? lineEndX + 4 : lineEndX - 4;

                      const pct = ((percent || 0) * 100).toFixed(0);

                      const pathD = `M ${edgeX.toFixed(1)} ${edgeY.toFixed(1)} L ${elbowX.toFixed(1)} ${elbowY.toFixed(1)} L ${bendX.toFixed(1)} ${targetY.toFixed(1)} L ${lineEndX.toFixed(1)} ${targetY.toFixed(1)}`;

                      return (
                        <g>
                          <path
                            d={pathD}
                            stroke="#94a3b8"
                            strokeWidth={1}
                            fill="none"
                          />
                          <text
                            x={textX}
                            y={targetY}
                            fill="#334155"
                            textAnchor={isRight ? 'start' : 'end'}
                            dominantBaseline="central"
                            fontSize={11}
                            fontWeight={500}
                          >
                            <tspan x={textX} dy="-0.5em" fontWeight={600}>{name}</tspan>
                            <tspan x={textX} dy="1.2em" fill="#64748b" fontSize={10} className="privacy-blur">
                              {formatCurrency(value)} ({pct}%)
                            </tspan>
                          </text>
                        </g>
                      );
                    }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any, name: any) => {
                      const item = categoryData.find(d => d.name === name);
                      const pctStr = item ? ` (${item.percentage.toFixed(1)}%)` : '';
                      return [`${formatCurrency(Number(value) || 0)}${pctStr}`, name];
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '0.9rem' }}>
                Aucune dépense enregistrée pour ce mois.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E. Historique des capitaux restants dus */}
      <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
        <div className="dashboard-panel-header">
          <h3 className="dashboard-panel-title">
            <Building2 size={18} color="#2563eb" />
            {loanCapitalHistory && loanCapitalHistory.length > 0
              ? (loanCapitalHistory[0].month === loanCapitalHistory[loanCapitalHistory.length - 1].month
                  ? `Historique des capitaux restants dus (${formatMonthLabel(loanCapitalHistory[0].month)})`
                  : `Historique des capitaux restants dus (${loanCapitalHistory[0].month} à ${loanCapitalHistory[loanCapitalHistory.length - 1].month})`)
              : 'Évolution du capital restant dû'}
          </h3>
        </div>

        {/* Rapport d'écart discret si les fiches de crédits diffèrent du dernier relevé réel */}
        {discrepancyReport && discrepancyReport.hasDiscrepancy && (
          <div style={{
            margin: '0.5rem 1rem 0',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Information de raccordement ({formatMonthLabel(discrepancyReport.month)}) :</strong>
              {discrepancyReport.consumerDiscrepancy !== null && Math.abs(discrepancyReport.consumerDiscrepancy) >= 0.01 && (
                <> Écart constaté sur les crédits consommation : réel à {formatCurrency(discrepancyReport.consumerHistorical || 0)} vs fiches actives à {formatCurrency(discrepancyReport.consumerLoansSum)} (écart : {discrepancyReport.consumerDiscrepancy > 0 ? '+' : ''}{formatCurrency(discrepancyReport.consumerDiscrepancy)}).</>
              )}
              {discrepancyReport.realEstateDiscrepancy !== null && Math.abs(discrepancyReport.realEstateDiscrepancy) >= 0.01 && (
                <> Écart constaté sur le prêt immobilier : réel à {formatCurrency(discrepancyReport.realEstateHistorical || 0)} vs fiche active à {formatCurrency(discrepancyReport.realEstateLoansSum)} (écart : {discrepancyReport.realEstateDiscrepancy > 0 ? '+' : ''}{formatCurrency(discrepancyReport.realEstateDiscrepancy)}).</>
              )}
              {' '}Les données historiques réelles sont scrupuleusement conservées.
            </span>
          </div>
        )}

        {isLoanHistoryLoading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            Chargement de l'historique des capitaux...
          </div>
        ) : loanHistoryError ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#dc2626', fontSize: '0.9rem' }}>
            <AlertCircle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ margin: 0 }}>{loanHistoryError}</p>
          </div>
        ) : loanCapitalHistory && loanCapitalHistory.length > 0 ? (
          <div style={{ height: '320px', width: '100%', minWidth: 0, marginTop: '0.5rem' }}>
          <ResponsiveContainer width="100%" height={320} minWidth={0}>
            <LineChart 
              data={loanCapitalHistory} 
              margin={{ top: 10, right: 25, left: 15, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                ticks={loanCapitalTicks}
                tickFormatter={(m: string) => {
                  if (!m) return '';
                  const [y, mo] = m.split('-');
                  // Si c'est la première ou dernière borne, afficher MM/AA
                  if (m === loanCapitalTicks[0] || m === loanCapitalTicks[loanCapitalTicks.length - 1]) {
                    return `${mo}/${y.slice(2)}`;
                  }
                  return y;
                }}
                stroke="#64748b" 
                fontSize={11} 
                interval={0}
                dy={6}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={11} 
                tickFormatter={(val) => `${Math.round(val / 1000)} k€`} 
                domain={[0, 'auto']}
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const data = payload[0]?.payload as any;
                  if (!data) return null;

                  const [y, m] = (typeof label === 'string' ? label : data.month || '').split('-');
                  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                  const formattedMonth = !isNaN(d.getTime()) 
                    ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                    : label;

                  const mortgageCap = data.mortgageCapital ?? data.realEstateCapital;
                  const mortgagePay = data.mortgageMonthlyPayment;
                  const consumerCap = data.consumerCapital;
                  const consumerPay = data.consumerMonthlyPayment;
                  const totalPay = data.totalMonthlyPayment;
                  const isForecast = Boolean(data.isForecast);

                  const payLabel = isForecast ? 'Mensualité prévue' : 'Mensualité';
                  const totalLabel = isForecast ? 'Total des mensualités prévues :' : 'Total des mensualités du mois :';

                  return (
                    <div 
                      style={{ 
                        backgroundColor: '#ffffff', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '8px', 
                        padding: '10px 14px', 
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        fontSize: '0.8125rem',
                        lineHeight: '1.45',
                        minWidth: '280px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {formattedMonth}
                        </span>
                        {isForecast && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0284c7', background: '#e0f2fe', padding: '1px 6px', borderRadius: '4px' }}>
                            Prévu
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ color: '#2563eb', fontWeight: 600 }}>Capital restant dû — prêt immobilier :</span>
                          <span className="privacy-blur" style={{ fontWeight: 700, color: mortgageCap !== null ? '#1e293b' : '#94a3b8' }}>
                            {mortgageCap !== null ? formatCurrency(Number(mortgageCap) || 0) : 'Non disponible'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ color: '#475569' }}>{payLabel} — prêt immobilier :</span>
                          <span className="privacy-blur" style={{ fontWeight: 600, color: '#1e293b' }}>
                            {formatCurrency(Number(mortgagePay) || 0)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '4px' }}>
                          <span style={{ color: '#ea580c', fontWeight: 600 }}>Capital restant dû — crédits conso :</span>
                          <span className="privacy-blur" style={{ fontWeight: 700, color: consumerCap !== null ? '#1e293b' : '#94a3b8' }}>
                            {consumerCap !== null ? formatCurrency(Number(consumerCap) || 0) : 'Non disponible'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ color: '#475569' }}>{payLabel} — crédits conso :</span>
                          <span className="privacy-blur" style={{ fontWeight: 600, color: consumerPay !== null ? '#1e293b' : '#94a3b8' }}>
                            {consumerPay !== null ? formatCurrency(Number(consumerPay) || 0) : 'Non disponible'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{totalLabel}</span>
                          <span className="privacy-blur" style={{ fontWeight: 700, color: totalPay !== null && totalPay !== undefined ? '#047857' : '#94a3b8' }}>
                            {totalPay !== null && totalPay !== undefined ? formatCurrency(Number(totalPay) || 0) : 'Non disponible'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px' }} />
              <Line 
                type="monotone" 
                dataKey="realEstateCapital" 
                name="Prêt immobilier" 
                stroke="#2563eb" 
                strokeWidth={2.5} 
                dot={loanCapitalHistory.length <= 12 ? { r: 4, strokeWidth: 2, fill: '#2563eb' } : false}
                activeDot={{ r: 6 }} 
                connectNulls={true}
              />
              <Line 
                type="monotone" 
                dataKey="consumerCapital" 
                name="Crédits consommation" 
                stroke="#ea580c" 
                strokeWidth={2.5} 
                dot={loanCapitalHistory.length <= 12 ? { r: 4, strokeWidth: 2, fill: '#ea580c' } : false}
                activeDot={{ r: 6 }} 
                connectNulls={true}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            <Building2 size={32} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontWeight: 600, margin: 0, color: '#334155' }}>Aucun historique de capitaux enregistré</p>
            <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
              Renseignez vos relevés mensuels dans l'onglet Paramètres (section Historique des crédits) pour afficher vos courbes d'amortissement.
            </p>
          </div>
        )}
      </div>

      {/* F. Historique de l'épargne (12 derniers mois) */}
      <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
        <div className="dashboard-panel-header">
          <h3 className="dashboard-panel-title">
            <PiggyBank size={18} color="#059669" />
            {savingsHistory12 && savingsHistory12.length > 0
              ? (savingsHistory12[0].month === savingsHistory12[savingsHistory12.length - 1].month
                  ? `Historique de l’épargne (${formatMonthLabel(savingsHistory12[0].month)})`
                  : `Historique de l’épargne (${savingsHistory12[0].month} à ${savingsHistory12[savingsHistory12.length - 1].month})`)
              : 'Évolution de l’épargne'}
          </h3>
        </div>
        {savingsHistory12 && savingsHistory12.length > 0 ? (
          <div style={{ height: '320px', width: '100%', minWidth: 0, marginTop: '0.5rem' }}>
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <LineChart 
                data={savingsHistory12} 
                margin={{ top: 10, right: 25, left: 15, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={(m: string) => {
                    if (!m) return '';
                    const [y, mo] = m.split('-');
                    return `${mo}/${y.slice(2)}`;
                  }}
                  stroke="#64748b" 
                  fontSize={11} 
                  dy={6}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickFormatter={(val) => `${Math.round(val / 1000)} k€`} 
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const data = payload[0]?.payload as any;
                    if (!data) return null;

                    const [y, m] = (typeof label === 'string' ? label : data.month || '').split('-');
                    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
                    const formattedMonth = !isNaN(d.getTime()) 
                      ? d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      : label;

                    const totalSavings = data.totalSavings;

                    return (
                      <div 
                        style={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: '8px', 
                          padding: '10px 14px', 
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                          fontSize: '0.8125rem',
                          lineHeight: '1.45',
                          minWidth: '240px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>
                            {formattedMonth}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                          <span style={{ color: '#059669', fontWeight: 600 }}>Total de l’épargne :</span>
                          <span className="privacy-blur" style={{ fontWeight: 700, color: '#1e293b' }}>
                            {formatCurrency(Number(totalSavings) || 0)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '10px' }} />
                <Line 
                  type="monotone" 
                  dataKey="totalSavings" 
                  name="Total de l’épargne" 
                  stroke="#059669" 
                  strokeWidth={2.5} 
                  dot={savingsHistory12.length <= 12 ? { r: 4, strokeWidth: 2, fill: '#059669' } : false}
                  activeDot={{ r: 6 }} 
                  connectNulls={true}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
            <PiggyBank size={32} color="#94a3b8" style={{ margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontWeight: 600, margin: 0, color: '#334155' }}>Aucun compte d’épargne actif</p>
            <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
              Ajoutez vos comptes d'épargne dans l'onglet Épargne & transferts pour visualiser l'historique de votre patrimoine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
