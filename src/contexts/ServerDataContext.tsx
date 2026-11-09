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

export interface HistoryAction {
  id: string;
  label: string;
  timestamp: number;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
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
  restoreTransaction: (id: string) => Promise<Transaction>;
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

  // Moteur Undo/Redo universel façon Excel
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  undoFeedback: { message: string; type: 'undo' | 'redo' } | null;
}

const ServerDataContext = createContext<ServerDataContextType | undefined>(undefined);

const MAX_STACK_SIZE = 30;

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

  // Moteur Undo/Redo
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [undoFeedback, setUndoFeedback] = useState<{ message: string; type: 'undo' | 'redo' } | null>(null);
  const feedbackTimerRef = useRef<any>(null);
  const isExecutingHistoryRef = useRef<boolean>(false);

  const isMounted = useRef(true);
  const accountsRef = useRef<Account[]>([]);
  accountsRef.current = accounts;
  const transactionsRef = useRef<Transaction[]>([]);
  transactionsRef.current = transactions;
  const dashboardSettingsRef = useRef<DashboardSettings>(dashboardSettings);
  dashboardSettingsRef.current = dashboardSettings;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const showFeedback = useCallback((message: string, type: 'undo' | 'redo') => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setUndoFeedback({ message, type });
    feedbackTimerRef.current = setTimeout(() => {
      setUndoFeedback(null);
    }, 1500);
  }, []);

  const recordHistoryAction = useCallback((action: Omit<HistoryAction, 'id' | 'timestamp'>) => {
    if (isExecutingHistoryRef.current) return;
    const fullAction: HistoryAction = {
      ...action,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `act-${Date.now()}-${Math.random()}`,
      timestamp: Date.now()
    };
    setUndoStack(prev => [fullAction, ...prev].slice(0, MAX_STACK_SIZE));
    setRedoStack([]); // Toute nouvelle action utilisateur vide la redoStack
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

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isExecutingHistoryRef.current) return;
    isExecutingHistoryRef.current = true;
    try {
      let currentStack = [...undoStack];
      let executedSuccessfully = false;

      while (currentStack.length > 0 && !executedSuccessfully) {
        const actionToUndo = currentStack[0];
        try {
          await actionToUndo.undo();
          const nextStack = currentStack.slice(1);
          setUndoStack(nextStack);
          setRedoStack(prev => [actionToUndo, ...prev].slice(0, MAX_STACK_SIZE));
          showFeedback(`Action annulée : ${actionToUndo.label}`, 'undo');
          executedSuccessfully = true;
        } catch (err: any) {
          console.warn('Action d’annulation en échec ou obsolète (dépilée automatiquement) :', actionToUndo.label, err);
          // Retrait immédiat de l'action défaillante pour débloquer la suite
          currentStack = currentStack.slice(1);
          setUndoStack(currentStack);

          const isNotFound = err?.status === 400 || (err?.message && (
            err.message.includes('introuvable') ||
            err.message.includes('not found') ||
            err.message.includes('400')
          ));

          if (isNotFound) {
            if (currentStack.length === 0) {
              showFeedback(`Action obsolète ignorée (ressource introuvable) : ${actionToUndo.label}`, 'undo');
            }
            // S'il reste des actions dans la pile, la boucle enchaîne directement sur la suivante
          } else {
            showFeedback(`Erreur lors de l'annulation : ${err?.message || actionToUndo.label}`, 'undo');
            break;
          }
        }
      }
    } finally {
      isExecutingHistoryRef.current = false;
    }
  }, [undoStack, showFeedback]);

  const redo = useCallback(async () => {
    if (redoStack.length === 0 || isExecutingHistoryRef.current) return;
    isExecutingHistoryRef.current = true;
    try {
      let currentStack = [...redoStack];
      let executedSuccessfully = false;

      while (currentStack.length > 0 && !executedSuccessfully) {
        const actionToRedo = currentStack[0];
        try {
          await actionToRedo.redo();
          const nextStack = currentStack.slice(1);
          setRedoStack(nextStack);
          setUndoStack(prev => [actionToRedo, ...prev].slice(0, MAX_STACK_SIZE));
          showFeedback(`Action rétablie : ${actionToRedo.label}`, 'redo');
          executedSuccessfully = true;
        } catch (err: any) {
          console.warn('Action de rétablissement en échec ou obsolète (dépilée automatiquement) :', actionToRedo.label, err);
          currentStack = currentStack.slice(1);
          setRedoStack(currentStack);

          const isNotFound = err?.status === 400 || (err?.message && (
            err.message.includes('introuvable') ||
            err.message.includes('not found') ||
            err.message.includes('400')
          ));

          if (isNotFound) {
            if (currentStack.length === 0) {
              showFeedback(`Action obsolète ignorée (ressource introuvable) : ${actionToRedo.label}`, 'redo');
            }
          } else {
            showFeedback(`Erreur lors du rétablissement : ${err?.message || actionToRedo.label}`, 'redo');
            break;
          }
        }
      }
    } finally {
      isExecutingHistoryRef.current = false;
    }
  }, [redoStack, showFeedback]);

  // Écouteur global clavier : Ctrl+Z (Undo) et Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      const target = e.target as HTMLElement | null;
      const isTextInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTextInput) return;

      // Undo: Ctrl+Z (sans shift)
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Y OU Ctrl+Shift+Z
      const isRedoKey = (e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z'));
      if (isRedoKey) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

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
    const previousAccount = account.id ? accountsRef.current.find(a => a.id === account.id) : undefined;
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

    if (previousAccount) {
      const isBalanceChange = previousAccount.initialBalance !== saved.initialBalance;
      const label = isBalanceChange
        ? `Modification solde ${saved.name} (${previousAccount.initialBalance ?? 0} € ➔ ${saved.initialBalance ?? 0} €)`
        : `Modification compte « ${saved.name} »`;

      const prevCopy = { ...previousAccount };
      const savedCopy = { ...saved };
      recordHistoryAction({
        label,
        undo: async () => {
          await apiClient.accounts.save(prevCopy);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.accounts.save(savedCopy);
          await refreshAll();
        }
      });
    } else {
      const savedCopy = { ...saved };
      recordHistoryAction({
        label: `Création compte « ${saved.name} »`,
        undo: async () => {
          await apiClient.accounts.delete(savedCopy.id);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.accounts.save(savedCopy);
          await refreshAll();
        }
      });
    }

    return saved;
  };

  const deleteAccount = async (id: string): Promise<void> => {
    const targetAccount = accountsRef.current.find(a => a.id === id);
    await apiClient.accounts.delete(id);
    setAccounts(prev => prev.filter(a => a.id !== id));

    if (targetAccount) {
      const targetCopy = { ...targetAccount };
      recordHistoryAction({
        label: `Suppression compte « ${targetAccount.name} »`,
        undo: async () => {
          await apiClient.accounts.save(targetCopy);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.accounts.delete(id);
          await refreshAll();
        }
      });
    }
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
    const previousTx = transaction.id ? transactionsRef.current.find(t => t.id === transaction.id) : undefined;
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

    if (previousTx) {
      let label = `Modification opération « ${saved.label || 'Sans libellé'} »`;
      if (previousTx.amount !== saved.amount) {
        label = `Modification montant « ${saved.label || ''} » (${previousTx.amount} € ➔ ${saved.amount} €)`;
      } else if (previousTx.status !== saved.status) {
        label = saved.status === 'cleared'
          ? `Pointage opération « ${saved.label || ''} »`
          : `Modification statut « ${saved.label || ''} »`;
      }

      const prevCopy = { ...previousTx };
      const savedCopy = { ...saved };
      recordHistoryAction({
        label,
        undo: async () => {
          await apiClient.transactions.save(prevCopy);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.transactions.save(savedCopy);
          await refreshAll();
        }
      });
    } else {
      const savedCopy = { ...saved };
      recordHistoryAction({
        label: `Ajout opération « ${saved.label || 'Sans libellé'} » (${saved.amount} €)`,
        undo: async () => {
          await apiClient.transactions.delete(savedCopy.id);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.transactions.restore(savedCopy.id);
          await refreshAll();
        }
      });
    }

    return saved;
  };

  const deleteTransaction = async (id: string): Promise<void> => {
    const target = transactionsRef.current.find(t => t.id === id);
    await apiClient.transactions.delete(id);
    setTransactions(prev => prev
      .filter(t => t.id !== id)
      .map(t => t.linkedId === id ? { ...t, linkedId: undefined } : t)
    );
    if (target?.type === 'loan_payment') {
      try {
        const freshLoans = await apiClient.loans.getAll();
        setLoans(freshLoans);
      } catch (err) {
        console.error('Erreur rafraîchissement des crédits après suppression mensualité:', err);
      }
    }

    const displayLabel = target?.label ? `« ${target.label} »` : 'Opération';
    const amtStr = target ? ` (${target.amount} €)` : '';
    recordHistoryAction({
      label: `Suppression ${displayLabel}${amtStr}`,
      undo: async () => {
        await apiClient.transactions.restore(id);
        await refreshAll();
      },
      redo: async () => {
        await apiClient.transactions.delete(id);
        await refreshAll();
      }
    });
  };

  const restoreTransaction = async (id: string): Promise<Transaction> => {
    const res = await apiClient.transactions.restore(id);
    const restored = res.transaction;
    await refreshAll();
    return restored;
  };

  const updateTransactionStatus = async (id: string, status: Transaction['status']): Promise<Transaction> => {
    const previousTx = transactionsRef.current.find(t => t.id === id);
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

    if (previousTx && previousTx.status !== status) {
      const prevStatus = previousTx.status;
      const label = status === 'cleared'
        ? `Pointage « ${previousTx.label || 'opération'} »`
        : status === 'disabled'
        ? `Désactivation « ${previousTx.label || 'opération'} »`
        : `Dépointage « ${previousTx.label || 'opération'} »`;

      recordHistoryAction({
        label,
        undo: async () => {
          await apiClient.transactions.updateStatus(id, prevStatus);
          await refreshAll();
        },
        redo: async () => {
          await apiClient.transactions.updateStatus(id, status);
          await refreshAll();
        }
      });
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
      const updatedTxs = await apiClient.transactions.get();
      setTransactions(updatedTxs);
    }
    return res.generated;
  };

  const saveDashboardSettings = async (settings: Partial<DashboardSettings>): Promise<void> => {
    if (!isAuthenticated) return;
    const previous = { ...dashboardSettingsRef.current };
    const merged = { ...previous, ...settings };

    const hasChanged = (
      (settings.manualBalance !== undefined && settings.manualBalance !== previous.manualBalance) ||
      (settings.card1 !== undefined && settings.card1 !== previous.card1) ||
      (settings.card2 !== undefined && settings.card2 !== previous.card2)
    );

    await apiClient.settings.save(merged);
    setDashboardSettings(merged);

    if (hasChanged) {
      let label = 'Modification solde bancaire / encours';
      if (settings.manualBalance !== undefined && settings.manualBalance !== previous.manualBalance) {
        label = `Solde bancaire réel : ${settings.manualBalance} €`;
      } else if (settings.card1 !== undefined && settings.card1 !== previous.card1) {
        label = `Encours CB 1 : ${settings.card1} €`;
      } else if (settings.card2 !== undefined && settings.card2 !== previous.card2) {
        label = `Encours CB 2 : ${settings.card2} €`;
      }

      recordHistoryAction({
        label,
        undo: async () => {
          await apiClient.settings.save(previous);
          setDashboardSettings(previous);
        },
        redo: async () => {
          await apiClient.settings.save(merged);
          setDashboardSettings(merged);
        }
      });
    }
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
        restoreTransaction,
        updateTransactionStatus,
        saveLoan,
        deleteLoan,
        archiveLoan,
        reactivateLoanFuturePlanned,
        updateLoanPaymentStatus,
        saveRecurrenceTemplate,
        deleteRecurrenceTemplate,
        generateMonthlyOccurrences,
        saveDashboardSettings,
        undoStack,
        redoStack,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undo,
        redo,
        undoFeedback
      }}
    >
      {children}
      {undoFeedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '1.25rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            padding: '0.6rem 1.25rem',
            borderRadius: '9999px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            border: '1px solid #334155',
            pointerEvents: 'none'
          }}
        >
          <span style={{ fontSize: '1rem', lineHeight: 1 }}>
            {undoFeedback.type === 'undo' ? '↩️' : '↪️'}
          </span>
          <span>{undoFeedback.message}</span>
        </div>
      )}
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
