import React, { useState, useRef, useEffect } from 'react';
import { generateId } from '../db/database';
import type { Category, TransactionType, Account, AccountType, IncomePayer } from '../db/database';
import { Card, Button, Modal, AmountInput } from '../components/ui/Components';
import { 
  Plus, Edit2, Archive, ArchiveRestore, Trash2, Download, Upload, 
  AlertTriangle, CheckCircle, ShieldCheck, Server, RefreshCw, LogOut, 
  Wallet, Building, AlertCircle, Database, Wrench, HardDrive, RotateCcw,
  KeyRound, Lock, Terminal, FileText, Moon, Sun, Eye, EyeOff, Palette,
  TrendingDown, Cpu, Network, Activity, Clock, HelpCircle, BookOpen, ExternalLink, Heart, Power, Star
} from 'lucide-react';
import LoanCapitalHistoryManager from '../components/settings/LoanCapitalHistoryManager';
import { calculateRealBalance } from '../engine/calculations';
import { useServerDataOptional } from '../contexts/ServerDataContext';
import { useAuth } from '../contexts/AuthContext';
import { apiClient, type DoctorReport, type HealerResult, type HealerActionPlan } from '../services/apiClient';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { resolvePrimaryAccountId, getAccountTypeLabel } from '../services/accountPresentation';

const CATEGORY_TYPES: { id: TransactionType; label: string }[] = [
  { id: 'income', label: 'Revenus' },
  { id: 'fixed_expense', label: 'Charges fixes' },
  { id: 'variable_expense', label: 'Charges variables' },
  { id: 'daily', label: 'Dépenses courantes' },
  { id: 'health_expense', label: 'Santé' },
  { id: 'loan_payment', label: 'Crédits' },
  { id: 'transfer', label: 'Épargne & transferts' }
];

