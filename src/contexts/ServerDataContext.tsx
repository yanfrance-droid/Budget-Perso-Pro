import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import type { Account, Category, Transaction, Loan, RecurrenceTemplate, IncomePayer } from '../db/database';
import { useAuth } from './AuthContext';

export interface DashboardSettings {
  manualBalance: string;
  card1: string;
  card2: string;
  primaryAccountId?: string;
}

export interface ServerDataContextType {
  accounts: Account[];
  categories: Category[];
  incomePayers: IncomePayer[];
  transactions: Transaction[];
  loans: Loan[];
  recurrenceTemplates: RecurrenceTemplate[];
  dashboardSettings: DashboardSettings;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
  refreshAll: () => Promise<void>;
  
  // Opérations d'écriture sur le serveur SQLite
  saveAccount: (account: Partial<Account>) => Promise<Account>;
  deleteAccount: (id: string) => Promise<void>;
  saveCategory: (category: Partial<Category>) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
  saveIncomePayer: (payer: Partial<IncomePayer>) => Promise<IncomePayer>;
  deleteIncomePayer: (id: string) => Promise<void>;
  saveTransaction: (transaction: Partial<Transaction>) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransactionStatus: (id: string, status: Transaction['status']) => Promise<Transaction>;
  saveLoan: (loan: Partial<Loan>) => Promise<Loan>;
  deleteLoan: (id: string) => Promise<void>;
  archiveLoan: (id: string, isArchived: boolean, disableFuturePlanned?: boolean) => Promise<{ loan: Loan; disabledCount: number }>;
  reactivateLoanFuturePlanned: (id: string) => Promise<number>;
  updateLoanPaymentStatus: (paymentId: string, status: Transaction['status']) => Promise<{ payment: Transaction; loan: Loan }>;
  saveRecurrenceTemplate: (template: Partial<RecurrenceTemplate>) => Promise<RecurrenceTemplate>;
  deleteRecurrenceTemplate: (id: string, fromDate?: string) => Promise<void>;
  generateMonthlyOccurrences: (month: string) => Promise<number>;
  saveDashboardSettings: (settings: Partial<DashboardSettings>) => Promise<void>;
}

const ServerDataContext = createContext<ServerDataContextType | undefined>(undefined);

export const ServerDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomePayers, setIncomePayers] = useState<IncomePayer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [recurrenceTemplates, setRecurrenceTemplates] = useState<RecurrenceTemplate[]>([]);
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>({
    manualBalance: '0',
    card1: '0',
    card2: '0'
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const refreshAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    try {
      const [accs, cats, payers, txs, lns, tmpls, settings] = await Promise.all([
        apiClient.accounts.getAll(),
        apiClient.categories.getAll(),
        apiClient.incomePayers.getAll(),
        apiClient.transactions.get(),
        apiClient.loans.getAll(),
        apiClient.recurrence.getAll(),
        apiClient.settings.get()
      ]);

      if (isMounted.current) {
        setAccounts(prev => JSON.stringify(prev) === JSON.stringify(accs) ? prev : accs);
        setCategories(prev => JSON.stringify(prev) === JSON.stringify(cats) ? prev : cats);
        setIncomePayers(prev => JSON.stringify(prev) === JSON.stringify(payers) ? prev : payers);
        setTransactions(prev => JSON.stringify(prev) === JSON.stringify(txs) ? prev : txs);
        setLoans(prev => JSON.stringify(prev) === JSON.stringify(lns) ? prev : lns);
        setRecurrenceTemplates(prev => JSON.stringify(prev) === JSON.stringify(tmpls) ? prev : tmpls);
        setDashboardSettings(prev => {
          const next = {
            manualBalance: settings.manualBalance || '0',
            card1: settings.card1 || '0',
            card2: settings.card2 || '0'
          };
          return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
        });
        setLastSyncTime(new Date());
        setError(null);
      }
    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'Erreur lors de la synchronisation avec le serveur.');
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsSyncing(false);
      }
    }
  }, [isAuthenticated]);

  // Chargement initial quand l'utilisateur est authentifié
  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, refreshAll]);

  // Synchronisation automatique en arrière-plan (toutes les 10 secondes et au focus de la fenêtre)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      refreshAll();
    }, 10000);

    const handleFocus = () => {
      refreshAll();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
    };
  }, [isAuthenticated, refreshAll]);

  // Opérations d'écriture sur le serveur SQLite
  const saveAccount = async (account: Partial<Account>): Promise<Account> => {
    const saved = await apiClient.accounts.save(account);
    setAccounts(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved];
    });
    return saved;
  };

  const deleteAccount = async (id: string): Promise<void> => {
    await apiClient.accounts.delete(id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const saveCategory = async (category: Partial<Category>): Promise<Category> => {
    const saved = await apiClient.categories.save(category);
    setCategories(prev => {
      const idx = prev.findIndex(c => c.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved];
    });
    return saved;
  };

  const deleteCategory = async (id: string): Promise<void> => {
    await apiClient.categories.delete(id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const saveIncomePayer = async (payer: Partial<IncomePayer>): Promise<IncomePayer> => {
    const saved = await apiClient.incomePayers.save(payer);
    setIncomePayers(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved];
    });
    return saved;
  };

  const deleteIncomePayer = async (id: string): Promise<void> => {
    await apiClient.incomePayers.delete(id);
    setIncomePayers(prev => prev.filter(p => p.id !== id));
  };

  const saveTransaction = async (transaction: Partial<Transaction>): Promise<Transaction> => {
    const saved = await apiClient.transactions.save(transaction);
    setTransactions(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [saved, ...prev];
    });
    if (saved.type === 'loan_payment' || transaction.type === 'loan_payment') {
      try {
        const freshLoans = await apiClient.loans.getAll();
        setLoans(freshLoans);
      } catch (err) {
        console.error('Erreur rafraîchissement des crédits après enregistrement mensualité:', err);
      }
    }
    return saved;
  };

  const deleteTransaction = async (id: string): Promise<void> => {
    const target = transactions.find(t => t.id === id);
    await apiClient.transactions.delete(id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    if (target?.type === 'loan_payment') {
      try {
        const freshLoans = await apiClient.loans.getAll();
        setLoans(freshLoans);
      } catch (err) {
        console.error('Erreur rafraîchissement des crédits après suppression mensualité:', err);
      }
    }
  };

  const updateTransactionStatus = async (id: string, status: Transaction['status']): Promise<Transaction> => {
    const updated = await apiClient.transactions.updateStatus(id, status);
    setTransactions(prev => prev.map(t => t.id === id ? updated : t));
    if (updated.type === 'loan_payment') {
      try {
        const freshLoans = await apiClient.loans.getAll();
        setLoans(freshLoans);
      } catch (err) {
        console.error('Erreur rafraîchissement des crédits après mise à jour statut mensualité:', err);
      }
    }
    return updated;
  };

  const saveLoan = async (loan: Partial<Loan>): Promise<Loan> => {
    const saved = await apiClient.loans.save(loan);
    setLoans(prev => {
      const idx = prev.findIndex(l => l.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved];
    });
    return saved;
  };

  const deleteLoan = async (id: string): Promise<void> => {
    await apiClient.loans.delete(id);
    setLoans(prev => prev.filter(l => l.id !== id));
  };

  const archiveLoan = async (id: string, isArchived: boolean, disableFuturePlanned = false): Promise<{ loan: Loan; disabledCount: number }> => {
    const res = isArchived 
      ? await apiClient.loans.archive(id, true, disableFuturePlanned)
      : await apiClient.loans.unarchive(id);
    setLoans(prev => {
      const idx = prev.findIndex(l => l.id === res.loan.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = res.loan;
        return copy;
      }
      return [...prev, res.loan];
    });
    if (res.disabledCount > 0) {
      try {
        const freshTxs = await apiClient.transactions.getAll();
        setTransactions(freshTxs);
      } catch {
        // Ignorer si échec réseau
      }
    }
    return res;
  };

  const reactivateLoanFuturePlanned = async (id: string): Promise<number> => {
    const res = await apiClient.loans.reactivateFuture(id);
    if (res.reactivatedCount > 0) {
      try {
        const freshTxs = await apiClient.transactions.getAll();
        setTransactions(freshTxs);
      } catch {
        // Ignorer si échec réseau
      }
    }
    return res.reactivatedCount;
  };

  const updateLoanPaymentStatus = async (paymentId: string, status: Transaction['status']): Promise<{ payment: Transaction; loan: Loan }> => {
    const result = await apiClient.loans.updatePaymentStatus(paymentId, status);
    setTransactions(prev => prev.map(t => t.id === paymentId ? result.payment : t));
    setLoans(prev => prev.map(l => l.id === result.loan.id ? result.loan : l));
    return result;
  };

  const saveRecurrenceTemplate = async (template: Partial<RecurrenceTemplate>): Promise<RecurrenceTemplate> => {
    const saved = await apiClient.recurrence.save(template);
    setRecurrenceTemplates(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = saved;
        return copy;
      }
      return [...prev, saved];
    });
    return saved;
  };

  const deleteRecurrenceTemplate = async (id: string, fromDate?: string): Promise<void> => {
    await apiClient.recurrence.delete(id, fromDate);
    setRecurrenceTemplates(prev => prev.filter(t => t.id !== id));
    try {
      const freshTxs = await apiClient.transactions.get();
      setTransactions(freshTxs);
    } catch {}
  };

  const generateMonthlyOccurrences = async (month: string): Promise<number> => {
    const res = await apiClient.recurrence.generate(month);
    if (res.generated > 0) {
      // Recharger les transactions si des occurrences ont été générées
      const updatedTxs = await apiClient.transactions.get();
      setTransactions(updatedTxs);
    }
    return res.generated;
  };

  const saveDashboardSettings = async (settings: Partial<DashboardSettings>): Promise<void> => {
    if (!isAuthenticated) return;
    const merged = { ...dashboardSettings, ...settings };
    await apiClient.settings.save(merged);
    setDashboardSettings(merged);
  };

  return (
    <ServerDataContext.Provider
      value={{
        accounts,
        categories,
        incomePayers,
        transactions,
        loans,
        recurrenceTemplates,
        dashboardSettings,
        isLoading,
        isSyncing,
        lastSyncTime,
        error,
        refreshAll,
        saveAccount,
        deleteAccount,
        saveCategory,
        deleteCategory,
        saveIncomePayer,
        deleteIncomePayer,
        saveTransaction,
        deleteTransaction,
        updateTransactionStatus,
        saveLoan,
        deleteLoan,
        archiveLoan,
        reactivateLoanFuturePlanned,
        updateLoanPaymentStatus,
        saveRecurrenceTemplate,
        deleteRecurrenceTemplate,
        generateMonthlyOccurrences,
        saveDashboardSettings
      }}
    >
      {children}
    </ServerDataContext.Provider>
  );
};

export function useServerData(): ServerDataContextType {
  const context = useContext(ServerDataContext);
  if (!context) {
    throw new Error('useServerData doit être utilisé à l\'intérieur d\'un ServerDataProvider');
  }
  return context;
}

export function useServerDataOptional(): ServerDataContextType | null {
  const context = useContext(ServerDataContext);
  return context || null;
}