export default function Settings() {
  const serverData = useServerDataOptional();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, setTheme, isPrivacyMode, togglePrivacyMode } = useUIPreferences();

  // Navigation par sections (prise en charge de l'onglet demandé par URL ex: ?tab=help en environnement navigateur)
  const getInitialTab = (): 'accounts' | 'payers' | 'categories' | 'loans_history' | 'preferences' | 'backup' | 'server' | 'help' => {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'help') return 'help';
    }
    return 'accounts';
  };

  const [activeSection, setActiveSection] = useState<'accounts' | 'payers' | 'categories' | 'loans_history' | 'preferences' | 'backup' | 'server' | 'help'>(
    getInitialTab()
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'help') {
        setActiveSection('help');
      }
    }
  }, []);

  // Données métier depuis le serveur SQLite
  const categories = serverData ? serverData.categories : [];
  const accounts = serverData ? serverData.accounts : [];
  const incomePayers = serverData ? serverData.incomePayers : [];
  const allTransactions = serverData ? serverData.transactions : [];
  const loans = serverData ? serverData.loans : [];

  // États Gestion Catégories
  const [activeCatTab, setActiveCatTab] = useState<TransactionType>('income');
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');

  // États Gestion Comptes Bancaires
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('checking');
  const [accountInitialBalance, setAccountInitialBalance] = useState('0');

  // États Gestion Organismes Verseurs
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [editingPayer, setEditingPayer] = useState<IncomePayer | null>(null);
  const [payerName, setPayerName] = useState('');

  // États Sauvegarde et Restauration
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExcelPeriodModalOpen, setIsExcelPeriodModalOpen] = useState(false);
  const [excelExportPeriodMode, setExcelExportPeriodMode] = useState<'all' | 'custom'>('all');
  const [excelStartDate, setExcelStartDate] = useState('');
  const [excelEndDate, setExcelEndDate] = useState('');
  const [excelPeriodError, setExcelPeriodError] = useState<string | null>(null);

  // États Outils et Maintenance SQLite
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    integrity: string;
    dbSizeFormatted: string;
    walSizeFormatted: string;
    systemMetrics?: {
      uptimeFormatted: string;
      memoryUsageFormatted: string;
      ramStats?: {
        totalFormatted: string;
        freeFormatted: string;
        usedFormatted: string;
        percentUsed: number;
      };
      serverIp?: string;
      cpu?: {
        cores: number;
        usagePercent: number;
        loadAvg: number[];
        loadFormatted: string;
      };
      diskStats?: {
        totalFormatted: string;
        freeFormatted: string;
        usedFormatted: string;
        percentUsed: number;
      };
    };
  } | null>(null);
  const [isCheckingMaintenance, setIsCheckingMaintenance] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  // États DB Doctor & Safe Healer
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const [isDoctorAuditing, setIsDoctorAuditing] = useState(false);
  const [healerResult, setHealerResult] = useState<HealerResult | null>(null);
  const [isHealerPreviewing, setIsHealerPreviewing] = useState(false);
  const [isHealerApplying, setIsHealerApplying] = useState(false);
  const [isDryRunModalOpen, setIsDryRunModalOpen] = useState(false);
  const [selectedTargetAccount, setSelectedTargetAccount] = useState<string>('');
  const [selectedTargetLoan, setSelectedTargetLoan] = useState<string>('');
  const [pastPlannedResolution, setPastPlannedResolution] = useState<'clear' | 'trash'>('clear');
  const [isRestoringDbFile, setIsRestoringDbFile] = useState(false);
  const dbFileInputRef = useRef<HTMLInputElement>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // États Changement de mot de passe & Clé de secours
  const { changePassword, getRecoveryKey } = useAuth();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isRecoveryKeyModalOpen, setIsRecoveryKeyModalOpen] = useState(false);
  const [currentRecoveryKey, setCurrentRecoveryKey] = useState<string | null>(null);
  const [recoveryKeyLoading, setRecoveryKeyLoading] = useState(false);

  const handleOpenPasswordModal = () => {
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmNewPasswordInput('');
    setPasswordChangeMessage(null);
    setIsPasswordModalOpen(true);
  };

  const handleSavePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);

    if (!currentPasswordInput) {
      setPasswordChangeMessage({ type: 'error', text: 'Veuillez saisir votre mot de passe actuel.' });
      return;
    }
    if (newPasswordInput.length < 6) {
      setPasswordChangeMessage({ type: 'error', text: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setPasswordChangeMessage({ type: 'error', text: 'Les nouveaux mots de passe ne correspondent pas.' });
      return;
    }

    setPasswordChangeLoading(true);
    try {
      const res = await changePassword(currentPasswordInput, newPasswordInput);
      setPasswordChangeMessage({ type: 'success', text: res.message });
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
      setTimeout(() => setIsPasswordModalOpen(false), 1500);
    } catch (err: any) {
      setPasswordChangeMessage({ type: 'error', text: err.message || 'Échec du changement de mot de passe.' });
    } finally {
      setPasswordChangeLoading(false);
    }
  };

  const handleShowRecoveryKey = async () => {
    setRecoveryKeyLoading(true);
    try {
      const key = await getRecoveryKey();
      setCurrentRecoveryKey(key);
      setIsRecoveryKeyModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Impossible de récupérer la clé de secours.');
    } finally {
      setRecoveryKeyLoading(false);
    }
  };

  // États Réinitialisation sécurisée
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [reseedDefaults, setReseedDefaults] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  // États Redémarrage sécurisé du serveur
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartStatusMessage, setRestartStatusMessage] = useState<string | null>(null);

  const fetchMaintenanceStatus = async () => {
    if (!serverData || !isAuthenticated) return;
    setIsCheckingMaintenance(true);
    try {
      const res = await apiClient.maintenance.getStatus();
      setMaintenanceStatus({
        integrity: res.integrity,
        dbSizeFormatted: res.dbSizeFormatted,
        walSizeFormatted: res.walSizeFormatted,
        systemMetrics: res.systemMetrics
      });
    } catch (err: any) {
      console.error('Erreur maintenance status:', err);
    } finally {
      setIsCheckingMaintenance(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'server' && serverData && isAuthenticated) {
      fetchMaintenanceStatus();
    }
  }, [activeSection, serverData, isAuthenticated]);

  // États Journal des Logs Techniques
  const [technicalLogs, setTechnicalLogs] = useState<string[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // États Instantanés Sauvegardes Serveur (.db)
  const [serverSnapshots, setServerSnapshots] = useState<Array<{
    fileName: string;
    relativePath: string;
    type: 'auto' | 'safety' | 'manual';
    label: string;
    sizeBytes: number;
    sizeFormatted: string;
    createdAt: string;
    createdFormatted: string;
  }>>([]);
  const [selectedSnapshotFileName, setSelectedSnapshotFileName] = useState<string>('');
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);
  const [isConfirmSnapshotModalOpen, setIsConfirmSnapshotModalOpen] = useState(false);
  const [isPurgingBackups, setIsPurgingBackups] = useState(false);

  const fetchServerSnapshots = async () => {
    if (!serverData || !isAuthenticated) return;
    setIsLoadingSnapshots(true);
    try {
      const res = await apiClient.maintenance.listSnapshots();
      setServerSnapshots(res.snapshots || []);
      if (res.snapshots?.length > 0 && !selectedSnapshotFileName) {
        setSelectedSnapshotFileName(res.snapshots[0].relativePath);
      }
    } catch (err: any) {
      console.error('Erreur chargement des instantanés serveur:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const fetchTechnicalLogs = async () => {
    if (!serverData || !isAuthenticated) return;
    setIsLoadingLogs(true);
    try {
      const res = await apiClient.maintenance.getLogs();
      setTechnicalLogs(res.lines || []);
    } catch (err: any) {
      console.error('Erreur chargement logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearTechnicalLogs = async () => {
    if (!confirm('Voulez-vous vraiment effacer le journal des logs techniques ?')) return;
    try {
      await apiClient.maintenance.clearLogs();
      await fetchTechnicalLogs();
    } catch (err: any) {
      alert(err.message || 'Impossible d\'effacer les logs.');
    }
  };

  useEffect(() => {
    if (activeSection === 'backup' && serverData && isAuthenticated) {
      fetchServerSnapshots();
    }
  }, [activeSection, serverData, isAuthenticated]);

  useEffect(() => {
    if (activeSection === 'server' && serverData && isAuthenticated) {
      fetchTechnicalLogs();
    }
  }, [activeSection, serverData, isAuthenticated]);

  const handleExecuteRestoreSnapshot = async () => {
    if (!selectedSnapshotFileName) return;
    setIsRestoringSnapshot(true);
    setMaintenanceMessage(null);
    try {
      const res = await apiClient.maintenance.restoreSnapshot(selectedSnapshotFileName);
      setIsConfirmSnapshotModalOpen(false);
      setMaintenanceMessage({ type: 'success', text: res.message });
      await serverData?.refreshAll();
      await fetchMaintenanceStatus();
      await fetchServerSnapshots();
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la restauration de l\'instantané.' });
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handlePurgeBackups = async () => {
    if (!confirm("⚠️ Attention : Vous êtes sur le point de supprimer tous les fichiers de sauvegarde (.db et .json) conservés sur le serveur (sauvegardes automatiques et copies de sécurité antérieures).\n\nVotre base de données active (budget.db) NE SERA PAS touchée.\n\nSouhaitez-vous continuer ?")) {
      return;
    }
    setIsPurgingBackups(true);
    setMaintenanceMessage(null);
    try {
      const res = await apiClient.maintenance.purgeBackups();
      setMaintenanceMessage({ type: 'success', text: res.message });
      setSelectedSnapshotFileName('');
      await fetchServerSnapshots();
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la purge des sauvegardes.' });
    } finally {
      setIsPurgingBackups(false);
    }
  };

  const handleRestoreDbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`⚠️ Attention : Vous êtes sur le point de remplacer votre base SQLite actuelle par le fichier "${file.name}". Une copie de sécurité sera créée. Souhaitez-vous continuer ?`)) {
      if (dbFileInputRef.current) dbFileInputRef.current.value = '';
      return;
    }

    setIsRestoringDbFile(true);
    setMaintenanceMessage(null);
    try {
      const res = await apiClient.maintenance.restoreDbFile(file);
      setMaintenanceMessage({ type: 'success', text: res.message });
      await serverData?.refreshAll();
      await fetchMaintenanceStatus();
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la restauration SQLite (.db).' });
    } finally {
      setIsRestoringDbFile(false);
      if (dbFileInputRef.current) dbFileInputRef.current.value = '';
    }
  };

  const handleVacuum = async () => {
    setIsVacuuming(true);
    setMaintenanceMessage(null);
    try {
      const res = await apiClient.maintenance.vacuum();
      setMaintenanceMessage({ 
        type: 'success', 
        text: `${res.message} (Avant: ${res.beforeSize} → Après: ${res.afterSize})` 
      });
      await fetchMaintenanceStatus();
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de l\'optimisation VACUUM.' });
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleRunDoctorAudit = async () => {
    setIsDoctorAuditing(true);
    setMaintenanceMessage(null);
    try {
      const report = await apiClient.maintenance.getDoctorAudit();
      setDoctorReport(report);
      if (report.totalAnomalies === 0 && report.sqliteIntegrity === 'ok') {
        setMaintenanceMessage({ type: 'success', text: 'Diagnostic DB Doctor : Base de données 100 % saine et intègre (0 anomalie).' });
      }
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec du diagnostic DB Doctor.' });
    } finally {
      setIsDoctorAuditing(false);
    }
  };

  const buildHealerPlans = (): HealerActionPlan[] => {
    if (!doctorReport || doctorReport.anomalies.length === 0) return [];
    return doctorReport.anomalies.map(anom => {
      const plan: HealerActionPlan = {
        ruleId: anom.id,
        targetIds: anom.affectedIds
      };
      if (anom.id === 'ANOM-04' || anom.id === 'ANOM-05') {
        plan.userParameters = { targetAccountId: selectedTargetAccount };
      } else if (anom.id === 'ANOM-03') {
        plan.userParameters = { targetLoanId: selectedTargetLoan || undefined };
      } else if (anom.id === 'ANOM-13') {
        plan.userParameters = { pastPlannedResolution };
      }
      return plan;
    });
  };

  const handlePreviewHealer = async () => {
    if (!doctorReport || doctorReport.anomalies.length === 0) return;

    // Vérification des arbitrages obligatoires
    const hasAccountAnom = doctorReport.anomalies.some(a => a.id === 'ANOM-04' || a.id === 'ANOM-05');
    if (hasAccountAnom && !selectedTargetAccount) {
      alert('Veuillez sélectionner un compte bancaire cible pour réassigner les opérations concernées (ANOM-04 / ANOM-05).');
      return;
    }

    setIsHealerPreviewing(true);
    setMaintenanceMessage(null);
    try {
      const plans = buildHealerPlans();
      const res = await apiClient.maintenance.previewHealer(plans);
      setHealerResult(res);
      setIsDryRunModalOpen(true);
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la simulation Dry-Run.' });
    } finally {
      setIsHealerPreviewing(false);
    }
  };

  const handleApplyHealer = async () => {
    if (!doctorReport || doctorReport.anomalies.length === 0) return;
    setIsHealerApplying(true);
    try {
      const plans = buildHealerPlans();
      const res = await apiClient.maintenance.applyHealer(plans);
      setIsDryRunModalOpen(false);
      await serverData?.refreshAll();
      await fetchMaintenanceStatus();
      await handleRunDoctorAudit();
      setMaintenanceMessage({
        type: 'success',
        text: `Réparation appliquée avec succès (${res.totalModifications} modification(s)). Sauvegarde de sécurité créée.`
      });
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la réparation Healer.' });
    } finally {
      setIsHealerApplying(false);
    }
  };

  const handleExecuteReset = async () => {
    if (resetConfirmationInput.trim().toUpperCase() !== 'REINITIALISER') {
      alert('Veuillez taper exactement "REINITIALISER" pour confirmer la purge.');
      return;
    }
    setIsResetting(true);
    setMaintenanceMessage(null);
    try {
      const res = await apiClient.maintenance.reset(reseedDefaults);
      setIsResetModalOpen(false);
      setResetConfirmationInput('');
      setMaintenanceMessage({ type: 'success', text: res.message });
      await serverData?.refreshAll();
      await fetchMaintenanceStatus();
    } catch (err: any) {
      setMaintenanceMessage({ type: 'error', text: err.message || 'Échec de la réinitialisation.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleRestartServer = async () => {
    setIsRestarting(true);
    setRestartStatusMessage('Envoi du signal de redémarrage sécurisé au serveur...');
    try {
      await apiClient.maintenance.restartServer();
      setRestartStatusMessage('Fermeture propre de la base SQLite et redémarrage du conteneur en cours. Reconnexion automatique...');

      // Polling de reconnexion pendant 30 secondes max
      const startTime = Date.now();
      const maxWaitMs = 30000;
      let isBackOnline = false;

      // Attendre 2 secondes avant le premier test de ping
      await new Promise(resolve => setTimeout(resolve, 2000));

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const res = await fetch('/api/health');
          if (res.ok) {
            isBackOnline = true;
            break;
          }
        } catch {
          // Serveur encore en cours de boot
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (isBackOnline) {
        setRestartStatusMessage('Serveur redémarré avec succès ! Rechargement des métriques...');
        await serverData?.refreshAll();
        await fetchMaintenanceStatus();
        setTimeout(() => {
          setIsRestartModalOpen(false);
          setIsRestarting(false);
          setRestartStatusMessage(null);
          setMaintenanceMessage({ type: 'success', text: 'Le serveur Budget Perso Pro a été redémarré proprement.' });
        }, 1200);
      } else {
        setRestartStatusMessage('Le serveur met plus de temps que prévu à redémarrer. Veuillez patienter quelques secondes puis actualiser la page.');
        setIsRestarting(false);
      }
    } catch (err: any) {
      setRestartStatusMessage(`Erreur lors de la demande de redémarrage : ${err.message || 'Erreur inconnue'}`);
      setIsRestarting(false);
    }
  };

  // ----------------------------------------------------------------------
  // Handlers Comptes Bancaires
  // ----------------------------------------------------------------------
  const handleOpenAccountModal = (acc?: Account) => {
    if (acc) {
      setEditingAccount(acc);
      setAccountName(acc.name);
      setAccountType(acc.type);
      setAccountInitialBalance(String(acc.initialBalance ?? 0));
    } else {
      setEditingAccount(null);
      setAccountName('');
      setAccountType('checking');
      setAccountInitialBalance('0');
    }
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = accountName.trim();
    if (!trimmedName) {
      alert('Le nom du compte est obligatoire.');
      return;
    }

    const parsedBalance = parseFloat(accountInitialBalance.replace(',', '.'));
    if (isNaN(parsedBalance)) {
      alert('Le solde initial doit être un nombre valide.');
      return;
    }

    try {
      if (editingAccount) {
        const payload: Partial<Account> = {
          id: editingAccount.id,
          name: trimmedName,
          type: accountType,
          initialBalance: parsedBalance,
          referenceDate: editingAccount.referenceDate || new Date().toISOString().split('T')[0]
        };
        await serverData?.saveAccount(payload);
      } else {
        const newAccount: Account = {
          id: generateId(),
          name: trimmedName,
          type: accountType,
          initialBalance: parsedBalance,
          referenceDate: new Date().toISOString().split('T')[0],
          isClosed: false
        };
        await serverData?.saveAccount(newAccount);
      }
      setIsAccountModalOpen(false);
    } catch (err: any) {
      console.error('Erreur enregistrement compte:', err);
      alert(err.message || 'Erreur lors de l\'enregistrement du compte.');
    }
  };

  const handleToggleCloseAccount = async (acc: Account) => {
    const action = acc.isClosed ? 'réactiver' : 'clôturer';
    const message = acc.isClosed
      ? `Voulez-vous réactiver le compte "${acc.name}" ? Il redeviendra disponible pour la saisie des opérations.`
      : `Voulez-vous clôturer le compte "${acc.name}" ?\n\nIl restera consultable dans votre historique, mais ne sera plus proposé pour la saisie de nouvelles opérations.`;

    if (window.confirm(message)) {
      try {
        await serverData?.saveAccount({ id: acc.id, isClosed: !acc.isClosed });
        // Si le compte clôturé était le compte principal, le désassigner
        if (!acc.isClosed && serverData?.dashboardSettings?.primaryAccountId === acc.id) {
          await serverData?.saveDashboardSettings({ primaryAccountId: '' });
        }
      } catch (err: any) {
        console.error('Erreur changement statut compte:', err);
        alert(err.message || 'Impossible de mettre à jour le statut du compte.');
      }
    }
  };

  const handleDeleteAccount = async (acc: Account) => {
    const txCount = allTransactions.filter(t => t.accountId === acc.id || t.destinationAccountId === acc.id).length;
    const loanCount = loans.filter(l => l.accountId === acc.id).length;

    if (txCount > 0 || loanCount > 0) {
      alert(`Impossible de supprimer le compte "${acc.name}" car ${txCount} opération(s) et ${loanCount} crédit(s) y sont rattachés.\n\nPour conserver l'intégrité de vos bilans passés, utilisez plutôt l'action "Clôturer le compte".`);
      return;
    }

    if (window.confirm(`Voulez-vous vraiment supprimer définitivement le compte "${acc.name}" ?\nCette action est irréversible.`)) {
      try {
        await serverData?.deleteAccount(acc.id);
        // Si le compte supprimé était le compte principal, le désassigner
        if (serverData?.dashboardSettings?.primaryAccountId === acc.id) {
          await serverData?.saveDashboardSettings({ primaryAccountId: '' });
        }
      } catch (err: any) {
        console.error('Erreur suppression compte:', err);
        alert(err.message || 'Impossible de supprimer ce compte.');
      }
    }
  };

  const handleSetPrimaryAccount = async (acc: Account) => {
    if (acc.isClosed) {
      alert("Un compte clôturé ne peut pas être désigné comme compte courant principal.");
      return;
    }
    if (acc.type !== 'checking') {
      alert("Seul un compte courant peut être désigné comme compte principal.");
      return;
    }

    try {
      if (serverData) {
        await serverData.saveDashboardSettings({ primaryAccountId: acc.id });
      }
    } catch (err: any) {
      console.error('Erreur définition compte principal:', err);
      alert(err.message || 'Impossible de définir le compte principal.');
    }
  };

  // ----------------------------------------------------------------------
  // Handlers Organismes Verseurs
  // ----------------------------------------------------------------------
  const handleOpenPayerModal = (payer?: IncomePayer) => {
    if (payer) {
      setEditingPayer(payer);
      setPayerName(payer.name);
    } else {
      setEditingPayer(null);
      setPayerName('');
    }
    setIsPayerModalOpen(true);
  };

  const handleSavePayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = payerName.trim();
    if (!trimmed) {
      alert('Le nom de l\'organisme verseur ne peut pas être vide.');
      return;
    }

    const isDuplicate = incomePayers.some(p => p.name.toLowerCase() === trimmed.toLowerCase() && p.id !== editingPayer?.id);
    if (isDuplicate) {
      alert('Un organisme verseur avec ce nom existe déjà.');
      return;
    }

    try {
      if (editingPayer) {
        await serverData?.saveIncomePayer({ id: editingPayer.id, name: trimmed });
      } else {
        const newPayer: IncomePayer = {
          id: generateId(),
          name: trimmed,
          isArchived: false,
          createdAt: new Date().toISOString()
        };
        await serverData?.saveIncomePayer(newPayer);
      }
      setIsPayerModalOpen(false);
    } catch (err: any) {
      console.error('Erreur enregistrement organisme:', err);
      alert(err.message || 'Erreur lors de l\'enregistrement de l\'organisme.');
    }
  };

  const handleToggleArchivePayer = async (payer: IncomePayer) => {
    const action = payer.isArchived ? 'réactiver' : 'archiver';
    if (window.confirm(`Voulez-vous vraiment ${action} l'organisme "${payer.name}" ?`)) {
      try {
        await serverData?.saveIncomePayer({ id: payer.id, isArchived: !payer.isArchived });
      } catch (err: any) {
        console.error('Erreur archivage organisme:', err);
        alert(err.message || 'Impossible de mettre à jour cet organisme.');
      }
    }
  };

  const handleDeletePayer = async (payer: IncomePayer) => {
    const txCount = allTransactions.filter(t => t.payerId === payer.id).length;
    if (txCount > 0) {
      alert(`Impossible de supprimer l'organisme "${payer.name}" car ${txCount} opération(s) y sont rattachées.\n\nVous pouvez plutôt l'archiver pour qu'il n'apparaisse plus dans les nouveaux formulaires.`);
      return;
    }

    if (window.confirm(`Voulez-vous vraiment supprimer définitivement l'organisme "${payer.name}" ?`)) {
      try {
        await serverData?.deleteIncomePayer(payer.id);
      } catch (err: any) {
        console.error('Erreur suppression organisme:', err);
        alert(err.message || 'Impossible de supprimer cet organisme.');
      }
    }
  };

  // ----------------------------------------------------------------------
  // Handlers Catégories
  // ----------------------------------------------------------------------
  const currentCategories = categories?.filter(c => c.type === activeCatTab) || [];

  const handleOpenCatModal = (cat?: Category) => {
    if (cat) {
      setEditingCat(cat);
      setCatName(cat.name);
    } else {
      setEditingCat(null);
      setCatName('');
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCat = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = catName.trim();
    if (!name) return;

    const isDuplicate = currentCategories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCat?.id);
    if (isDuplicate) {
      alert('Une catégorie avec ce nom existe déjà pour ce type.');
      return;
    }

    if (editingCat) {
      await serverData?.saveCategory({ id: editingCat.id, name });
    } else {
      const newCat = {
        id: generateId(),
        name,
        type: activeCatTab,
        isArchived: false
      };
      await serverData?.saveCategory(newCat);
    }
    setIsCatModalOpen(false);
  };

  const handleToggleArchiveCat = async (cat: Category) => {
    const action = cat.isArchived ? 'réactiver' : 'archiver';
    if (window.confirm(`Voulez-vous vraiment ${action} la catégorie "${cat.name}" ?`)) {
      await serverData?.saveCategory({ id: cat.id, isArchived: !cat.isArchived });
    }
  };

  const handleDeleteCat = async (cat: Category) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer la catégorie "${cat.name}" ?\nCette action est irréversible.`)) {
      return;
    }

    const usageCount = serverData
      ? serverData.transactions.filter(t => t.categoryId === cat.id).length
      : 0;
    
    if (usageCount > 0) {
      alert(`Impossible de supprimer cette catégorie car elle est utilisée par ${usageCount} opération(s).\n\nVeuillez d'abord modifier ces opérations pour utiliser une autre catégorie, ou choisissez de l'archiver.`);
      return;
    }

    await serverData?.deleteCategory(cat.id);
  };

  // ----------------------------------------------------------------------
  // Handlers Sauvegardes
  // ----------------------------------------------------------------------
  const handleOpenExcelPeriodModal = () => {
    setExcelPeriodError(null);
    setIsExcelPeriodModalOpen(true);
  };

  const handleExportExcel = async () => {
    setExcelPeriodError(null);
    let options: { startDate?: string; endDate?: string } | undefined;

    if (excelExportPeriodMode === 'custom') {
      if (!excelStartDate || !excelEndDate) {
        setExcelPeriodError('Veuillez renseigner une date de début et une date de fin.');
        return;
      }
      if (excelStartDate > excelEndDate) {
        setExcelPeriodError('La date de début doit être antérieure ou égale à la date de fin.');
        return;
      }
      options = { startDate: excelStartDate, endDate: excelEndDate };
    }

    try {
      setIsExportingExcel(true);
      await apiClient.migration.downloadExcel(options);
      setIsExcelPeriodModalOpen(false);
    } catch (err: any) {
      console.error('Erreur lors de l\'exportation Excel:', err);
      setExcelPeriodError(err.message || 'Une erreur est survenue lors de la génération du classeur Excel.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Paramètres</h1>

      {/* Navigation principale des paramètres */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <Button 
          variant={activeSection === 'accounts' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('accounts')}
          icon={<Wallet size={16} />}
        >
          Comptes bancaires ({accounts.length})
        </Button>
        <Button 
          variant={activeSection === 'payers' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('payers')}
          icon={<Building size={16} />}
        >
          Organismes verseurs ({incomePayers.length})
        </Button>
        <Button 
          variant={activeSection === 'categories' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('categories')}
        >
          Catégories de budget
        </Button>
        <Button 
          variant={activeSection === 'loans_history' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('loans_history')}
          icon={<TrendingDown size={16} />}
        >
          Historique des crédits
        </Button>
        <Button 
          variant={activeSection === 'backup' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('backup')}
          icon={<Download size={16} />}
        >
          Sauvegardes & Restauration
        </Button>
        <Button 
          variant={activeSection === 'preferences' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('preferences')}
          icon={<Palette size={16} />}
        >
          Apparence & Confidentialité
        </Button>
        <Button 
          variant={activeSection === 'server' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('server')}
          icon={<Server size={16} />}
        >
          Serveur & Synchro
        </Button>
        <Button 
          variant={activeSection === 'help' ? 'primary' : 'outline'}
          onClick={() => setActiveSection('help')}
          icon={<HelpCircle size={16} />}
        >
          Aide & Documentation
        </Button>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1 : GESTION DES COMPTES BANCAIRES                            */}
      {/* ==================================================================== */}
      {activeSection === 'accounts' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Comptes bancaires" value="" />
          </div>

          <div className="table-container">
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Liste de vos comptes bancaires</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem' }}>
                  Ces comptes sont utilisés pour débiter vos dépenses et créditer vos revenus ou virements d'épargne.
                </p>
              </div>
              <Button onClick={() => handleOpenAccountModal()} icon={<Plus size={16} />}>Ajouter un compte</Button>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Nom du compte</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Solde initial</th>
                  <th style={{ textAlign: 'right' }}>Solde bancaire réel</th>
                  <th>Statut</th>
                  <th style={{ width: '180px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Détermination déterministe et sûre du compte principal explicite :
                  // 1. Si primaryAccountId est défini et pointe vers un compte checking actif existant -> c'est lui.
                  // 2. Sinon, si aucun primaryAccountId valide n'est configuré (installation existante / transition),
                  //    on sélectionne de façon stable le premier compte checking actif non clôturé.
                  // 3. Un compte clôturé, inexistant ou non-checking n'est JAMAIS considéré comme principal.
                  const resolvedPrimaryAccountId = resolvePrimaryAccountId(
                    accounts,
                    serverData?.dashboardSettings?.primaryAccountId
                  );

                  return accounts.map(acc => {
                    const calculatedBal = calculateRealBalance(acc, allTransactions);
                    const isClosed = Boolean(acc.isClosed);
                    const isPrimary = acc.id === resolvedPrimaryAccountId;

                    // Seul le compte courant principal désigné affiche le solde déclaré du Tableau de bord (manualBalance)
                    let displayBalance = calculatedBal;
                    let isDashboardManual = false;

                    if (isPrimary) {
                      const rawManual = serverData?.dashboardSettings?.manualBalance ?? 
                        (typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('manualBalance') : null);
                      if (rawManual !== null && rawManual !== undefined && rawManual !== '') {
                        const parsedManual = parseFloat(String(rawManual).replace(',', '.'));
                        if (!isNaN(parsedManual)) {
                          displayBalance = parsedManual;
                          isDashboardManual = true;
                        }
                      }
                    }

                    return (
                      <tr key={acc.id} style={{ opacity: isClosed ? 0.6 : 1 }}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <Wallet size={16} color="var(--primary-color)" />
                            <span>{acc.name}</span>
                            {isPrimary && (
                              <span 
                                className="badge" 
                                style={{ 
                                  backgroundColor: '#eff6ff', 
                                  color: '#2563eb', 
                                  border: '1px solid #bfdbfe',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                                title="Compte courant principal associé au solde bancaire réel du Tableau de bord"
                              >
                                <Star size={11} fill="#2563eb" color="#2563eb" />
                                Principal
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                            {getAccountTypeLabel(acc, serverData?.dashboardSettings?.primaryAccountId, accounts)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {(acc.initialBalance ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                        <td style={{ 
                          textAlign: 'right', 
                          fontVariantNumeric: 'tabular-nums', 
                          fontWeight: 600,
                          color: displayBalance >= 0 ? 'var(--text-color)' : 'var(--danger-color)'
                        }}>
                          <div>
                            {displayBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </div>
                          {isDashboardManual && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #888)', fontWeight: 'normal' }} title={`Solde pointé calculé : ${calculatedBal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}>
                              (Tableau de bord)
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${isClosed ? 'badge-planned' : 'badge-cleared'}`}>
                            {isClosed ? 'Clôturé' : 'Actif'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            {acc.type === 'checking' && !isClosed && (
                              <Button
                                variant="icon"
                                title={isPrimary ? 'Compte courant principal actif' : 'Définir comme compte courant principal'}
                                onClick={() => handleSetPrimaryAccount(acc)}
                                style={{
                                  color: isPrimary ? '#f59e0b' : 'var(--text-secondary, #94a3b8)',
                                  backgroundColor: isPrimary ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                                }}
                                aria-label={isPrimary ? `Compte principal : ${acc.name}` : `Définir ${acc.name} comme compte principal`}
                              >
                                <Star size={16} fill={isPrimary ? '#f59e0b' : 'none'} />
                              </Button>
                            )}
                            <Button 
                              variant="icon" 
                              title="Modifier les informations" 
                              onClick={() => handleOpenAccountModal(acc)}
                            >
                              <Edit2 size={16} />
                            </Button>
                            <Button 
                              variant="icon" 
                              title={isClosed ? 'Réactiver le compte' : 'Clôturer le compte'} 
                              onClick={() => handleToggleCloseAccount(acc)}
                            >
                              {isClosed ? <ArchiveRestore size={16} color="var(--success-color)" /> : <Archive size={16} color="var(--warning-color)" />}
                            </Button>
                            <Button 
                              variant="icon" 
                              title="Supprimer définitivement" 
                              onClick={() => handleDeleteAccount(acc)}
                            >
                              <Trash2 size={16} color="var(--danger-color)" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
                {accounts.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      Aucun compte configuré. Cliquez sur « Ajouter un compte » pour en créer un.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 2 : GESTION DES ORGANISMES VERSEURS                          */}
      {/* ==================================================================== */}
      {activeSection === 'payers' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Organismes verseurs (Revenus)" value="" />
          </div>

          <div className="table-container">
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Tiers et organismes verseurs</h2>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem' }}>
                  Ces entités (employeur, CAF, CPAM, clients, etc.) permettent d'identifier précisément qui vous verse un revenu.
                </p>
              </div>
              <Button onClick={() => handleOpenPayerModal()} icon={<Plus size={16} />}>Ajouter un organisme</Button>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Nom de l'organisme</th>
                  <th style={{ textAlign: 'center' }}>Opérations associées</th>
                  <th>Statut</th>
                  <th style={{ width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {incomePayers.map(payer => {
                  const txCount = allTransactions.filter(t => t.payerId === payer.id).length;
                  const isArchived = Boolean(payer.isArchived);

                  return (
                    <tr key={payer.id} style={{ opacity: isArchived ? 0.6 : 1 }}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Building size={16} color="var(--primary-color)" />
                          <span>{payer.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        <span className="badge" style={{ backgroundColor: 'var(--bg-secondary, #f3f4f6)' }}>
                          {txCount} opération{txCount > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isArchived ? 'badge-planned' : 'badge-cleared'}`}>
                          {isArchived ? 'Archivé' : 'Actif'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button 
                            variant="icon" 
                            title="Renommer l'organisme" 
                            onClick={() => handleOpenPayerModal(payer)}
                          >
                            <Edit2 size={16} />
                          </Button>
                          <Button 
                            variant="icon" 
                            title={isArchived ? 'Réactiver l\'organisme' : 'Archiver l\'organisme'} 
                            onClick={() => handleToggleArchivePayer(payer)}
                          >
                            {isArchived ? <ArchiveRestore size={16} color="var(--success-color)" /> : <Archive size={16} color="var(--warning-color)" />}
                          </Button>
                          <Button 
                            variant="icon" 
                            title="Supprimer définitivement" 
                            onClick={() => handleDeletePayer(payer)}
                          >
                            <Trash2 size={16} color="var(--danger-color)" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {incomePayers.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      Aucun organisme verseur configuré. Cliquez sur « Ajouter un organisme » pour en déclarer un.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3 : GESTION DES CATÉGORIES                                   */}
      {/* ==================================================================== */}
      {activeSection === 'categories' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Gestion des catégories de budget" value="" />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {CATEGORY_TYPES.map(type => (
              <Button 
                key={type.id} 
                variant={activeCatTab === type.id ? 'primary' : 'outline'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setActiveCatTab(type.id);
                }}
              >
                {type.label}
              </Button>
            ))}
          </div>

          <div className="table-container">
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Catégories : {CATEGORY_TYPES.find(t => t.id === activeCatTab)?.label}</h2>
              <Button onClick={() => handleOpenCatModal()} icon={<Plus size={16} />}>Ajouter une catégorie</Button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom de la catégorie</th>
                  <th>Statut</th>
                  <th style={{ width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentCategories.map(cat => (
                  <tr key={cat.id} style={{ opacity: cat.isArchived ? 0.6 : 1 }}>
                    <td>{cat.name}</td>
                    <td>
                      <span className={`badge ${cat.isArchived ? 'badge-planned' : 'badge-cleared'}`}>
                        {cat.isArchived ? 'Archivée' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="icon" onClick={() => handleOpenCatModal(cat)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button variant="icon" onClick={() => handleToggleArchiveCat(cat)}>
                          {cat.isArchived ? <ArchiveRestore size={16} color="var(--success-color)" /> : <Archive size={16} color="var(--warning-color)" />}
                        </Button>
                        <Button variant="icon" onClick={() => handleDeleteCat(cat)}>
                          <Trash2 size={16} color="var(--danger-color)" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {currentCategories.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>Aucune catégorie.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3b : HISTORIQUE DES CAPITAUX DES PRÊTS                       */}
      {/* ==================================================================== */}
      {activeSection === 'loans_history' && (
        <LoanCapitalHistoryManager />
      )}

      {/* ==================================================================== */}
      {/* SECTION 4 : SAUVEGARDE ET RESTAURATION                              */}
      {activeSection === 'backup' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Sauvegarde et Restauration des données" value="" />
          </div>

          {maintenanceMessage && (
            <div style={{
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              backgroundColor: maintenanceMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: maintenanceMessage.type === 'success' ? '1px solid #22c55e' : '1px solid #ef4444',
              color: maintenanceMessage.type === 'success' ? '#166534' : '#991b1b'
            }}>
              {maintenanceMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{maintenanceMessage.text}</span>
            </div>
          )}

          {/* SOUS-SECTION 1 : EXPORT ANALYTIQUE EXCEL */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <FileText size={22} color="var(--primary-color)" />
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Export analytique complet Excel (.xlsx)</h3>
            </div>
            <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
              Génère un classeur multi-feuilles complet (Tableau de bord, Revenus, Charges, Dépenses réelles avec statuts exacts, Santé, Crédits, Épargne et Analyses croisées) compatible à 100 % avec <strong>Microsoft Excel</strong> et <strong>LibreOffice Calc</strong>.
            </p>
            <div>
              <Button 
                variant="primary" 
                icon={<FileText size={16} />}
                onClick={handleOpenExcelPeriodModal}
                disabled={isExportingExcel}
              >
                Exporter au format Excel (.xlsx)
              </Button>
            </div>
          </div>

          {/* SOUS-SECTION 2 : SAUVEGARDE DIRECTE DU FICHIER SQLITE (.DB) */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <HardDrive size={22} color="var(--primary-color)" />
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Sauvegarde directe du fichier SQLite (.db)</h3>
            </div>
            <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.9rem', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
              Téléchargez un instantané complet et intègre de votre base SQLite à chaud sans interruption de service, ou restaurez un fichier existant. Une copie de sécurité automatique est créée avant tout remplacement.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <a 
                href={apiClient.maintenance.getDownloadDbUrl()}
                download
                style={{ textDecoration: 'none' }}
              >
                <Button variant="primary" icon={<Download size={16} />}>
                  Télécharger la copie (.db)
                </Button>
              </a>

              <input
                type="file"
                ref={dbFileInputRef}
                accept=".db,.sqlite,.sqlite3"
                style={{ display: 'none' }}
                onChange={handleRestoreDbFile}
              />
              <Button
                variant="outline"
                icon={<Upload size={16} />}
                onClick={() => dbFileInputRef.current?.click()}
                disabled={isRestoringDbFile}
              >
                {isRestoringDbFile ? 'Vérification et restauration...' : 'Restaurer un fichier (.db)'}
              </Button>
            </div>

            {/* RESTAURATION DIRECTE DEPUIS LES INSTANTANÉS SERVEUR */}
            <div style={{ marginTop: '1.5rem', padding: '1.25rem', backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <RotateCcw size={16} color="var(--primary-color)" />
                  <span>Restaurer directement un instantané conservé sur le serveur</span>
                </div>
                <Button 
                  variant="outline" 
                  icon={<RefreshCw size={12} />} 
                  onClick={fetchServerSnapshots}
                  disabled={isLoadingSnapshots}
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                >
                  {isLoadingSnapshots ? '...' : 'Actualiser la liste'}
                </Button>
              </div>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                Sélectionnez l'une des sauvegardes automatiques quotidiennes (7 derniers jours) ou une copie de sécurité précédente pour restaurer votre état en un clic sans transfert réseau.
              </p>

              {serverSnapshots.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)', fontStyle: 'italic' }}>
                  {isLoadingSnapshots ? 'Recherche des instantanés...' : 'Aucun instantané disponible sur le serveur pour le moment.'}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="form-control"
                    style={{ maxWidth: '480px', fontSize: '0.85rem' }}
                    value={selectedSnapshotFileName}
                    onChange={e => setSelectedSnapshotFileName(e.target.value)}
                  >
                    {serverSnapshots.map(snap => (
                      <option key={snap.relativePath} value={snap.relativePath}>
                        {snap.type === 'auto' ? '📅 [Auto] ' : snap.type === 'safety' ? '🛡️ [Sécurité] ' : '💾 [Manuel] '}
                        {snap.label} — {snap.createdFormatted} ({snap.sizeFormatted})
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="primary"
                    icon={<RotateCcw size={15} />}
                    onClick={() => setIsConfirmSnapshotModalOpen(true)}
                    disabled={!selectedSnapshotFileName || isRestoringSnapshot}
                  >
                    {isRestoringSnapshot ? 'Restauration en cours...' : 'Restaurer cet instantané'}
                  </Button>
                </div>
              )}
            </div>

            {/* NETTOYAGE / PURGE DES SAUVEGARDES DU SERVEUR */}
            <div style={{ marginTop: '1.25rem', padding: '1.25rem', backgroundColor: 'rgba(245, 158, 11, 0.05)', borderRadius: '8px', border: '1px solid #fcd34d' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', maxWidth: '700px' }}>
                  <Trash2 size={20} color="#d97706" style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', color: '#b45309' }}>Nettoyer les anciennes sauvegardes</h4>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                      Supprime tous les fichiers de sauvegarde (.db et .json) stockés sur le serveur (sauvegardes automatiques ou résiduelles). La base active en cours d'utilisation reste strictement intacte.
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  icon={<Trash2 size={15} />}
                  onClick={handlePurgeBackups}
                  disabled={isPurgingBackups || (serverSnapshots.length === 0 && !isLoadingSnapshots)}
                  style={{ borderColor: '#d97706', color: '#b45309', whiteSpace: 'nowrap' }}
                >
                  {isPurgingBackups ? 'Purge en cours...' : 'Purger les sauvegardes'}
                </Button>
              </div>
            </div>
          </div>

          {/* SOUS-SECTION 3 : ZONE DE DANGER - RÉINITIALISATION COMPLÈTE */}
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.03)', padding: '1.5rem', borderRadius: '10px', border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <AlertCircle size={22} color="#ef4444" />
              <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#dc2626' }}>Zone de danger : Remise à zéro des données</h4>
            </div>
            <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Cette opération efface toutes les opérations, crédits, historique de capital des prêts, récurrences, comptes et organismes pour repartir d'une base vierge. Vos identifiants de connexion sont strictement préservés, et une copie de sécurité automatique est créée avant toute suppression.
            </p>
            <Button
              variant="outline"
              icon={<RotateCcw size={16} />}
              onClick={() => {
                setResetConfirmationInput('');
                setIsResetModalOpen(true);
              }}
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              Réinitialiser la base de données...
            </Button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION : APPARENCE & CONFIDENTIALITÉ                                */}
      {/* ==================================================================== */}
      {activeSection === 'preferences' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Apparence & Confidentialité" value="" />
          </div>

          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ 
                width: 40, 
                height: 40, 
                borderRadius: '8px', 
                backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Palette size={22} color="var(--primary-color)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Thème d'affichage</h3>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem' }}>
                  Personnalisez les couleurs de l'interface pour un confort optimal de jour comme de nuit.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setTheme('light')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1.25rem 1rem',
                  borderRadius: '10px',
                  border: theme === 'light' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: theme === 'light' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: 'var(--text-color)'
                }}
              >
                <Sun size={26} color="#f59e0b" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Clair</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)' }}>Fond blanc éclatant</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1.25rem 1rem',
                  borderRadius: '10px',
                  border: theme === 'dark' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: theme === 'dark' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: 'var(--text-color)'
                }}
              >
                <Moon size={26} color="#818cf8" />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Sombre</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)' }}>Repose les yeux le soir</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('auto')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1.25rem 1rem',
                  borderRadius: '10px',
                  border: theme === 'auto' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: theme === 'auto' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  color: 'var(--text-color)'
                }}
              >
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <Sun size={18} color="#f59e0b" />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)' }}>/</span>
                  <Moon size={18} color="#818cf8" />
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Automatique</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)' }}>Suit le système de votre appareil</span>
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '8px', 
                  backgroundColor: isPrivacyMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  {isPrivacyMode ? <EyeOff size={22} color="#ef4444" /> : <Eye size={22} color="#10b981" />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Mode discret (Masquage des montants)</h3>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem' }}>
                    Floute automatiquement les montants en euros sur tous vos écrans. Survolez un montant avec votre curseur pour le révéler temporairement.
                  </p>
                </div>
              </div>

              <Button
                variant={isPrivacyMode ? 'primary' : 'outline'}
                icon={isPrivacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
                onClick={togglePrivacyMode}
                style={isPrivacyMode ? { backgroundColor: '#ef4444', borderColor: '#ef4444' } : {}}
              >
                {isPrivacyMode ? 'Mode discret ACTIF' : 'Activer le mode discret'}
              </Button>
            </div>

            <div style={{ marginTop: '1.25rem', padding: '1rem', backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                Exemple de rendu : <strong>Solde réel du compte</strong>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                <span className="kpi-value privacy-blur">2 450,80 €</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 5 : SERVEUR PROXMOX & SYNCHRONISATION                        */}
      {/* ==================================================================== */}
      {activeSection === 'server' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Serveur personnel Proxmox & Synchronisation multi-appareils" value="" />
          </div>

          {/* CARTE 1 : BASE CENTRALISÉE SQLITE & ACCÈS DISTANT VPN */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '10px',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Server size={22} color="#3b82f6" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Base centralisée SQLite & Accès distant VPN</h3>
                  <span style={{ 
                    fontSize: '0.85rem', 
                    color: serverData?.error ? '#ef4444' : (serverData ? 'var(--success-color, #22c55e)' : 'var(--text-secondary, #888)'), 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.35rem', 
                    marginTop: '0.2rem' 
                  }}>
                    <span style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: '50%', 
                      backgroundColor: serverData?.error ? '#ef4444' : (serverData ? '#22c55e' : '#f59e0b'), 
                      display: 'inline-block' 
                    }} />
                    {serverData?.error 
                      ? 'Serveur déconnecté (Injoignable)' 
                      : (serverData ? 'Connecté au serveur central SQLite (Synchro temps réel)' : 'Mode local / Standalone')}
                  </span>
                </div>
              </div>

              {isAuthenticated && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #666)' }}>
                    Session : <strong>{user?.username || 'Administrateur'}</strong>
                  </span>
                  <Button 
                    variant="outline" 
                    icon={<Lock size={15} />}
                    onClick={handleOpenPasswordModal}
                  >
                    Mot de passe
                  </Button>
                  <Button 
                    variant="outline" 
                    icon={<KeyRound size={15} />}
                    onClick={handleShowRecoveryKey}
                    disabled={recoveryKeyLoading}
                  >
                    {recoveryKeyLoading ? 'Clé...' : 'Clé de secours'}
                  </Button>
                  <Button 
                    variant="outline" 
                    icon={<LogOut size={15} />}
                    onClick={logout}
                  >
                    Déconnexion
                  </Button>
                </div>
              )}
            </div>

            <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Budget Perso Pro est raccordé à la base SQLite centralisée. Toutes les modifications effectuées depuis votre PC ou votre iPhone sont instantanément persistées sur le serveur et synchronisées sans conflit.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Comptes synchronisés</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{serverData?.accounts.length ?? accounts.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Organismes verseurs</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{serverData?.incomePayers.length ?? incomePayers.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Opérations en base</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{serverData?.transactions.length ?? allTransactions.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Crédits & prêts</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{serverData?.loans.length ?? loans.length}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Version installée</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary, #888)', fontSize: '0.8rem' }}>Dernière synchro</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '0.2rem' }}>
                  {serverData?.lastSyncTime ? new Date(serverData.lastSyncTime).toLocaleTimeString('fr-FR') : 'À l\'instant'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
              <Button
                variant="outline"
                icon={<RefreshCw size={16} />}
                onClick={() => {
                  serverData?.refreshAll();
                  fetchMaintenanceStatus();
                }}
                disabled={serverData?.isSyncing}
              >
                {serverData?.isSyncing ? 'Actualisation...' : 'Rafraîchir depuis le serveur'}
              </Button>
            </div>

            {/* MESSAGES DE FEEDBACK MAINTENANCE */}
            {maintenanceMessage && (
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: maintenanceMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${maintenanceMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
                color: maintenanceMessage.type === 'success' ? '#166534' : '#991b1b'
              }}>
                {maintenanceMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{maintenanceMessage.text}</span>
              </div>
            )}

          </div>

          {/* CARTE 2 : RESSOURCES SYSTÈME & RÉSEAU PROXMOX */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '10px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Activity size={22} color="#10b981" />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Ressources système & Réseau Proxmox</h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginTop: '0.15rem' }}>
                    Métriques et performances temps réel du conteneur
                  </div>
                </div>
              </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #888)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                  <span>Métriques temps réel du conteneur</span>
                </div>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                gap: '1rem', 
                marginBottom: '1.25rem' 
              }}>
                {/* 1. UPTIME SERVEUR */}
                <div style={{ 
                  padding: '1.1rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '115px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #666)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <Clock size={14} color="var(--primary-color)" />
                      <span>Uptime serveur</span>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>
                      {maintenanceStatus?.systemMetrics?.uptimeFormatted || 'En cours...'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: '0.4rem' }}>
                    Temps de disponibilité continu
                  </div>
                </div>

                {/* 2. ADRESSE IP DU SERVEUR */}
                <div style={{ 
                  padding: '1.1rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '115px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #666)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                      <Network size={14} color="var(--primary-color)" />
                      <span>Adresse d'accès & Port</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary-color)', wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' && window.location ? window.location.hostname : '127.0.0.1'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', marginTop: '0.4rem', lineHeight: '1.3' }}>
                    Port actif : <strong>{typeof window !== 'undefined' && window.location && window.location.port ? window.location.port : '3001'}</strong> (HTTP)
                    {maintenanceStatus?.systemMetrics?.serverIp && maintenanceStatus.systemMetrics.serverIp !== '127.0.0.1' && (
                      <span style={{ display: 'block', fontSize: '0.68rem', opacity: 0.85, marginTop: '0.15rem' }}>
                        Passerelle interne Docker : {maintenanceStatus.systemMetrics.serverIp}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. UTILISATION CPU & CHARGE */}
                <div style={{ 
                  padding: '1.1rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '115px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #666)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Cpu size={14} color="var(--primary-color)" />
                        <span>CPU ({maintenanceStatus?.systemMetrics?.cpu?.cores || 1} cœurs)</span>
                      </span>
                      {maintenanceStatus?.systemMetrics?.cpu && (
                        <span style={{
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          backgroundColor: maintenanceStatus.systemMetrics.cpu.usagePercent >= 80 
                            ? 'rgba(239, 68, 68, 0.15)' 
                            : maintenanceStatus.systemMetrics.cpu.usagePercent >= 50 
                              ? 'rgba(245, 158, 11, 0.15)' 
                              : 'rgba(34, 197, 94, 0.15)',
                          color: maintenanceStatus.systemMetrics.cpu.usagePercent >= 80 
                            ? '#dc2626' 
                            : maintenanceStatus.systemMetrics.cpu.usagePercent >= 50 
                              ? '#d97706' 
                              : '#16a34a'
                        }}>
                          {maintenanceStatus.systemMetrics.cpu.usagePercent >= 80 ? 'Élevé' : maintenanceStatus.systemMetrics.cpu.usagePercent >= 50 ? 'Modéré' : 'Optimal'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                      <span>{maintenanceStatus?.systemMetrics?.cpu?.usagePercent ?? 0}%</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #888)', fontWeight: 'normal' }}>
                        load {maintenanceStatus?.systemMetrics?.cpu?.loadFormatted || '0.00'}
                      </span>
                    </div>
                  </div>
                  {/* Jauge CPU visuelle */}
                  <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color, #e2e8f0)', borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(0, maintenanceStatus?.systemMetrics?.cpu?.usagePercent ?? 0))}%`,
                      height: '100%',
                      borderRadius: '3px',
                      backgroundColor: (maintenanceStatus?.systemMetrics?.cpu?.usagePercent ?? 0) >= 80
                        ? '#ef4444'
                        : (maintenanceStatus?.systemMetrics?.cpu?.usagePercent ?? 0) >= 50
                          ? '#f59e0b'
                          : '#22c55e',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* 4. MÉMOIRE VIVE (RAM) */}
                <div style={{ 
                  padding: '1.1rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '115px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #666)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.85rem' }}>🧠</span>
                        <span>Mémoire RAM</span>
                      </span>
                      {maintenanceStatus?.systemMetrics?.ramStats && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #666)' }}>
                          {maintenanceStatus.systemMetrics.ramStats.percentUsed}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                      {maintenanceStatus?.systemMetrics?.ramStats
                        ? maintenanceStatus.systemMetrics.ramStats.usedFormatted
                        : maintenanceStatus?.systemMetrics?.memoryUsageFormatted || '...'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary, #888)', marginTop: '0.2rem' }}>
                      {maintenanceStatus?.systemMetrics?.ramStats
                        ? `Sur ${maintenanceStatus.systemMetrics.ramStats.totalFormatted} (${maintenanceStatus.systemMetrics.ramStats.freeFormatted} libres)`
                        : `Processus : ${maintenanceStatus?.systemMetrics?.memoryUsageFormatted || '...'}`}
                    </div>
                    {/* Jauge RAM visuelle */}
                    {maintenanceStatus?.systemMetrics?.ramStats && (
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color, #e2e8f0)', borderRadius: '3px', marginTop: '0.45rem', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0, maintenanceStatus.systemMetrics.ramStats.percentUsed))}%`,
                          height: '100%',
                          borderRadius: '3px',
                          backgroundColor: maintenanceStatus.systemMetrics.ramStats.percentUsed >= 85
                            ? '#ef4444'
                            : maintenanceStatus.systemMetrics.ramStats.percentUsed >= 70
                              ? '#f59e0b'
                              : '#3b82f6',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. ESPACE DISQUE DE STOCKAGE */}
                <div style={{ 
                  padding: '1.1rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '115px'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #666)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <HardDrive size={14} color="var(--primary-color)" />
                        <span>Disque stockage</span>
                      </span>
                      {maintenanceStatus?.systemMetrics?.diskStats && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary, #666)' }}>
                          {maintenanceStatus.systemMetrics.diskStats.percentUsed}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                      {maintenanceStatus?.systemMetrics?.diskStats 
                        ? `${maintenanceStatus.systemMetrics.diskStats.freeFormatted} libres`
                        : 'Non disponible'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary, #888)', marginTop: '0.2rem' }}>
                      {maintenanceStatus?.systemMetrics?.diskStats
                        ? `Sur ${maintenanceStatus.systemMetrics.diskStats.totalFormatted} (${maintenanceStatus.systemMetrics.diskStats.usedFormatted} occupés)`
                        : 'Volume Proxmox'}
                    </div>
                    {/* Jauge Disque visuelle */}
                    {maintenanceStatus?.systemMetrics?.diskStats && (
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color, #e2e8f0)', borderRadius: '3px', marginTop: '0.45rem', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0, maintenanceStatus.systemMetrics.diskStats.percentUsed))}%`,
                          height: '100%',
                          borderRadius: '3px',
                          backgroundColor: maintenanceStatus.systemMetrics.diskStats.percentUsed >= 90
                            ? '#ef4444'
                            : maintenanceStatus.systemMetrics.diskStats.percentUsed >= 75
                              ? '#f59e0b'
                              : '#22c55e',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          {/* CARTE 3 : SANTÉ & OPTIMISATION DU FICHIER SQLITE */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #0284c7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: '10px',
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Wrench size={22} color="#0284c7" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Santé & Optimisation du fichier SQLite</h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginTop: '0.15rem' }}>
                  Diagnostic d'intégrité, compactions WAL et réparation assistée
                </div>
              </div>
            </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>Intégrité B-Tree SQLite</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: maintenanceStatus?.integrity === 'ok' ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <ShieldCheck size={18} />
                    {maintenanceStatus?.integrity === 'ok' ? 'Excellente (PRAGMA OK)' : (maintenanceStatus?.integrity || 'En attente...')}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>Taille de la base principale</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {maintenanceStatus?.dbSizeFormatted || '...'}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>Journal des transactions (WAL)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.2rem' }}>
                    {maintenanceStatus?.walSizeFormatted || '0 o'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="primary"
                  icon={<ShieldCheck size={16} />}
                  onClick={handleRunDoctorAudit}
                  disabled={isDoctorAuditing}
                  style={{
                    backgroundColor: '#059669',
                    borderColor: '#059669',
                    color: '#ffffff',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {isDoctorAuditing ? 'Diagnostic...' : 'Audit Intégrité (DB Doctor)'}
                </Button>
                <Button
                  variant="primary"
                  icon={<Database size={16} />}
                  onClick={handleVacuum}
                  disabled={isVacuuming || isCheckingMaintenance}
                  style={{
                    backgroundColor: '#0284c7',
                    borderColor: '#0284c7',
                    color: '#ffffff',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  {isVacuuming ? 'Optimisation en cours...' : 'Optimiser & Compacter (VACUUM)'}
                </Button>
                <Button
                  variant="danger"
                  icon={<Power size={16} />}
                  onClick={() => setIsRestartModalOpen(true)}
                  disabled={isRestarting}
                  style={{ marginLeft: 'auto', fontWeight: 600 }}
                >
                  {isRestarting ? 'Redémarrage...' : 'Redémarrer le serveur'}
                </Button>
              </div>

              {/* PANNEAU DB DOCTOR & SAFE HEALER */}
              {doctorReport && (
                <div style={{ 
                  marginTop: '1.25rem', 
                  padding: '1.25rem', 
                  backgroundColor: 'var(--bg-secondary, #fafafa)', 
                  border: `1px solid ${doctorReport.status === 'healthy' ? '#10b981' : doctorReport.status === 'warning' ? '#f59e0b' : '#ef4444'}`, 
                  borderRadius: '8px' 
                }}>
                  {/* Entête Santé */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {doctorReport.status === 'healthy' && <CheckCircle size={22} color="#10b981" />}
                      {doctorReport.status === 'warning' && <AlertTriangle size={22} color="#f59e0b" />}
                      {doctorReport.status === 'critical' && <AlertCircle size={22} color="#ef4444" />}
                      <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {doctorReport.status === 'healthy' ? 'Base de données 100 % saine et intègre' : `${doctorReport.totalAnomalies} anomalie(s) détectée(s)`}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      SQLite quick_check: <strong>{doctorReport.sqliteIntegrity}</strong> • Audit: {new Date(doctorReport.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {/* Cartouche Métriques & Ventilation Dynamique des 30 Contrats */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                    gap: '0.6rem', 
                    marginBottom: '1rem',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ padding: '0.6rem', backgroundColor: 'var(--card-bg, #fff)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>Transactions actives</div>
                      <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: '0.2rem' }}>{doctorReport.metrics.totalActiveTransactions}</div>
                    </div>
                    <div style={{ padding: '0.6rem', backgroundColor: 'var(--card-bg, #fff)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>Comptes bancaires</div>
                      <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: '0.2rem' }}>{doctorReport.metrics.totalAccounts}</div>
                    </div>
                    <div style={{ padding: '0.6rem', backgroundColor: 'var(--card-bg, #fff)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>Prêts & Crédits</div>
                      <div style={{ fontWeight: 600, fontSize: '1.05rem', marginTop: '0.2rem' }}>{doctorReport.metrics.totalLoans}</div>
                    </div>
                    <div style={{ padding: '0.6rem', backgroundColor: 'var(--card-bg, #fff)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ color: 'var(--text-secondary)' }}>Contrats récurrents ({doctorReport.metrics.totalRecurrenceTemplates})</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', lineHeight: '1.3' }}>
                        • <strong>{doctorReport.metrics.activeFixedTemplates}</strong> fixes actives<br/>
                        • <strong>{doctorReport.metrics.activeIncomeTemplates}</strong> revenus actifs<br/>
                        • <strong>{doctorReport.metrics.activeVariableTemplates}</strong> variables actives<br/>
                        • <strong>{doctorReport.metrics.inactiveTemplates}</strong> désactivée(s)
                      </div>
                    </div>
                  </div>

                  {/* Liste des anomalies ou message sain */}
                  {doctorReport.totalAnomalies === 0 ? (
                    <div style={{ padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#065f46', borderRadius: '6px', fontSize: '0.9rem' }}>
                      Aucune incohérence relationnelle, aucun orphelin et aucun doublon. Votre base SQLite fonctionne à plein régime.
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '0.6rem', fontSize: '0.95rem' }}>
                        Détail des anomalies nécessitant un traitement ou un arbitrage :
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                        {doctorReport.anomalies.map((anom) => (
                          <div key={anom.id} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg, #fff)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                              <span style={{ fontWeight: 600, color: anom.severity === 'blocker' || anom.severity === 'critical' ? '#dc2626' : '#d97706' }}>
                                [{anom.id}] {anom.name} ({anom.count})
                              </span>
                              <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: anom.severity === 'blocker' ? '#fee2e2' : '#fef3c7', color: anom.severity === 'blocker' ? '#991b1b' : '#92400e', fontWeight: 600 }}>
                                {anom.severity.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                              {anom.description}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontStyle: 'italic' }}>
                              Politique : {anom.remediationPolicy}
                            </div>

                            {/* Contrôles d'arbitrage assisté selon le type d'anomalie */}
                            {(anom.id === 'ANOM-04' || anom.id === 'ANOM-05') && (
                              <div style={{ marginTop: '0.6rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                  Compte bancaire cible obligatoire pour réassignation :
                                </label>
                                <select 
                                  value={selectedTargetAccount} 
                                  onChange={e => setSelectedTargetAccount(e.target.value)}
                                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                                >
                                  <option value="">-- Sélectionnez un compte bancaire --</option>
                                  {(serverData?.accounts || []).map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {anom.id === 'ANOM-03' && (
                              <div style={{ marginTop: '0.6rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                  Action sur les mensualités de prêt :
                                </label>
                                <select 
                                  value={selectedTargetLoan} 
                                  onChange={e => setSelectedTargetLoan(e.target.value)}
                                  style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                                >
                                  <option value="">Détacher (linkedId = NULL, recommandé)</option>
                                  {(serverData?.loans || []).map(loan => (
                                    <option key={loan.id} value={loan.id}>Rattacher à : {loan.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {anom.id === 'ANOM-13' && (
                              <div style={{ marginTop: '0.6rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                                  Résolution des échéances passées prévues :
                                </label>
                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                    <input 
                                      type="radio" 
                                      name="pastPlannedRes" 
                                      checked={pastPlannedResolution === 'clear'} 
                                      onChange={() => setPastPlannedResolution('clear')} 
                                    />
                                    Pointer comme Payé (cleared)
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                                    <input 
                                      type="radio" 
                                      name="pastPlannedRes" 
                                      checked={pastPlannedResolution === 'trash'} 
                                      onChange={() => setPastPlannedResolution('trash')} 
                                    />
                                    Mettre à la corbeille (soft-delete)
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Bouton de simulation Dry-Run */}
                      <Button
                        variant="primary"
                        icon={<Eye size={16} />}
                        onClick={handlePreviewHealer}
                        disabled={isHealerPreviewing}
                      >
                        {isHealerPreviewing ? 'Simulation en cours...' : 'Simuler la réparation (Dry-Run)'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* MODALE DRY-RUN HEALER */}
              <Modal
                isOpen={isDryRunModalOpen}
                onClose={() => setIsDryRunModalOpen(false)}
                title="Simulation de réparation sécurisée (Dry-Run)"
              >
                <div>
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {healerResult?.totalModifications || 0} modification(s) chirurgicale(s) projetée(s)
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Cette simulation n'a modifié aucun octet en base. Le tableau ci-dessous liste l'intégralité des ajustements réels.
                    </div>
                  </div>

                  {healerResult?.diffs && healerResult.diffs.length > 0 && (
                    <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--bg-secondary)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem' }}>Table</th>
                            <th style={{ padding: '0.5rem' }}>ID</th>
                            <th style={{ padding: '0.5rem' }}>Champ</th>
                            <th style={{ padding: '0.5rem' }}>Avant</th>
                            <th style={{ padding: '0.5rem' }}>Après</th>
                            <th style={{ padding: '0.5rem' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {healerResult.diffs.map((diff, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{diff.table}</td>
                              <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{diff.recordId.slice(0, 8)}...</td>
                              <td style={{ padding: '0.5rem', fontWeight: 500 }}>{diff.field}</td>
                              <td style={{ padding: '0.5rem', color: '#ef4444' }}>{String(diff.oldValue ?? 'NULL')}</td>
                              <td style={{ padding: '0.5rem', color: '#10b981' }}>{String(diff.newValue ?? 'NULL')}</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>{diff.action}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ 
                    marginBottom: '1.25rem', 
                    padding: '0.75rem', 
                    backgroundColor: healerResult?.postAudit.totalAnomalies === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
                    borderRadius: '6px' 
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: healerResult?.postAudit.totalAnomalies === 0 ? '#065f46' : '#92400e' }}>
                      Contre-audit projeté : {healerResult?.postAudit.totalAnomalies === 0 ? 'Base 100 % saine (0 anomalie restante)' : `${healerResult?.postAudit.totalAnomalies} anomalie(s) restante(s)`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <Button variant="outline" onClick={() => setIsDryRunModalOpen(false)}>
                      Annuler
                    </Button>
                    <Button
                      variant="primary"
                      icon={<Wrench size={16} />}
                      onClick={handleApplyHealer}
                      disabled={isHealerApplying}
                    >
                      {isHealerApplying ? 'Application...' : 'Confirmer et appliquer la réparation'}
                    </Button>
                  </div>
                </div>
              </Modal>
          </div>

          {/* CARTE 4 : JOURNAL DES ÉVÉNEMENTS TECHNIQUES (LOGS) */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '10px',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Terminal size={22} color="#8b5cf6" />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Journal des événements techniques (Logs)</h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginTop: '0.15rem' }}>
                    Audit tournant et traçabilité des opérations serveur
                  </div>
                </div>
              </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline"
                    icon={<RefreshCw size={14} />}
                    onClick={fetchTechnicalLogs}
                    disabled={isLoadingLogs}
                  >
                    {isLoadingLogs ? '...' : 'Actualiser'}
                  </Button>
                  <a
                    href={apiClient.maintenance.getDownloadLogsUrl()}
                    download
                    style={{ textDecoration: 'none' }}
                  >
                    <Button variant="outline" icon={<Download size={14} />}>
                      Télécharger (.log)
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    icon={<Trash2 size={14} />}
                    onClick={handleClearTechnicalLogs}
                  >
                    Effacer
                  </Button>
                </div>
              </div>

              <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                Historique des démarrages serveur, requêtes HTTP, avertissements et erreurs SQLite. Rotation automatique active (taille max 5 Mo).
              </p>

              <div style={{
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                borderRadius: '8px',
                padding: '1rem',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid #334155',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}>
                {technicalLogs.length > 0 ? (
                  technicalLogs.map((line, idx) => {
                    let color = '#94a3b8';
                    if (line.includes('[ERROR]')) color = '#f87171';
                    else if (line.includes('[WARN ]')) color = '#fbbf24';
                    else if (line.includes('[INFO ]')) color = '#38bdf8';
                    return (
                      <div key={idx} style={{ color, marginBottom: '2px' }}>
                        {line}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                    Aucun événement technique récent dans le journal.
                  </div>
                )}
              </div>

            {/* PIED DE PAGE : MENTION AUTEUR & VISION */}
            <div style={{ 
              marginTop: '2rem', 
              paddingTop: '1.5rem', 
              borderTop: '1px solid var(--border-color)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              flexWrap: 'wrap', 
              gap: '1rem',
              color: 'var(--text-secondary, #777)',
              fontSize: '0.85rem'
            }}>
              <div>
                <span>PersonalBudgetPro • Conçu et développé par <strong>Yann Donne</strong> • Application souveraine et autonome</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveSection('help')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-color)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'underline'
                  }}
                >
                  Manuel & Documentation
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 8 : AIDE & DOCUMENTATION (MANUEL COMPLET)                     */}
      {/* ==================================================================== */}
      {activeSection === 'help' && (
        <div>
          <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: '1fr' }}>
            <Card title="Aide, Mode d'emploi & Documentation Technique" value="" />
          </div>

          <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <BookOpen size={28} color="var(--primary-color)" />
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.3rem' }}>Manuel de Référence PersonalBudgetPro</h2>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.9rem' }}>
                    Guide utilisateur pour le quotidien et documentation technique d'administration serveur.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                  Version : <strong>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</strong>
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                  • Auteur : <strong>Yann Donne</strong>
                </span>
              </div>
            </div>

            {/* PRESENTATION SOUVERAINETE */}
            <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '1.75rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                🛡️ Souveraineté & Confidentialité Absolue
              </h3>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-color)' }}>
                PersonalBudgetPro est conçu pour fonctionner en totale autonomie sur votre propre infrastructure personnelle (PC, serveur Proxmox, conteneur Docker). Vos finances ne transitent par aucun serveur tiers opaque, aucune publicité, aucun traqueur. Vous conservez la maîtrise exclusive et intégrale de votre patrimoine.
              </p>
            </div>

            {/* PARTIE 1 : GUIDE UTILISATEUR */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-color)' }}>
                <span>📘 Guide Utilisateur (Au Quotidien)</span>
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>📊 Tableau de bord</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Visualisez instantanément vos soldes réels, le reste à vivre réel jusqu'à la fin du mois, la courbe d'évolution de l'épargne et le graphique d'amortissement de vos crédits (sans projection fictive).
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>💡 Flash Insights (Conseiller)</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Audit automatique et souverain de votre trésorerie en temps réel (anti-découvert intrajournalier, opportunités d'épargne, dérives des dépenses, vigilance livrets et reste à charge santé).
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>📈 Analyse des Charges</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Pilotage stratégique de vos contrats et enveloppes de charges : calcul du taux d'effort fixe réel sur rentrées constatées, détection automatique des hausses tarifaires et cadrage des charges variables.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>💼 Revenus & Organismes</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Saisie de vos salaires, primes ou pensions. Associez-les à des organismes verseurs (employeurs, caisses) et définissez des récurrences mensuelles automatiques.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>📑 Charges Fixes & Variables</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Pointez vos charges au fur et à mesure de leur prélèvement effectif. Les charges prévues non pointées sont automatiquement déduites du reste à vivre.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>💳 Dépenses du Quotidien</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Enregistrez vos tickets, courses et sorties. L'application recalcule instantanément le solde de vos comptes bancaires.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>🛍️ Projets & Prévisions</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Planifiez vos futurs achats (vacances, travaux, révision) avec degré d'urgence (Indispensable, Souhaitable, Optionnel) et date cible.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>🩺 Pôle Santé & Remboursements</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Suivez vos dépenses de soins et les remboursements Sécurité Sociale / Mutuelle pour calculer précisément votre reste à charge.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>🏦 Crédits & Désendettement</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Suivi des prêts immobiliers et conso. Possibilité d'importer jusqu'à 10 ans d'historique réel en CSV (modèle téléchargeable dans les paramètres).
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem' }}>🐷 Épargne & Transferts</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                    Gérez vos comptes d'épargne ainsi que tous les virements internes (entre livrets, vers l'épargne ou entre comptes courants). Distinguez les versements réels vers l'épargne (enrichissement) des retraits (mobilisation de trésorerie interne) sans fausser vos bilans.
                  </p>
                </div>
              </div>

              {/* NOUVEAUTE V1.2.0 : CONSEILLER FINANCIER & ANALYSE STRATEGIQUE */}
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ backgroundColor: 'var(--bg-secondary, #fafafa)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>💡 Conseiller Financier & Flash Insights (Moteur Heuristique Local v1.2.0)</span>
                  </h4>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>
                    Intégré directement sur votre Tableau de bord, le Conseiller Financier exécute un audit algorithmique complet de votre situation en moins de <strong>2 millisecondes</strong>, de façon 100 % déterministe en mémoire. Vos données bancaires ne transitent par aucun serveur externe ni modèle d'IA opaque (zéro fuite, confidentialité et souveraineté absolues).
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '4px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#b91c1c' }}>🚨 Rouge (Critique)</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #666)' }}>Risque de découvert bancaire intrajournalier ou reste à vivre négatif.</p>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '4px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#b45309' }}>⚠️ Ambre (Attention)</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #666)' }}>Sur-cadence des dépenses du quotidien ou dérive d'enveloppe variable.</p>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '4px solid #3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.08)' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#1d4ed8' }}>ℹ️ Bleu (Conseil)</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #666)' }}>Recommandation d'optimisation (plafonnement livret A, reste à charge santé).</p>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '6px', borderLeft: '4px solid #10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#047857' }}>✨ Émeraude (Optimal)</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #666)' }}>Opportunité d'épargne détectée sur excédent net prévisionnel ou situation équilibrée.</p>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text-secondary, #555)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>
                      <strong>Priorisation & Ergonomie :</strong> Les 3 conseils les plus urgents s'affichent par défaut. Un bouton permet de déplier l'ensemble des insights si nécessaire. Chaque carte peut être masquée pour la session via sa croix (X), mémorisée localement en sessionStorage sans polluer l'interface, avec un bouton de réinitialisation disponible en permanence.
                    </div>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                      <strong style={{ color: 'var(--primary-color)' }}>⚖️ La Règle d'Or Bancaire du Moteur :</strong>
                      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
                        <li><strong>Anti-découvert (Crash-Test) :</strong> simule jour par jour le <em>Solde Réel intrajournalier</em> en appliquant conventionnellement les débits avant les crédits afin de garantir que vous ne passerez jamais sous zéro entre deux dates.</li>
                        <li><strong>Opportunité d'épargne :</strong> ne s'appuie <em>JAMAIS</em> sur le solde réel de début de mois (qui financera les charges à venir), mais attend STRICTEMENT le <em>Solde Prévisionnel net d'atterrissage</em> minoré du fond de roulement de sécurité (500 € par défaut).</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-secondary, #fafafa)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📈 Analyse des Charges Fixes & Variables (/analyse-charges - v1.2.0)</span>
                  </h4>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-secondary, #555)' }}>
                    Ce module indépendant est strictement séparé de l'<em>Analyse des Dépenses</em> (dédiée aux tickets et courses du quotidien). Il cible la structure de vos coûts contractuels et enveloppes périodiques sur un historique glissant de 6 à 12 mois.
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.85rem', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>📑 Volet Charges Fixes (Contrats incompressibles)</strong>
                      <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary, #555)', lineHeight: 1.5 }}>
                        <li><strong>Taux d'Effort Réel :</strong> calculé exclusivement sur les rentrées réelles constatées (<code style={{ fontSize: '0.75rem' }}>Total Charges Fixes / Revenus Encaissés</code>), alertant si le seuil prudentiel de 33 % est dépassé.</li>
                        <li><strong>Détection des Hausses Tarifaires :</strong> compare chaque contrat entre le mois M et M-1 / moyenne 12 mois. Détecte les augmentations invisibles de forfaits, assurances ou abonnements et calcule immédiatement l'<strong>impact financier annualisé</strong> (+X €/mois = +Y €/an).</li>
                      </ul>
                    </div>

                    <div style={{ padding: '0.85rem', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>⛽ Volet Charges Variables (Enveloppes périodiques)</strong>
                      <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-secondary, #555)', lineHeight: 1.5 }}>
                        <li><strong>Comparaison Réalisé vs Budgété :</strong> confrontation directe des pointages effectifs par rapport aux montants prévus définis dans vos charges.</li>
                        <li><strong>Règle de Dérive Chronique :</strong> si une charge dépasse son budget de plus de 15 % pendant 3 mois consécutifs, le moteur signale un sous-dimensionnement et propose une réévaluation basée sur la moyenne constatée.</li>
                        <li><strong>Pics Saisonniers :</strong> repérage des anomalies et pics de consommation (chauffage d'hiver, révisions estivales, assurances annuelles).</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PARTIE 2 : GUIDE TECHNIQUE & ADMINISTRATION */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-color)' }}>
                <span>⚙️ Guide Technique & Administration Système</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>🐳 Déploiement Conteneurisé (Docker / Proxmox LXC)</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    L'application se déploie via <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>docker compose up -d --build</code> sur le port standard <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>:3001</code>. Deux volumes persistants sont requis : <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>./data</code> (base SQLite et sauvegardes) et <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>./logs</code> (journal des événements).
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>⚡ Moteur SQLite & Mode WAL (Write-Ahead Logging)</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    La base SQLite est automatiquement initialisée avec <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>PRAGMA journal_mode = WAL</code> et <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>busy_timeout = 5000</code>. Cela permet des lectures et écritures simultanées instantanées entre votre PC et votre mobile via VPN, sans aucun verrouillage concurrentiel.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>🛡️ Sauvegardes Automatiques Quotidiennes & Rotation 7 Jours</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    Une sauvegarde physique à chaud est générée chaque jour via <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>VACUUM INTO</code> dans <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>data/backups/auto/</code>. Une rotation conserve en permanence les 7 jours glissants les plus récents. De plus, avant toute restauration, une copie de sécurité préventive est créée automatiquement.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>🧹 Maintenance, Compactage (VACUUM) & Purge</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    L'administrateur peut à tout moment compacter la base via le bouton VACUUM (vidage du WAL et réorganisation des B-Trees) ou purger l'ensemble des fichiers d'instantanés anciens sans jamais impacter la base active <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>budget.db</code>.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>🩺 Diagnostic d'Intégrité (DB Doctor) & Réparations Sécurisées (Safe Healer)</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    Le moteur <strong>DB Doctor</strong> ausculte la base SQLite en 100 % lecture seule (contrôle B-Tree natif et 13 règles forensic de cohérence financière : liens orphelins, doublons, remboursements décorrélés, comptes supprimés). Le démarrage système est strictement passif (<strong>Safe Boot</strong>). En cas d'anomalie, le <strong>DB Healer</strong> permet de tester les corrections à blanc (<code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>Dry-Run</code> avec restitution du diff complet) avant toute application chirurgicale sécurisée par une sauvegarde préalable <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>VACUUM INTO</code>.
                  </p>
                </div>

                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary, #fafafa)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.98rem' }}>🚀 Exploitation & Maintenance Automatisée (Script Shell)</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
                    Le script d'exploitation <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>gestion-personal-budget-pro.sh</code> à la racine du projet automatise la routine de mise à jour, réinstallation et build Docker. Avant chaque opération, il génère une sauvegarde physique SQLite vérifiée par <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>PRAGMA integrity_check</code> et garantit la préservation intégrale des données dans <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>data/</code> et <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>logs/</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* PIED DE PAGE DU MANUEL */}
            <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-secondary, #888)', fontSize: '0.85rem' }}>
              Le manuel complet est également accessible au format Markdown dans le fichier <code style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>README.md</code> à la racine du projet.
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL : COMPTE BANCAIRE                                              */}
      {/* ==================================================================== */}
      <Modal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAccountModalOpen(false)} 
        title={editingAccount ? 'Modifier le compte bancaire' : 'Ajouter un compte bancaire'}
      >
        <form onSubmit={handleSaveAccount}>
          <div className="form-group">
            <label className="form-label" htmlFor="acc-name-field">Nom du compte</label>
            <input 
              id="acc-name-field"
              type="text" 
              className="form-control" 
              required 
              placeholder="Ex: Compte Courant Boursorama, Livret A..."
              value={accountName} 
              onChange={e => setAccountName(e.target.value)} 
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="acc-type-field">Type de compte</label>
            <select
              id="acc-type-field"
              className="form-control"
              value={accountType}
              onChange={e => setAccountType(e.target.value as AccountType)}
            >
              <option value="checking">Compte courant (dépôt, carte bancaire, prélèvements)</option>
              <option value="savings">Compte d'épargne (Livret A, LDDS, PEL, etc.)</option>
              <option value="cash">Espèces / Compte manuel</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="acc-balance-field">Solde initial (€)</label>
            <AmountInput 
              id="acc-balance-field"
              allowNegative
              className="form-control" 
              required 
              value={accountInitialBalance} 
              onChange={e => setAccountInitialBalance(e.target.value)} 
            />
            <small style={{ color: 'var(--text-secondary, #666)', fontSize: '0.8rem', marginTop: '0.35rem', display: 'block' }}>
              Le solde réel actuel sera calculé automatiquement à partir de ce solde initial en y additionnant les opérations pointées.
            </small>
          </div>

          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsAccountModalOpen(false)} type="button">Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : ORGANISME VERSEUR                                            */}
      {/* ==================================================================== */}
      <Modal 
        isOpen={isPayerModalOpen} 
        onClose={() => setIsPayerModalOpen(false)} 
        title={editingPayer ? 'Renommer l\'organisme verseur' : 'Ajouter un organisme verseur'}
      >
        <form onSubmit={handleSavePayer}>
          <div className="form-group">
            <label className="form-label" htmlFor="payer-name-field">Nom de l'organisme</label>
            <input 
              id="payer-name-field"
              type="text" 
              className="form-control" 
              required 
              placeholder="Ex: Entreprise SAS (Employeur), CPAM, CAF, Client X..."
              value={payerName} 
              onChange={e => setPayerName(e.target.value)} 
              autoFocus
            />
            <small style={{ color: 'var(--text-secondary, #666)', fontSize: '0.8rem', marginTop: '0.35rem', display: 'block' }}>
              Cet organisme apparaîtra comme choix lors de la saisie de vos revenus ponctuels et récurrents.
            </small>
          </div>

          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsPayerModalOpen(false)} type="button">Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : CATÉGORIE                                                    */}
      {/* ==================================================================== */}
      <Modal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} title={editingCat ? 'Renommer la catégorie' : 'Nouvelle catégorie'}>
        <form onSubmit={handleSaveCat}>
          <div className="form-group">
            <label className="form-label">Nom</label>
            <input 
              type="text" 
              className="form-control" 
              required 
              value={catName} 
              onChange={e => setCatName(e.target.value)} 
              autoFocus
            />
          </div>
          <div className="modal-footer">
            <Button variant="outline" onClick={() => setIsCatModalOpen(false)} type="button">Annuler</Button>
            <Button type="submit" variant="primary">Enregistrer</Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : CONFIRMATION RÉINITIALISATION SÉCURISÉE                      */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => !isResetting && setIsResetModalOpen(false)}
        title="⚠️ Confirmation de réinitialisation complète"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#991b1b', fontSize: '0.9rem', lineHeight: 1.4 }}>
            <strong>Attention :</strong> Toutes vos transactions, crédits, récurrences, comptes et organismes seront définitivement effacés de la base de données.
            <div style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
              Une copie de sauvegarde automatique sera créée sur le serveur avant la suppression.
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={reseedDefaults}
              onChange={e => setReseedDefaults(e.target.checked)}
              disabled={isResetting}
            />
            Recréer les catégories et un compte courant standard vierge
          </label>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Pour confirmer, tapez le mot <code>REINITIALISER</code> ci-dessous :
            </label>
            <input
              type="text"
              className="form-control"
              value={resetConfirmationInput}
              onChange={e => setResetConfirmationInput(e.target.value)}
              placeholder="REINITIALISER"
              disabled={isResetting}
              autoFocus
            />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleExecuteReset}
              disabled={isResetting || resetConfirmationInput.trim().toUpperCase() !== 'REINITIALISER'}
            >
              {isResetting ? 'Réinitialisation...' : 'Purger et réinitialiser'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : MODIFIER MON MOT DE PASSE                                    */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => !passwordChangeLoading && setIsPasswordModalOpen(false)}
        title="Modifier mon mot de passe"
      >
        <form onSubmit={handleSavePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {passwordChangeMessage && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: passwordChangeMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${passwordChangeMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              color: passwordChangeMessage.type === 'success' ? '#166534' : '#dc2626'
            }}>
              {passwordChangeMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              <span>{passwordChangeMessage.text}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="cur-pass-field">Mot de passe actuel</label>
            <input
              id="cur-pass-field"
              type="password"
              className="form-control"
              value={currentPasswordInput}
              onChange={e => setCurrentPasswordInput(e.target.value)}
              placeholder="••••••••"
              required
              disabled={passwordChangeLoading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="new-pass-field">Nouveau mot de passe (6 car. min)</label>
            <input
              id="new-pass-field"
              type="password"
              className="form-control"
              value={newPasswordInput}
              onChange={e => setNewPasswordInput(e.target.value)}
              placeholder="••••••••"
              required
              disabled={passwordChangeLoading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="conf-new-pass-field">Confirmer le nouveau mot de passe</label>
            <input
              id="conf-new-pass-field"
              type="password"
              className="form-control"
              value={confirmNewPasswordInput}
              onChange={e => setConfirmNewPasswordInput(e.target.value)}
              placeholder="••••••••"
              required
              disabled={passwordChangeLoading}
            />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              disabled={passwordChangeLoading}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={passwordChangeLoading}
            >
              {passwordChangeLoading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : CLÉ DE SECOURS DU COMPTE                                     */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isRecoveryKeyModalOpen}
        onClose={() => setIsRecoveryKeyModalOpen(false)}
        title="🔑 Clé de secours de votre compte"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.9rem', lineHeight: 1.5, margin: 0, textAlign: 'left' }}>
            Cette clé secrète vous permet de réinitialiser votre mot de passe depuis l'écran de connexion si jamais vous veniez à l'oublier. Conservez-la en lieu sûr (gestionnaire de mots de passe ou carnet papier).
          </p>

          <div style={{
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            border: '2px dashed var(--border-color, #cbd5e1)',
            borderRadius: '8px',
            padding: '1.25rem',
            fontFamily: 'monospace',
            fontSize: '1.2rem',
            fontWeight: 700,
            color: 'var(--primary-color, #2563eb)',
            letterSpacing: '1px',
            userSelect: 'all'
          }}>
            {currentRecoveryKey || 'Chargement...'}
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button
              variant="primary"
              onClick={() => setIsRecoveryKeyModalOpen(false)}
            >
              Fermer
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL : CONFIRMATION RESTAURATION INSTANTANÉ SERVEUR                 */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isConfirmSnapshotModalOpen}
        onClose={() => { if (!isRestoringSnapshot) setIsConfirmSnapshotModalOpen(false); }}
        title="⚠️ Confirmation de restauration directe"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
            Vous allez remplacer la base de données active par l'instantané sélectionné :
          </p>

          <div style={{
            padding: '0.85rem',
            backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.03))',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '0.85rem'
          }}>
            <strong>Fichier :</strong> {selectedSnapshotFileName}
          </div>

          <div style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: 'var(--text-main)'
          }}>
            🛡️ <strong>Sécurité automatique :</strong> Le serveur va automatiquement enregistrer une copie de sécurité intégrale de votre base actuelle avant d'appliquer cet instantané. En cas de besoin, vous pourrez revenir en arrière.
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              onClick={() => setIsConfirmSnapshotModalOpen(false)}
              disabled={isRestoringSnapshot}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteRestoreSnapshot}
              disabled={isRestoringSnapshot}
            >
              {isRestoringSnapshot ? 'Restauration en cours...' : 'Confirmer et restaurer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirmation de Redémarrage du Serveur */}
      <Modal
        isOpen={isRestartModalOpen}
        onClose={() => !isRestarting && setIsRestartModalOpen(false)}
        title="Redémarrer le serveur Budget Perso Pro"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
          <div style={{
            padding: '0.85rem',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '4px',
            fontSize: '0.88rem',
            color: 'var(--text-main)',
            lineHeight: 1.5
          }}>
            <div style={{ fontWeight: 600, color: '#dc2626', marginBottom: '0.25rem' }}>
              ⚠️ Confirmation du redémarrage du service
            </div>
            Le serveur va effectuer un point de contrôle complet de la base de données (WAL Checkpoint), fermer proprement la connexion SQLite, puis redémarrer le processus conteneurisé.
            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary, #666)' }}>
              🔒 <strong>Sécurité Proxmox/Docker :</strong> Seul le conteneur <code>budget-perso-pro</code> sera redémarré. Vos autres applications (Nextcloud, Jellyfin, MariaDB...) ne seront en aucun cas impactées.
            </div>
          </div>

          {restartStatusMessage && (
            <div style={{
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: isRestarting ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              border: `1px solid ${isRestarting ? '#3b82f6' : '#22c55e'}`,
              color: isRestarting ? '#1d4ed8' : '#15803d',
              fontSize: '0.85rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              {isRestarting ? <RefreshCw className="spin" size={16} /> : <CheckCircle size={16} />}
              <span>{restartStatusMessage}</span>
            </div>
          )}

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              onClick={() => setIsRestartModalOpen(false)}
              disabled={isRestarting}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              icon={<Power size={16} />}
              onClick={handleRestartServer}
              disabled={isRestarting}
            >
              {isRestarting ? 'Redémarrage en cours...' : 'Confirmer le redémarrage'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Choix de la période pour l'export Excel */}
      <Modal
        isOpen={isExcelPeriodModalOpen}
        onClose={() => !isExportingExcel && setIsExcelPeriodModalOpen(false)}
        title="Paramètres de l'export Excel (.xlsx)"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '0.5rem' }}>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
            Choisissez le périmètre temporel des opérations à exporter. Les fiches de comptes, fiches de crédits et dépenses prévisionnelles restent disponibles de façon adaptée.
          </p>

          {excelPeriodError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#dc2626',
              padding: '0.75rem',
              borderRadius: '6px',
              fontSize: '0.85rem'
            }}>
              <AlertCircle size={18} />
              <span>{excelPeriodError}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
              <input
                type="radio"
                name="excelPeriodMode"
                value="all"
                checked={excelExportPeriodMode === 'all'}
                onChange={() => setExcelExportPeriodMode('all')}
              />
              <span><strong>Exporter l'intégralité des données</strong> (toutes les dates)</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
              <input
                type="radio"
                name="excelPeriodMode"
                value="custom"
                checked={excelExportPeriodMode === 'custom'}
                onChange={() => setExcelExportPeriodMode('custom')}
              />
              <span><strong>Filtrer par période personnalisée</strong></span>
            </label>
          </div>

          {excelExportPeriodMode === 'custom' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.02))',
              border: '1px solid var(--border-color)',
              borderRadius: '6px'
            }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block' }}>
                  Date de début (incluse)
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={excelStartDate}
                  onChange={(e) => setExcelStartDate(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.85rem', marginBottom: '0.35rem', display: 'block' }}>
                  Date de fin (incluse)
                </label>
                <input
                  type="date"
                  className="form-control"
                  value={excelEndDate}
                  onChange={(e) => setExcelEndDate(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>
            </div>
          )}

          <div style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted, #888)',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderLeft: '3px solid #3b82f6',
            padding: '0.6rem 0.8rem',
            borderRadius: '4px'
          }}>
            ℹ️ Le classeur généré intégrera des filtres automatiques sur l'ensemble des tableaux de données ainsi que des tableaux d'analyse croisée dynamiques actualisés pour la période choisie.
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              onClick={() => setIsExcelPeriodModalOpen(false)}
              disabled={isExportingExcel}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              icon={<FileText size={16} />}
              onClick={handleExportExcel}
              disabled={isExportingExcel}
            >
              {isExportingExcel ? 'Génération du classeur...' : 'Télécharger le classeur (.xlsx)'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
