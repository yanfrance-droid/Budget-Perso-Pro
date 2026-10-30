import React, { useState, useMemo, useEffect } from 'react';
import { generateId } from '../db/database';
import type { Transaction, Account } from '../db/database';
import { Card, Button, Modal, StatusBadgeSelect } from '../components/ui/Components';
import { calculateRealBalance } from '../engine/calculations';
import { Plus, Edit2, Trash2, Filter, CheckCircle2, Repeat, ArrowRight, ShieldAlert, AlertCircle, AlertTriangle, RotateCcw, Wallet, ChevronDown, ChevronRight, Archive, XCircle, Settings, TrendingUp, X } from 'lucide-react';
import { computeOccurrenceDate } from '../services/recurrenceService';

const SAVINGS_STATUS_OPTIONS = [
  { value: 'cleared', label: 'Effectué' },
  { value: 'pending', label: 'En attente' },
  { value: 'planned', label: 'Prévu' },
  { value: 'disabled', label: 'Annulé' }
];

export interface SavingsSubTypeOption {
  value: string;
  label: string;
  defaultName: string;
}

export const SAVINGS_SUBTYPES: SavingsSubTypeOption[] = [
  { value: 'livret_a', label: 'Livret A', defaultName: 'Livret A' },
  { value: 'lep', label: 'LEP — Livret d’épargne populaire', defaultName: 'LEP' },
  { value: 'ldds', label: 'LDDS — Livret de développement durable et solidaire', defaultName: 'LDDS' },
  { value: 'livret_jeune', label: 'Livret jeune', defaultName: 'Livret jeune' },
  { value: 'livret_bancaire', label: 'Livret bancaire', defaultName: 'Livret bancaire' },
  { value: 'pel', label: 'PEL — Plan d’épargne logement', defaultName: 'PEL' },
  { value: 'cel', label: 'CEL — Compte épargne logement', defaultName: 'CEL' },
  { value: 'assurance_vie', label: 'Assurance-vie', defaultName: 'Assurance-vie' },
  { value: 'pea', label: 'PEA — Plan d’épargne en actions', defaultName: 'PEA' },
  { value: 'compte_a_terme', label: 'Compte à terme', defaultName: 'Compte à terme' },
  { value: 'pee', label: 'PEE — Plan d’épargne entreprise', defaultName: 'PEE' },
  { value: 'perco', label: 'PERCO', defaultName: 'PERCO' },
  { value: 'pereco', label: 'PERECO — Plan d’épargne retraite d’entreprise collectif', defaultName: 'PERECO' },
  { value: 'checking', label: 'Compte courant secondaire', defaultName: 'Compte courant' },
  { value: 'other', label: 'Autre / Personnalisé', defaultName: '' }
];

export const PREDEFINED_SUBTYPE_VALUES = SAVINGS_SUBTYPES.map(s => s.value).filter(v => v !== 'other');

import { 
  getAccountTypeLabel as getCentralizedAccountTypeLabel,
  formatAccountOptionLabel as formatCentralizedAccountOptionLabel
} from '../services/accountPresentation';

export function getAccountTypeLabel(account: Account, configuredPrimaryId?: string | null, allAccounts?: Account[]): string {
  return getCentralizedAccountTypeLabel(account, configuredPrimaryId, allAccounts);
}

export function formatAccountOptionLabel(account: Account, configuredPrimaryId?: string | null, allAccounts?: Account[]): string {
  return formatCentralizedAccountOptionLabel(account, configuredPrimaryId, allAccounts);
}

import { useServerDataOptional } from '../contexts/ServerDataContext';
import { AccountSelect } from '../components/ui/AccountSelect';

export default function Savings() {
  const serverData = useServerDataOptional();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingSaving, setDeletingSaving] = useState<Transaction | null>(null);

  const savings = (serverData?.transactions || [])
    .filter(t => t.type === 'transfer')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const allTransactions = serverData?.transactions || [];
  const categories = (serverData?.categories || []).filter(c => c.type === 'transfer');
  const accounts = serverData?.accounts || [];

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Form state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [formData, setFormData] = useState<Partial<Transaction>>({});

  // État création rapide de compte épargne
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState<{
    name: string;
    type: 'savings' | 'checking';
    initialBalance: number;
    referenceDate: string;
  }>({
    name: 'Livret A',
    type: 'savings',
    initialBalance: 0,
    referenceDate: new Date().toISOString().split('T')[0]
  });

  // État panneau latéral de paramètres dédié à un compte d'épargne
  const [selectedAccountForDrawer, setSelectedAccountForDrawer] = useState<Account | null>(null);

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [newAddAccountForm, setNewAddAccountForm] = useState<{
    name: string;
    subType: string;
    customSubType: string;
    initialBalance: string;
    interestRate: string;
    targetAmount: string;
  }>({
    name: '',
    subType: 'livret_a',
    customSubType: '',
    initialBalance: '0',
    interestRate: '',
    targetAmount: ''
  });

  interface AccountEditingState {
    name: string;
    subType: string;
    customSubType: string;
    initialBalance: string;
    interestRate: string;
    targetAmount: string;
  }

  const [drawerForm, setDrawerForm] = useState<AccountEditingState>({
    name: '',
    subType: 'livret_a',
    customSubType: '',
    initialBalance: '0',
    interestRate: '',
    targetAmount: ''
  });
  const [drawerInitialForm, setDrawerInitialForm] = useState<AccountEditingState>({
    name: '',
    subType: 'livret_a',
    customSubType: '',
    initialBalance: '0',
    interestRate: '',
    targetAmount: ''
  });

  const [isClosedAccountsExpanded, setIsClosedAccountsExpanded] = useState(false);

  const isDrawerDirty = useMemo(() => {
    if (!selectedAccountForDrawer) return false;
    return (
      drawerForm.name.trim() !== drawerInitialForm.name.trim() ||
      drawerForm.subType !== drawerInitialForm.subType ||
      drawerForm.customSubType.trim() !== drawerInitialForm.customSubType.trim() ||
      drawerForm.initialBalance.trim() !== drawerInitialForm.initialBalance.trim() ||
      drawerForm.interestRate.trim() !== drawerInitialForm.interestRate.trim() ||
      drawerForm.targetAmount.trim() !== drawerInitialForm.targetAmount.trim()
    );
  }, [selectedAccountForDrawer, drawerForm, drawerInitialForm]);

  const handleOpenAccountDrawer = (account: Account) => {
    let detectedSubType = account.subType || 'other';
    let detectedCustomSubType = '';

    if (!account.subType) {
      const lowerName = account.name.toLowerCase();
      if (lowerName.includes('livret a')) detectedSubType = 'livret_a';
      else if (lowerName.includes('lep')) detectedSubType = 'lep';
      else if (lowerName.includes('ldds') || lowerName.includes('ldd')) detectedSubType = 'ldds';
      else if (lowerName.includes('pel')) detectedSubType = 'pel';
      else if (lowerName.includes('cel')) detectedSubType = 'cel';
      else if (lowerName.includes('assurance-vie') || lowerName.includes('assurance vie')) detectedSubType = 'assurance_vie';
      else if (lowerName.includes('pea')) detectedSubType = 'pea';
      else {
        detectedSubType = 'other';
        detectedCustomSubType = account.name;
      }
    } else if (!PREDEFINED_SUBTYPE_VALUES.includes(account.subType)) {
      // Le sous-type est personnalisé ou sous une ancienne valeur
      detectedSubType = 'other';
      detectedCustomSubType = account.subType;
    }

    const state: AccountEditingState = {
      name: account.name,
      subType: detectedSubType,
      customSubType: detectedCustomSubType,
      initialBalance: account.initialBalance !== undefined && account.initialBalance !== null ? String(account.initialBalance) : '0',
      interestRate: account.interestRate !== undefined && account.interestRate !== null ? String(account.interestRate) : '',
      targetAmount: account.targetAmount !== undefined && account.targetAmount !== null ? String(account.targetAmount) : ''
    };

    setDrawerForm({ ...state });
    setDrawerInitialForm({ ...state });
    setSelectedAccountForDrawer(account);
  };

  const handleCloseAccountDrawer = () => {
    if (isDrawerDirty) {
      const confirmLeave = window.confirm("Des modifications sont en attente. Voulez-vous vraiment fermer le panneau sans enregistrer ?");
      if (!confirmLeave) return;
    }
    setSelectedAccountForDrawer(null);
  };

  const handleSaveAccountDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountForDrawer) return;

    try {
      if (!drawerForm.name.trim()) {
        alert("Le nom du compte ne peut pas être vide.");
        return;
      }

      if (drawerForm.initialBalance.trim() === '') {
        alert("Le solde initial ne peut pas être vide.");
        return;
      }

      const parsedBalance = parseFloat(drawerForm.initialBalance.replace(',', '.'));
      if (isNaN(parsedBalance)) {
        alert(`Le solde initial « ${drawerForm.initialBalance} » n'est pas un nombre valide.`);
        return;
      }

      let parsedRate: number | undefined = undefined;
      if (drawerForm.interestRate.trim() !== '') {
        parsedRate = parseFloat(drawerForm.interestRate.replace(',', '.'));
        if (isNaN(parsedRate) || parsedRate < 0) {
          alert(`Le taux d'intérêt « ${drawerForm.interestRate} » doit être un nombre positif.`);
          return;
        }
      }

      let parsedTarget: number | undefined = undefined;
      if (drawerForm.targetAmount.trim() !== '') {
        parsedTarget = parseFloat(drawerForm.targetAmount.replace(',', '.'));
        if (isNaN(parsedTarget) || parsedTarget < 0) {
          alert(`L'objectif d'épargne « ${drawerForm.targetAmount} » doit être un nombre positif.`);
          return;
        }
      }

      if (drawerForm.subType === 'other' && !drawerForm.customSubType.trim()) {
        alert("Veuillez renseigner le type de compte personnalisé.");
        return;
      }

      const effectiveSubType = drawerForm.subType === 'other'
        ? drawerForm.customSubType.trim()
        : drawerForm.subType;

      const updatePayload: Partial<Account> = {
        name: drawerForm.name.trim(),
        type: selectedAccountForDrawer.type || 'savings',
        subType: effectiveSubType,
        initialBalance: parsedBalance,
        referenceDate: selectedAccountForDrawer.referenceDate || new Date().toISOString().split('T')[0]
      };

      if (parsedRate !== undefined) {
        updatePayload.interestRate = parsedRate;
      } else {
        updatePayload.interestRate = undefined;
      }

      if (parsedTarget !== undefined) {
        updatePayload.targetAmount = parsedTarget;
      } else {
        updatePayload.targetAmount = undefined;
      }

      // Enregistre uniquement le compte sélectionné
      if (serverData) {
        await serverData.saveAccount({ id: selectedAccountForDrawer.id, ...updatePayload });
      }

      // Fermeture propre après enregistrement
      setSelectedAccountForDrawer(null);
    } catch (err: any) {
      console.error("Erreur lors de la mise à jour du compte d'épargne :", err);
      alert(err.message || "Erreur lors de la mise à jour du compte.");
    }
  };

  // Création d'un nouveau compte d'épargne ou secondaire
  const handleAddNewAccountFromModal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (newAddAccountForm.subType === 'other' && !newAddAccountForm.customSubType.trim()) {
        alert("Veuillez renseigner le type de compte personnalisé.");
        return;
      }

      const defaultOpt = SAVINGS_SUBTYPES.find(s => s.value === newAddAccountForm.subType);
      const effectiveSubType = newAddAccountForm.subType === 'other'
        ? newAddAccountForm.customSubType.trim()
        : newAddAccountForm.subType;

      const finalName = newAddAccountForm.name.trim() || (
        newAddAccountForm.subType === 'other'
          ? newAddAccountForm.customSubType.trim()
          : (defaultOpt?.defaultName || 'Compte épargne')
      );

      if (!finalName) {
        alert("Veuillez saisir un nom pour le compte.");
        return;
      }

      if (newAddAccountForm.initialBalance.trim() === '') {
        alert("Le solde initial ne peut pas être vide.");
        return;
      }

      const parsedBalance = parseFloat(newAddAccountForm.initialBalance.replace(',', '.'));
      if (isNaN(parsedBalance)) {
        alert("Le solde initial n'est pas un nombre valide.");
        return;
      }

      let parsedRate: number | undefined = undefined;
      if (newAddAccountForm.interestRate.trim() !== '') {
        parsedRate = parseFloat(newAddAccountForm.interestRate.replace(',', '.'));
        if (isNaN(parsedRate) || parsedRate < 0) {
          alert("Le taux d'intérêt doit être un nombre positif.");
          return;
        }
      }

      let parsedTarget: number | undefined = undefined;
      if (newAddAccountForm.targetAmount.trim() !== '') {
        parsedTarget = parseFloat(newAddAccountForm.targetAmount.replace(',', '.'));
        if (isNaN(parsedTarget) || parsedTarget < 0) {
          alert("L'objectif d'épargne doit être un nombre positif.");
          return;
        }
      }

      const newId = generateId();
      const accountType = newAddAccountForm.subType === 'checking' ? 'checking' : 'savings';
      const newAccountObj: Account = {
        id: newId,
        name: finalName,
        type: accountType,
        subType: effectiveSubType,
        initialBalance: parsedBalance,
        referenceDate: new Date().toISOString().split('T')[0],
        ...(parsedRate !== undefined ? { interestRate: parsedRate } : {}),
        ...(parsedTarget !== undefined ? { targetAmount: parsedTarget } : {})
      };

      if (serverData) {
        await serverData.saveAccount(newAccountObj);
      }

      // Réinitialiser le formulaire d'ajout et fermer la modale
      setNewAddAccountForm({
        name: '',
        subType: 'livret_a',
        customSubType: '',
        initialBalance: '0',
        interestRate: '',
        targetAmount: ''
      });
      setIsAddAccountModalOpen(false);
    } catch (err: any) {
      console.error("Erreur lors de l'ajout du compte :", err);
      alert(err.message || "Erreur lors de la création du compte.");
    }
  };

  // Clôture sécurisée d'un compte d'épargne
  const handleCloseAccount = async (account: Account) => {
    if (account.type !== 'savings') {
      alert("La clôture concerne uniquement les comptes d'épargne.");
      return;
    }

    // 1. Contrôle du solde réel calculé
    const realBalance = calculateRealBalance(account, allTransactions || []);
    const roundedBalance = Math.round(realBalance * 100) / 100;
    if (Math.abs(roundedBalance) > 0.001) {
      alert(`Le compte ${account.name} présente un solde de ${roundedBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €. Effectuez d'abord les opérations nécessaires pour ramener son solde à zéro.`);
      return;
    }

    // 2. Contrôle de l'absence d'opérations en cours (planned ou pending)
    const pendingTransactions = (allTransactions || []).filter(t => 
      (t.accountId === account.id || t.destinationAccountId === account.id) &&
      (t.status === 'planned' || t.status === 'pending')
    );
    if (pendingTransactions.length > 0) {
      alert(`Le compte ${account.name} possède ${pendingTransactions.length} opération(s) en cours (prévue(s) ou en attente). Veuillez pointer ou régulariser ces opérations avant de clôturer le compte.`);
      return;
    }

    // 3. Contrôle de l'absence de récurrence active
    try {
      const templates = serverData ? serverData.recurrenceTemplates : [];
      const activeTemplates = templates.filter(tpl => 
        (tpl.accountId === account.id || tpl.destinationAccountId === account.id) &&
        tpl.isActive
      );
      if (activeTemplates.length > 0) {
        alert(`Le compte ${account.name} est associé à ${activeTemplates.length} virement(s) récurrent(s) actif(s). Veuillez d'abord désactiver ou supprimer ces récurrences.`);
        return;
      }
    } catch (err) {
      console.error("Erreur lors de la vérification des récurrences :", err);
    }

    // 4. Confirmation explicite
    const isConfirmed = window.confirm(
      `Confirmez-vous la clôture du compte ${account.name} ? Il sera retiré des comptes actifs. Son historique restera consultable.`
    );
    if (!isConfirmed) return;

    // 5. Enregistrement de la clôture
    const todayStr = new Date().toISOString().split('T')[0];
    if (serverData) {
      await serverData.saveAccount({
        id: account.id,
        isClosed: true,
        closedDate: todayStr,
        closedBalance: 0
      });
    }

    // Si le compte clôturé était ouvert dans le panneau latéral, fermer le panneau
    if (selectedAccountForDrawer?.id === account.id) {
      setSelectedAccountForDrawer(null);
    }
  };

  // Suppression définitive d'un compte vierge uniquement
  const handleDeleteAccountPermanently = async (account: Account) => {
    if (account.type !== 'savings') {
      alert("La suppression concerne uniquement les comptes d'épargne.");
      return;
    }

    // Vérifier solde initial = 0
    if (Number(account.initialBalance || 0) !== 0) {
      alert(`Le compte ${account.name} possède un solde initial de départ (${Number(account.initialBalance).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €) et ne peut pas être supprimé. Utilisez la clôture après avoir ramené son solde à zéro.`);
      return;
    }

    // Vérifier transactions
    const relatedTransactions = (allTransactions || []).filter(t => 
      t.accountId === account.id || t.destinationAccountId === account.id
    );
    if (relatedTransactions.length > 0) {
      alert(`Le compte ${account.name} possède ${relatedTransactions.length} opération(s) dans son historique et ne peut pas être supprimé définitivement. Vous pouvez en revanche le clôturer.`);
      return;
    }

    // Vérifier modèles récurrents (actifs ou inactifs)
    try {
      const templates = serverData ? serverData.recurrenceTemplates : [];
      const relatedTemplates = templates.filter(tpl => 
        tpl.accountId === account.id || tpl.destinationAccountId === account.id
      );
      if (relatedTemplates.length > 0) {
        alert(`Le compte ${account.name} est référencé dans ${relatedTemplates.length} modèle(s) de récurrence et ne peut pas être supprimé.`);
        return;
      }
    } catch (err) {
      console.error("Erreur lors de la vérification des modèles :", err);
    }

    const isConfirmed = window.confirm(
      `Voulez-vous vraiment supprimer définitivement le compte vierge "${account.name}" ?\nCette action est irréversible.`
    );
    if (!isConfirmed) return;

    if (serverData) {
      await serverData.deleteAccount(account.id);
    }

    // Si le compte supprimé était ouvert dans le panneau latéral, fermer le panneau
    if (selectedAccountForDrawer?.id === account.id) {
      setSelectedAccountForDrawer(null);
    }
  };


  const eligibleDestAccounts = useMemo(() => {
    return accounts?.filter(a => a.id !== formData.accountId && !a.isClosed) || [];
  }, [accounts, formData.accountId]);


  const handleQuickCreateDefaultSavingsAccount = async () => {
    const newAccId = generateId();
    const newAccount: Account = {
      id: newAccId,
      name: 'Livret A',
      type: 'savings',
      initialBalance: 0,
      referenceDate: new Date().toISOString().split('T')[0]
    };
    if (serverData) {
      await serverData.saveAccount(newAccount);
    }
    setFormData(prev => ({
      ...prev,
      destinationAccountId: newAccId
    }));
  };

  const handleCreateCustomAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.name.trim()) {
      alert("Veuillez saisir un nom de compte.");
      return;
    }
    const newAccId = generateId();
    const newAccount: Account = {
      id: newAccId,
      name: newAccountForm.name.trim(),
      type: newAccountForm.type,
      initialBalance: Number(newAccountForm.initialBalance) || 0,
      referenceDate: newAccountForm.referenceDate || new Date().toISOString().split('T')[0]
    };
    if (serverData) {
      await serverData.saveAccount(newAccount);
    }
    setFormData(prev => ({
      ...prev,
      destinationAccountId: newAccId
    }));
    setIsNewAccountModalOpen(false);
    setNewAccountForm({
      name: 'Livret A',
      type: 'savings',
      initialBalance: 0,
      referenceDate: new Date().toISOString().split('T')[0]
    });
  };

  // Génération automatique idempotente des occurrences à l'affichage ou au changement de mois
  useEffect(() => {
    if (selectedMonth && serverData) {
      serverData.generateMonthlyOccurrences(selectedMonth).catch(console.error);
    }
  }, [selectedMonth, serverData]);

  // Récupération des opérations d'épargne antérieures non régularisées (planned ou pending avant le mois sélectionné)
  const pastUnpaidSavings = useMemo(() => {
    if (!savings || !selectedMonth) return [];
    const startOfSelectedMonth = `${selectedMonth}-01`;
    return savings
      .filter(s => s.date < startOfSelectedMonth && (s.status === 'planned' || s.status === 'pending'))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [savings, selectedMonth]);

  const monthSavings = useMemo(() => {
    if (!savings) return [];
    return savings.filter(sav => {
      return selectedMonth ? (sav.date ? sav.date.startsWith(selectedMonth) : false) : true;
    });
  }, [savings, selectedMonth]);

  const displayedSavings = useMemo(() => {
    return monthSavings.filter(sav => {
      const matchCat = selectedCategory ? sav.categoryId === selectedCategory : true;
      const matchStat = selectedStatus ? sav.status === selectedStatus : true;
      return matchCat && matchStat;
    });
  }, [monthSavings, selectedCategory, selectedStatus]);

  // Synthèse financière du mois : distiction claire prévu vs effectué
  // Synthèse financière du mois : distinction des versements (vers épargne) et des retraits (depuis épargne)
  const { 
    monthDeposits, 
    monthWithdrawals, 
    monthNet, 
    monthClearedDeposits, 
    monthClearedWithdrawals,
    monthPendingDeposits,
    monthPendingWithdrawals
  } = useMemo(() => {
    let monthDeposits = 0;
    let monthWithdrawals = 0;
    let monthClearedDeposits = 0;
    let monthClearedWithdrawals = 0;
    let monthPendingDeposits = 0;
    let monthPendingWithdrawals = 0;

    const accountMap = new Map((accounts || []).map(a => [a.id, a]));

    monthSavings.forEach(s => {
      if (s.status === 'disabled') return;
      const amt = Math.abs(Number(s.amount) || 0);
      const srcAcc = s.accountId ? accountMap.get(s.accountId) : undefined;
      const destAcc = s.destinationAccountId ? accountMap.get(s.destinationAccountId) : undefined;

      const isSrcSavings = srcAcc ? (srcAcc.type === 'savings' || srcAcc.subType === 'other') : false;
      const isDestSavings = destAcc ? (destAcc.type === 'savings' || destAcc.subType === 'other') : false;
      const isSrcChecking = srcAcc ? srcAcc.type === 'checking' : false;
      const isDestChecking = destAcc ? destAcc.type === 'checking' : false;

      // 1. Transfert entre deux comptes d'épargne : flux interne neutre pour l'effort d'épargne net
      if (isSrcSavings && isDestSavings) {
        return;
      }

      // 2. Transfert entre deux comptes courants : trésorerie interne, neutre pour les versements/retraits d'épargne
      if (isSrcChecking && isDestChecking) {
        return;
      }

      // 3. Versement vers l'épargne (compte courant vers compte épargne)
      if (isDestSavings && !isSrcSavings) {
        monthDeposits += amt;
        if (s.status === 'cleared') {
          monthClearedDeposits += amt;
        } else {
          monthPendingDeposits += amt;
        }
      } 
      // 4. Retrait depuis l'épargne (compte épargne vers compte courant)
      else if (isSrcSavings && !isDestSavings) {
        monthWithdrawals += amt;
        if (s.status === 'cleared') {
          monthClearedWithdrawals += amt;
        } else {
          monthPendingWithdrawals += amt;
        }
      } 
      // 5. Repli (si un compte est indéterminé / supprimé mais que l'autre est épargne)
      else if (isDestSavings) {
        monthDeposits += amt;
        if (s.status === 'cleared') {
          monthClearedDeposits += amt;
        } else {
          monthPendingDeposits += amt;
        }
      } else if (isSrcSavings) {
        monthWithdrawals += amt;
        if (s.status === 'cleared') {
          monthClearedWithdrawals += amt;
        } else {
          monthPendingWithdrawals += amt;
        }
      }
    });

    const monthNet = monthDeposits - monthWithdrawals;

    return { 
      monthDeposits, 
      monthWithdrawals, 
      monthNet,
      monthClearedDeposits, 
      monthClearedWithdrawals,
      monthPendingDeposits,
      monthPendingWithdrawals
    };
  }, [monthSavings, accounts]);

  const { depositsSavings, withdrawalsSavings, checkingTransfers, internalSavings } = useMemo(() => {
    const accountMap = new Map((accounts || []).map(a => [a.id, a]));
    const deposits: Transaction[] = [];
    const withdrawals: Transaction[] = [];
    const checking: Transaction[] = [];
    const internal: Transaction[] = [];

    displayedSavings.forEach(saving => {
      const srcAcc = saving.accountId ? accountMap.get(saving.accountId) : undefined;
      const destAcc = saving.destinationAccountId ? accountMap.get(saving.destinationAccountId) : undefined;

      const isSrcSavings = srcAcc ? (srcAcc.type === 'savings' || srcAcc.subType === 'other') : false;
      const isDestSavings = destAcc ? (destAcc.type === 'savings' || destAcc.subType === 'other') : false;
      const isSrcChecking = srcAcc ? srcAcc.type === 'checking' : false;
      const isDestChecking = destAcc ? destAcc.type === 'checking' : false;

      // 1. Virements entre comptes d'épargne
      if (isSrcSavings && isDestSavings) {
        internal.push(saving);
      } 
      // 2. Virements entre comptes courants (principal ⇄ secondaire ou secondaire ⇄ secondaire)
      else if (isSrcChecking && isDestChecking) {
        checking.push(saving);
      } 
      // 3. Virements depuis l'épargne vers un compte courant
      else if (isSrcSavings && !isDestSavings) {
        withdrawals.push(saving);
      } 
      // 4. Virements vers l'épargne depuis un compte courant
      else if (isDestSavings && !isSrcSavings) {
        deposits.push(saving);
      } 
      // 5. Cas de repli si l'un des comptes est supprimé ou introuvable
      else if (isDestSavings) {
        deposits.push(saving);
      } else if (isSrcSavings) {
        withdrawals.push(saving);
      } else {
        // Si les deux comptes sont non-épargne ou inconnus, classé dans transferts entre comptes courants
        checking.push(saving);
      }
    });

    return {
      depositsSavings: deposits,
      withdrawalsSavings: withdrawals,
      checkingTransfers: checking,
      internalSavings: internal
    };
  }, [displayedSavings, accounts]);

  const savingsAccountsList = useMemo(() => {
    if (!accounts || !allTransactions) return [];
    return accounts
      .filter(acc => acc.type === 'savings' && !acc.isClosed)
      .map(acc => ({
        ...acc,
        realBalance: calculateRealBalance(acc, allTransactions)
      }));
  }, [accounts, allTransactions]);

  const closedSavingsAccountsList = useMemo(() => {
    if (!accounts || !allTransactions) return [];
    return accounts
      .filter(acc => acc.type === 'savings' && !!acc.isClosed)
      .map(acc => ({
        ...acc,
        realBalance: calculateRealBalance(acc, allTransactions)
      }));
  }, [accounts, allTransactions]);

  const totalSavingsRealBalance = useMemo(() => {
    return savingsAccountsList.reduce((total, account) => total + account.realBalance, 0);
  }, [savingsAccountsList]);


  if (savings === undefined || categories === undefined || accounts === undefined || allTransactions === undefined) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Chargement des données...</div>;
  }

  const handleOpen = (saving?: Transaction) => {
    if (saving) {
      setEditingId(saving.id);
      
      const otherAccounts = accounts?.filter(a => a.id !== saving.accountId) || [];
      const hasValidDest = !!(saving.destinationAccountId && saving.destinationAccountId !== saving.accountId && accounts?.some(a => a.id === saving.destinationAccountId));
      const destAcc = hasValidDest 
        ? saving.destinationAccountId! 
        : (otherAccounts.find(a => a.type === 'savings')?.id || otherAccounts[0]?.id || '');

      setFormData({
        ...saving,
        destinationAccountId: destAcc
      });
      setIsRecurring(!!saving.templateId || !!saving.recurrenceDay);
      setRecurrenceDay(saving.recurrenceDay || (saving.date ? parseInt(saving.date.slice(8, 10), 10) : 1));
    } else {
      setEditingId(null);
      setIsRecurring(false);
      setRecurrenceDay(new Date().getDate());
      
      const sourceAcc = accounts?.find(a => a.type === 'checking' && !a.isClosed)?.id || accounts?.find(a => !a.isClosed)?.id || '';
      const otherAccounts = accounts?.filter(a => a.id !== sourceAcc && !a.isClosed) || [];
      const destAcc = otherAccounts.find(a => a.type === 'savings')?.id || otherAccounts[0]?.id || '';

      setFormData({
        date: `${selectedMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
        amount: 0,
        status: 'planned',
        notes: '',
        accountId: sourceAcc,
        destinationAccountId: destAcc,
        categoryId: categories?.find(c => !c.isArchived)?.id || '',
        type: 'transfer'
      });
    }
    setIsModalOpen(true);
  };

  const handleQuickClear = async (saving: Transaction) => {
    if (serverData) {
      await serverData.updateTransactionStatus(saving.id, 'cleared');
    }
  };

  const handleUpdateStatus = async (saving: Transaction, newStatus: string) => {
    if (serverData) {
      if (newStatus === 'disabled') {
        if (saving.templateId) {
          const isDurable = window.confirm(
            "Cette opération d'épargne fait partie d'une récurrence mensuelle.\n\n" +
            "• Cliquez sur OK pour DÉSACTIVER CE VIREMENT POUR CE MOIS ET TOUS LES MOIS FUTURS (durable).\n" +
            "• Cliquez sur Annuler pour DÉSACTIVER POUR CE MOIS UNIQUEMENT (ponctuel)."
          );
          if (isDurable) {
            await serverData.saveRecurrenceTemplate({ id: saving.templateId, isActive: false });
          }
          await serverData.saveTransaction({
            id: saving.id,
            status: 'disabled',
            isCustomized: true
          });
        } else {
          await serverData.updateTransactionStatus(saving.id, 'disabled');
        }
        return;
      }

      if (saving.status === 'disabled' && newStatus !== 'disabled') {
        if (saving.templateId) {
          const tpl = serverData.recurrenceTemplates.find(t => t.id === saving.templateId);
          if (tpl && (tpl.disabledFromMonth || !tpl.isActive)) {
            const isDurable = window.confirm(
              "Ce virement récurrent d'épargne était désactivé pour les mois futurs.\n\n" +
              "• Cliquez sur OK pour RÉACTIVER CE VIREMENT POUR CE MOIS ET TOUS LES MOIS FUTURS.\n" +
              "• Cliquez sur Annuler pour RÉACTIVER UNIQUEMENT POUR CE MOIS (les mois suivants resteront désactivés)."
            );
            if (isDurable) {
              await serverData.saveRecurrenceTemplate({ id: saving.templateId, isActive: true });
            }
          }
        }
      }

      await serverData.updateTransactionStatus(saving.id, newStatus as any);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId || formData.amount === undefined || isNaN(formData.amount)) {
      alert("Veuillez remplir tous les champs obligatoires (compte source et montant).");
      return;
    }

    if (!formData.destinationAccountId) {
      alert("Veuillez sélectionner un compte épargne destinataire. Si aucun n'existe, vous pouvez en créer un via le bouton « Nouveau compte épargne ».");
      return;
    }

    if (formData.accountId === formData.destinationAccountId) {
      alert("Virement refusé : le compte source et le compte destinataire doivent être strictement différents. Aucun mouvement n'a été enregistré.");
      return;
    }

    let existingTransaction: Transaction | undefined = undefined;
    if (editingId) {
      existingTransaction = serverData?.transactions.find(t => t.id === editingId);
      if (!existingTransaction) {
        alert("Transaction introuvable.");
        return;
      }
    }

    // Sécurisation impérative en base : vérification d'existence réelle, d'activité et de validité des comptes
    const sourceAccount = serverData?.accounts.find(a => a.id === formData.accountId);
    const destAccount = serverData?.accounts.find(a => a.id === formData.destinationAccountId);

    if (!sourceAccount) {
      alert("Virement refusé : le compte source sélectionné n'existe plus ou est introuvable. Aucun mouvement n'a été enregistré.");
      return;
    }

    // Un compte clôturé ne peut pas être sélectionné comme nouveau compte source
    if (sourceAccount.isClosed && (!existingTransaction || existingTransaction.accountId !== sourceAccount.id)) {
      alert("Virement refusé : le compte source est clôturé et ne peut plus émettre de virement. Aucun mouvement n'a été enregistré.");
      return;
    }

    if (!destAccount) {
      alert("Virement refusé : le compte destinataire n'existe plus ou n'est plus disponible. Aucun mouvement n'a été enregistré.");
      return;
    }

    // Un compte clôturé ne peut pas être sélectionné comme nouveau compte destinataire
    if (destAccount.isClosed && (!existingTransaction || existingTransaction.destinationAccountId !== destAccount.id)) {
      alert("Virement refusé : le compte destinataire est clôturé et ne peut pas recevoir de virement. Aucun mouvement n'a été enregistré.");
      return;
    }

    if (sourceAccount.id === destAccount.id) {
      alert("Virement refusé : le compte source et le compte destinataire doivent être strictement différents. Aucun mouvement n'a été enregistré.");
      return;
    }

    const amt = Math.abs(Number(formData.amount));
    const targetStatus = formData.status || 'planned';
    const [sYear, sMonth] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(sYear, sMonth, 0).getDate();
    const safeDay = Math.min(Math.max(1, recurrenceDay || 1), daysInMonth);
    const computedDate = isRecurring 
      ? computeOccurrenceDate(sYear, sMonth, safeDay) 
      : (formData.date || computeOccurrenceDate(sYear, sMonth, safeDay));

    if (serverData) {
      if (editingId) {
        const existing = existingTransaction!;
        if (isRecurring && !existing.templateId) {
          const tpl = await serverData.saveRecurrenceTemplate({
            type: 'transfer',
            amount: amt,
            recurrenceDay: safeDay,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId,
            categoryId: formData.categoryId || '',
            label: formData.notes || 'Épargne mensuelle',
            notes: formData.notes || '',
            startDate: selectedMonth,
            isActive: true
          });
          await serverData.saveTransaction({
            id: editingId,
            ...formData,
            templateId: tpl.id,
            destinationAccountId: formData.destinationAccountId,
            notes: formData.notes,
            status: targetStatus,
            amount: amt,
            date: computedDate,
            isCustomized: true
          });
        } else if (!isRecurring && existing.templateId) {
          const confirmed = window.confirm(
            "Ce virement fait actuellement partie d'une récurrence mensuelle.\n\n" +
            "En choisissant « Virement ponctuel », vous allez ARRÊTER DÉFINITIVEMENT la récurrence pour les mois futurs.\n\n" +
            "Confirmez-vous l'arrêt de la récurrence ?"
          );
          if (!confirmed) return;
          const currentTpl = serverData.recurrenceTemplates.find(t => t.id === existing.templateId);
          await serverData.saveRecurrenceTemplate({ 
            ...currentTpl,
            id: existing.templateId, 
            isActive: false,
            disabledFromMonth: selectedMonth
          });
          await serverData.saveTransaction({
            id: editingId,
            amount: amt,
            notes: formData.notes,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId,
            categoryId: formData.categoryId,
            status: targetStatus,
            date: computedDate,
            templateId: null as any,
            recurrenceDay: null as any
          });
          await serverData.refreshAll();
        } else if (existing.templateId) {
          await serverData.saveTransaction({
            id: editingId,
            ...formData,
            destinationAccountId: formData.destinationAccountId,
            date: computedDate,
            recurrenceDay: safeDay,
            amount: amt,
            status: targetStatus,
            isCustomized: true
          });
          if (formData.destinationAccountId) {
            await serverData.saveRecurrenceTemplate({
              id: existing.templateId,
              destinationAccountId: formData.destinationAccountId,
              accountId: formData.accountId,
              amount: amt,
              recurrenceDay: safeDay
            });
          }
        } else {
          await serverData.saveTransaction({
            id: editingId,
            ...formData,
            date: computedDate,
            amount: amt,
            status: targetStatus
          });
        }
      } else {
        if (isRecurring) {
          const tpl = await serverData.saveRecurrenceTemplate({
            type: 'transfer',
            label: formData.notes || 'Épargne mensuelle',
            amount: amt,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId,
            categoryId: formData.categoryId || '',
            recurrenceDay: safeDay,
            startDate: selectedMonth,
            isActive: true,
            notes: formData.notes || ''
          });
          const occId = `${tpl.id}_${selectedMonth}`;
          await serverData.saveTransaction({
            id: occId,
            type: 'transfer',
            label: formData.notes || 'Épargne mensuelle',
            amount: amt,
            accountId: formData.accountId,
            destinationAccountId: formData.destinationAccountId,
            categoryId: formData.categoryId || '',
            recurrenceDay: safeDay,
            date: computedDate,
            status: targetStatus,
            templateId: tpl.id,
            isCustomized: targetStatus !== 'planned',
            notes: formData.notes || ''
          });
        } else {
          await serverData.saveTransaction({
            ...formData,
            id: generateId(),
            date: computedDate,
            amount: amt,
            status: targetStatus,
            type: 'transfer'
          } as Transaction);
        }
      }
      setIsModalOpen(false);
    }
  };

  const handleOpenDelete = (saving: Transaction) => {
    setDeletingSaving(saving);
    setIsDeleteModalOpen(true);
  };

  // Action A : Annuler ce mois uniquement
  const handleConfirmDeleteSingle = async () => {
    if (!deletingSaving) return;
    if (serverData) {
      if (deletingSaving.templateId) {
        if (deletingSaving.status === 'cleared') {
          alert("Cette opération a déjà été pointée en banque. Pour l'annuler, vous devez d'abord la dépointer explicitement (modifier son statut en 'Prévu' ou 'En attente').");
          return;
        }
        await serverData.saveTransaction({
          ...deletingSaving,
          id: deletingSaving.id,
          date: deletingSaving.date,
          amount: deletingSaving.amount,
          accountId: deletingSaving.accountId,
          status: 'disabled',
          isCustomized: true
        });
      } else {
        await serverData.deleteTransaction(deletingSaving.id);
      }
      setIsDeleteModalOpen(false);
      setDeletingSaving(null);
      await serverData.refreshAll();
    }
  };

  // Action B : Arrêter la récurrence pour la suite
  const handleStopRecurrence = async () => {
    if (!deletingSaving?.templateId) return;

    if (serverData) {
      const currentTpl = serverData.recurrenceTemplates.find(t => t.id === deletingSaving.templateId);
      await serverData.saveRecurrenceTemplate({ 
        ...currentTpl,
        id: deletingSaving.templateId, 
        isActive: false,
        disabledFromMonth: selectedMonth
      });
      // Détacher également l'occurrence de ce mois si elle était rattachée pour la convertir en ponctuel propre
      await serverData.saveTransaction({
        id: deletingSaving.id,
        templateId: null as any,
        recurrenceDay: null as any
      });
      setIsDeleteModalOpen(false);
      setDeletingSaving(null);
      await serverData.refreshAll();
    }
  };

  // Action C : Supprimer définitivement la récurrence
  const handleDeletePermanently = async () => {
    if (!deletingSaving?.templateId) return;
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer définitivement cette récurrence ?\n\n" +
      "• Le modèle sera définitivement supprimé et aucune nouvelle opération ne sera générée.\n" +
      "• Toutes les opérations prévues ('planned') ou annulées ('disabled') du mois courant et des mois futurs seront définitivement supprimées, même si elles ont été personnalisées.\n" +
      "• Tout l'historique passé ainsi que toutes les opérations en attente ou pointées seront conservés et convertis en opérations ponctuelles indépendantes."
    );
    if (!confirmed) return;

    if (serverData) {
      await serverData.deleteRecurrenceTemplate(deletingSaving.templateId);
      setIsDeleteModalOpen(false);
      setDeletingSaving(null);
      await serverData.refreshAll();
    }
  };

  const handleStopRecurrenceFromForm = async () => {
    if (!formData.templateId || !editingId) return;
    if (window.confirm("Arrêter la récurrence mensuelle pour les mois futurs ? L'historique et l'opération de ce mois seront préservés.")) {
      try {
        if (serverData) {
          const currentTpl = serverData.recurrenceTemplates.find(t => t.id === formData.templateId);
          await serverData.saveRecurrenceTemplate({ 
            ...currentTpl,
            id: formData.templateId, 
            isActive: false,
            disabledFromMonth: selectedMonth
          });
          const currentTx = serverData.transactions.find(t => t.id === editingId);
          await serverData.saveTransaction({ 
            ...currentTx,
            id: editingId, 
            date: currentTx?.date || formData.date,
            amount: currentTx?.amount !== undefined ? currentTx.amount : formData.amount,
            accountId: currentTx?.accountId || formData.accountId,
            templateId: null as any,
            recurrenceDay: null as any
          });
          await serverData.refreshAll();
          setIsModalOpen(false);
          setEditingId(null);
        }
      } catch (err: any) {
        console.error("Erreur lors de l'arrêt de la récurrence:", err);
        alert(err.message || "Erreur lors de l'arrêt de la récurrence.");
      }
    }
  };

  const handleAddCategory = async () => {
    const rawName = window.prompt('Nom de la nouvelle catégorie d\'épargne :');
    if (!rawName) return;
    const name = rawName.trim();
    if (!name) return;

    // Vérifier l'absence de doublon insensible à la casse
    const existing = categories?.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.isArchived) {
        if (window.confirm(`La catégorie "${existing.name}" existe déjà mais est archivée. Voulez-vous la réactiver et la sélectionner ?`)) {
          if (serverData) {
            await serverData.saveCategory({ id: existing.id, isArchived: false });
          }
          setFormData(prev => ({ ...prev, categoryId: existing.id }));
        }
      } else {
        alert(`La catégorie "${existing.name}" existe déjà.`);
        setFormData(prev => ({ ...prev, categoryId: existing.id }));
      }
      return;
    }

    const newCat = { id: generateId(), name, type: 'transfer' as const, isArchived: false };
    if (serverData) {
      await serverData.saveCategory(newCat);
    }
    setFormData(prev => ({ ...prev, categoryId: newCat.id }));
  };

  const renderSavingsRow = (saving: Transaction, signPrefix: string, amountColor: string) => {
    const srcAccount = accounts?.find(a => a.id === saving.accountId);
    const destAccount = accounts?.find(a => a.id === saving.destinationAccountId);
    const cat = categories?.find(c => c.id === saving.categoryId);
    const isCleared = saving.status === 'cleared';
    const isRecurringOcc = !!saving.templateId;

    return (
      <tr key={saving.id} style={{ opacity: saving.status === 'disabled' ? 0.5 : 1 }}>
        <td>{saving.date}</td>
        <td>{cat?.name || 'Épargne'}</td>
        <td><strong>{saving.notes || saving.label || 'Virement épargne'}</strong></td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span>{srcAccount?.name || 'Compte source'}</span>
            <ArrowRight size={14} color="var(--text-light)" />
            <span style={{ fontWeight: 600, color: destAccount ? 'var(--primary-color)' : 'var(--danger-color)' }}>
              {destAccount?.name || (
                <span 
                  style={{ color: 'var(--danger-color)', fontStyle: 'italic', cursor: 'pointer', textDecoration: 'underline' }} 
                  onClick={() => handleOpen(saving)} 
                  title="Cliquer pour définir le compte destinataire"
                >
                  Non défini (Modifier)
                </span>
              )}
            </span>
          </div>
        </td>
        <td style={{ color: amountColor, fontWeight: 'bold' }}>
          {signPrefix}{(Number(saving.amount) || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
        </td>
        <td>
          <StatusBadgeSelect
            status={saving.status}
            options={SAVINGS_STATUS_OPTIONS}
            onChange={newStatus => handleUpdateStatus(saving, newStatus)}
          />
        </td>
        <td>
          {isRecurringOcc ? (
            <span className="badge" style={{ backgroundColor: '#e0e7ff', color: '#3730a3', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <Repeat size={12} /> Jour {saving.recurrenceDay || '?'}
              {saving.isCustomized && <span style={{ fontSize: '0.7rem' }}> (modifié)</span>}
            </span>
          ) : (
            <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>Ponctuel</span>
          )}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!isCleared && saving.status !== 'disabled' && (
              <Button 
                variant="icon" 
                onClick={() => handleQuickClear(saving)} 
                title="Pointer le virement comme effectué"
              >
                <CheckCircle2 size={16} color="var(--success-color)" />
              </Button>
            )}
            <Button variant="icon" onClick={() => handleOpen(saving)} title="Modifier"><Edit2 size={16} /></Button>
            <Button variant="icon" onClick={() => handleOpenDelete(saving)} title="Supprimer / Annuler"><Trash2 size={16} color="var(--danger-color)" /></Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>Épargne & transferts</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={() => setIsAddAccountModalOpen(true)} icon={<Plus size={16} />}>
            Nouveau compte d'épargne
          </Button>
          <Button onClick={() => handleOpen()} icon={<Plus size={16} />}>
            Ajouter une opération d'épargne
          </Button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Filter size={16}/> Mois</label>
            <input 
              type="month" 
              className="form-control" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Catégorie</label>
            <select 
              className="form-control" 
              value={selectedCategory} 
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="">Toutes les catégories</option>
              {categories?.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.isArchived ? '(Archivée)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '180px' }}>
            <label className="form-label">Statut</label>
            <select 
              className="form-control" 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {SAVINGS_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {(selectedCategory || selectedStatus) && (
            <div style={{ marginBottom: 0 }}>
              <Button 
                variant="outline" 
                onClick={() => { setSelectedCategory(''); setSelectedStatus(''); }}
                icon={<RotateCcw size={14} />}
                style={{ height: '38px', whiteSpace: 'nowrap' }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Cartes de synthèse */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <Card title="Versements du mois" value={`${monthDeposits.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
            Pointés : {monthClearedDeposits.toLocaleString('fr-FR', {minimumFractionDigits: 2})} € · Prévus : {monthPendingDeposits.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
          </div>
        </Card>
        <Card title="Retraits du mois" value={`${monthWithdrawals.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
            Pointés : {monthClearedWithdrawals.toLocaleString('fr-FR', {minimumFractionDigits: 2})} € · Prévus : {monthPendingWithdrawals.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €
          </div>
        </Card>
        <Card title="Solde réel total de l’épargne" value={`${totalSavingsRealBalance.toLocaleString('fr-FR', {minimumFractionDigits: 2})} €`} />
      </div>

      {/* Section permanente : Mes comptes d'épargne */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Wallet size={18} style={{ color: 'var(--primary-color)' }} />
            Mes comptes d'épargne
          </h2>
          <Button 
            variant="outline" 
            onClick={() => setIsAddAccountModalOpen(true)} 
            icon={<Plus size={14} />}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
          >
            Nouveau compte
          </Button>
        </div>

        {savingsAccountsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>
            Aucun compte d'épargne configuré. Cliquez sur « Nouveau compte » pour en ajouter un.
          </div>
        ) : (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '1rem' 
            }}
          >
            {savingsAccountsList.map(acc => {
              const isSelected = selectedAccountForDrawer?.id === acc.id;
              const accountType = getAccountTypeLabel(acc, serverData?.dashboardSettings?.primaryAccountId, accounts);
              return (
                <div 
                  key={acc.id}
                  style={{
                    background: 'var(--bg-color)',
                    border: `1px solid ${isSelected ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : 'none'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div 
                      style={{ 
                        fontWeight: 600, 
                        fontSize: '0.92rem', 
                        color: 'var(--text-main)', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                      }}
                      title={acc.name}
                    >
                      {acc.name}
                    </div>
                    <div 
                      style={{ 
                        fontSize: '0.8rem', 
                        color: '#475569', 
                        fontWeight: 500,
                        marginTop: '0.2rem',
                        marginBottom: '0.2rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={`Type : ${accountType}`}
                    >
                      Type : {accountType}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Solde initial : {Number(acc.initialBalance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Taux annuel : {acc.interestRate !== undefined && acc.interestRate !== null && !isNaN(Number(acc.interestRate))
                        ? `${Number(acc.interestRate).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
                        : 'Non renseigné'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div 
                      style={{ 
                        fontWeight: 700, 
                        fontSize: '1.05rem', 
                        color: acc.realBalance >= 0 ? 'var(--primary-color)' : 'var(--danger-color)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {acc.realBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </div>
                    <button
                      type="button"
                      className={`account-card-action-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => handleOpenAccountDrawer(acc)}
                      aria-label={`Paramètres du compte ${acc.name}`}
                      title={`Ouvrir les paramètres du compte ${acc.name}`}
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section distincte repliable : Comptes clôturés (visible uniquement si au moins un compte clôturé) */}
      {closedSavingsAccountsList.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #94a3b8' }}>
          <div 
            onClick={() => setIsClosedAccountsExpanded(!isClosedAccountsExpanded)}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <h2 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
              <Archive size={17} style={{ color: '#64748b' }} />
              Comptes clôturés ({closedSavingsAccountsList.length})
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.82rem' }}>
              <span>{isClosedAccountsExpanded ? 'Masquer' : 'Afficher'}</span>
              {isClosedAccountsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          </div>

          {isClosedAccountsExpanded && (
            <div 
              style={{ 
                marginTop: '1rem',
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--border-color)',
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '1rem' 
              }}
            >
              {closedSavingsAccountsList.map(acc => {
                const accountType = getAccountTypeLabel(acc, serverData?.dashboardSettings?.primaryAccountId, accounts);
                return (
                  <div 
                    key={acc.id}
                    style={{
                      background: 'var(--bg-color)',
                      border: '1px dashed var(--border-color)',
                      borderRadius: 'var(--radius)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      opacity: 0.85
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div 
                        style={{ 
                          fontWeight: 600, 
                          fontSize: '0.92rem', 
                          color: 'var(--text-main)', 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                        title={acc.name}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</span>
                        <span className="badge" style={{ backgroundColor: 'var(--border-color)', color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>
                          Clôturé
                        </span>
                      </div>
                      <div 
                        style={{ 
                          fontSize: '0.8rem', 
                          color: '#475569', 
                          fontWeight: 500,
                          marginTop: '0.2rem',
                          marginBottom: '0.2rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={`Type : ${accountType}`}
                      >
                        Type : {accountType}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                        {acc.closedDate ? `Clôturé le : ${acc.closedDate}` : 'Compte inactif'}
                      </div>
                    </div>
                  <div 
                    style={{ 
                      fontWeight: 700, 
                      fontSize: '1rem', 
                      color: 'var(--text-light)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {acc.realBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {/* Encart : Opérations d'épargne en attente ou prévues des mois précédents */}
      {pastUnpaidSavings.length > 0 && (
        <div style={{
          marginBottom: '1.5rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: '0.5rem',
          padding: '1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 700 }}>
              <AlertTriangle size={18} />
              <span>Opérations d'épargne non pointées des mois précédents ({pastUnpaidSavings.length})</span>
            </div>
            <span style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}>
              Ces virements sont toujours en attente ou prévus
            </span>
          </div>
          <div className="table-container" style={{ margin: 0, backgroundColor: '#ffffff', borderRadius: '0.375rem' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Date d'origine</th>
                  <th>Catégorie</th>
                  <th>Objectif / Notes</th>
                  <th>Flux de comptes</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pastUnpaidSavings.map(saving => {
                  const srcAcc = saving.accountId ? accounts?.find(a => a.id === saving.accountId) : undefined;
                  const destAcc = saving.destinationAccountId ? accounts?.find(a => a.id === saving.destinationAccountId) : undefined;
                  const cat = categories?.find(c => c.id === saving.categoryId);
                  return (
                    <tr key={saving.id}>
                      <td><strong>{saving.date}</strong></td>
                      <td>{cat?.name || 'Épargne'}</td>
                      <td><strong>{saving.notes || saving.label || 'Virement épargne'}</strong></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                          <span>{srcAcc?.name || 'Compte source'}</span>
                          <span>→</span>
                          <span style={{ fontWeight: 600, color: destAcc ? 'var(--primary-color)' : 'var(--danger-color)' }}>
                            {destAcc?.name || 'Non défini'}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {(Number(saving.amount) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </td>
                      <td>
                        <StatusBadgeSelect
                          status={saving.status}
                          options={SAVINGS_STATUS_OPTIONS}
                          onChange={newStatus => handleUpdateStatus(saving, newStatus)}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <Button 
                            variant="icon" 
                            onClick={() => handleQuickClear(saving)} 
                            title="Pointer le virement comme effectué"
                          >
                            <CheckCircle2 size={16} color="var(--success-color)" />
                          </Button>
                          <Button 
                            variant="icon" 
                            onClick={() => handleOpen(saving)} 
                            title="Modifier"
                          >
                            <Edit2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section A : Virements vers l'épargne */}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Virements vers l'épargne
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
            Compte courant → compte d'épargne ({depositsSavings.length})
          </span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Objectif / Notes</th>
                <th>Flux de comptes</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Récurrence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {depositsSavings.map(saving => renderSavingsRow(saving, '+', 'var(--success-color)'))}
              {depositsSavings.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>
                    Aucun versement vers l'épargne pour ce mois.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section B : Virements depuis l'épargne */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Virements depuis l'épargne
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
            Compte d'épargne → compte courant ({withdrawalsSavings.length})
          </span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Objectif / Notes</th>
                <th>Flux de comptes</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Récurrence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withdrawalsSavings.map(saving => renderSavingsRow(saving, '-', 'var(--danger-color)'))}
              {withdrawalsSavings.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>
                    Aucun retrait depuis l'épargne pour ce mois.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section C : Virements entre comptes courants (si existants) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Virements entre comptes courants
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
            Compte courant ⇄ compte courant ({checkingTransfers.length})
          </span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Objectif / Notes</th>
                <th>Flux de comptes</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Récurrence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {checkingTransfers.map(saving => renderSavingsRow(saving, '', 'var(--primary-color)'))}
              {checkingTransfers.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>
                    Aucun virement entre comptes courants pour ce mois.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section D : Virements entre comptes d'épargne (si existants) */}
      {internalSavings.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Virements entre comptes d'épargne
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
              Transferts internes ({internalSavings.length})
            </span>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Catégorie</th>
                  <th>Objectif / Notes</th>
                  <th>Flux de comptes</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Récurrence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {internalSavings.map(saving => renderSavingsRow(saving, '', 'var(--text-main)'))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Ajout / Modification */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Modifier le virement d\'épargne' : 'Nouveau virement d\'épargne'}>
        <form onSubmit={handleSave}>
          
          {/* Choix Mode Ponctuel / Récurrent */}
          <div className="form-group">
            <label className="form-label">Type de programmation</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="programmationType" 
                  checked={!isRecurring} 
                  onChange={() => setIsRecurring(false)} 
                />
                <span>Virement ponctuel</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="programmationType" 
                  checked={isRecurring} 
                  onChange={() => setIsRecurring(true)} 
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Repeat size={14} color="var(--primary-color)" /> Mensuel récurrent
                </span>
              </label>
            </div>
            {editingId && (
              <small style={{ color: 'var(--text-light)', marginTop: '0.25rem', display: 'block' }}>
                {isRecurring
                  ? "Ce virement est (ou deviendra) récurrent tous les mois."
                  : "Sélectionnez « Virement ponctuel » pour arrêter la récurrence ou conserver ce virement comme unique."}
              </small>
            )}
          </div>

          {isRecurring ? (
            <div className="form-group">
              <label className="form-label">Jour du virement chaque mois (1 à 31)</label>
              <input 
                type="number" 
                min="1" 
                max="31" 
                className="form-control" 
                required 
                value={recurrenceDay} 
                onChange={e => setRecurrenceDay(parseInt(e.target.value, 10) || 1)} 
              />
              <small style={{ color: 'var(--text-light)', marginTop: '0.25rem', display: 'block' }}>
                Ce virement sera automatiquement généré chaque mois à cette date (ajusté pour les mois plus courts).
              </small>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Date du virement</label>
              <input 
                type="date" 
                className="form-control" 
                required 
                value={formData.date || ''} 
                onChange={e => setFormData({...formData, date: e.target.value})} 
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="operation-amount">Montant (€)</label>
            <input 
              id="operation-amount"
              type="number" 
              step="0.01" 
              className="form-control" 
              required 
              value={formData.amount === undefined ? '' : formData.amount} 
              onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} 
            />
          </div>

          <div className="form-group" style={{ 
            padding: '0.65rem 0.75rem', 
            borderRadius: '6px', 
            backgroundColor: 'rgba(217, 119, 6, 0.04)', 
            border: '1px solid rgba(217, 119, 6, 0.25)',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label className="form-label" htmlFor="operation-account-id" style={{ margin: 0, fontWeight: 600 }}>
                Compte source (débité)
              </label>
              <span style={{ 
                fontSize: '0.72rem', 
                fontWeight: 600, 
                color: '#b45309', 
                backgroundColor: 'rgba(217, 119, 6, 0.12)', 
                padding: '0.15rem 0.45rem', 
                borderRadius: '4px' 
              }}>
                Compte émetteur
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select 
                id="operation-account-id"
                className="form-control" 
                required 
                style={{
                  borderColor: 'rgba(217, 119, 6, 0.35)',
                  backgroundColor: 'var(--bg-color)',
                  flex: 1
                }}
                value={formData.accountId || ''} 
                onChange={e => {
                  const newSourceId = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    accountId: newSourceId,
                    destinationAccountId: prev.destinationAccountId === newSourceId ? '' : prev.destinationAccountId
                  }));
                }}
              >
                <option value="">Sélectionner le compte source...</option>
                {accounts?.filter(a => !a.isClosed || (editingId && a.id === formData.accountId)).map(a => (
                  <option key={a.id} value={a.id}>
                    {formatAccountOptionLabel(a, serverData?.dashboardSettings?.primaryAccountId, accounts)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddAccountModalOpen(true)}
                icon={<Plus size={16} />}
                title="Ajouter un compte"
                aria-label="Ajouter un compte"
              />
            </div>
          </div>

          <div className="form-group" style={{ 
            padding: '0.65rem 0.75rem', 
            borderRadius: '6px', 
            backgroundColor: 'rgba(37, 99, 235, 0.04)', 
            border: '1px solid rgba(37, 99, 235, 0.25)',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label className="form-label" htmlFor="operation-destination-account-id" style={{ margin: 0, fontWeight: 600 }}>
                Compte destinataire (crédité)
              </label>
              <span style={{ 
                fontSize: '0.72rem', 
                fontWeight: 600, 
                color: '#1d4ed8', 
                backgroundColor: 'rgba(37, 99, 235, 0.12)', 
                padding: '0.15rem 0.45rem', 
                borderRadius: '4px' 
              }}>
                Compte bénéficiaire
              </span>
            </div>

            {eligibleDestAccounts.length > 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select 
                  id="operation-destination-account-id"
                  aria-label="Compte destinataire (crédité)"
                  className="form-control" 
                  required 
                  style={{
                    borderColor: 'rgba(37, 99, 235, 0.35)',
                    backgroundColor: 'var(--bg-color)',
                    flex: 1
                  }}
                  value={formData.destinationAccountId || ''} 
                  onChange={e => setFormData({...formData, destinationAccountId: e.target.value})}
                >
                  <option value="">Sélectionner le compte destinataire...</option>
                  {eligibleDestAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {formatAccountOptionLabel(a, serverData?.dashboardSettings?.primaryAccountId, accounts)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddAccountModalOpen(true)}
                  icon={<Plus size={16} />}
                  title="Ajouter un compte d'épargne"
                  aria-label="Ajouter un compte d'épargne"
                />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select id="operation-destination-account-id" className="form-control" disabled style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed', flex: 1 }}>
                    <option>Aucun autre compte disponible</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddAccountModalOpen(true)}
                    icon={<Plus size={16} />}
                    title="Ajouter un compte d'épargne"
                    aria-label="Ajouter un compte d'épargne"
                  />
                </div>
                <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.65rem 0.85rem', marginTop: '0.5rem', color: '#92400e', fontSize: '0.825rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    <AlertCircle size={15} /> Aucun autre compte disponible
                  </div>
                  <p style={{ margin: 0 }}>
                    Un virement d'épargne nécessite au moins deux comptes distincts. Cliquez sur le bouton <strong>+</strong> pour créer un compte d'épargne.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Catégorie</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select 
                className="form-control" 
                required 
                value={formData.categoryId || ''} 
                onChange={e => setFormData({...formData, categoryId: e.target.value})}
              >
                <option value="">Sélectionner une catégorie...</option>
                {categories?.filter(c => !c.isArchived || c.id === formData.categoryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.isArchived ? ' (Archivée)' : ''}</option>
                ))}
              </select>
              <Button variant="outline" onClick={handleAddCategory} type="button" icon={<Plus size={16} />}></Button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Statut</label>
            <select 
              className="form-control" 
              required 
              value={formData.status || 'planned'} 
              onChange={e => setFormData({...formData, status: e.target.value as any})}
            >
              <option value="planned">Prévu (À venir)</option>
              <option value="cleared">Effectué (Débité / Pointé en banque)</option>
              <option value="pending">En attente (Ordre émis)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Objectif / Notes</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ex: Livret A, Épargne de précaution, Vacances..." 
              value={formData.notes || ''} 
              onChange={e => setFormData({...formData, notes: e.target.value})} 
            />
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {formData.templateId && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleStopRecurrenceFromForm}
                  style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                >
                  Arrêter la récurrence
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary">Enregistrer</Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Suppression / Annulation */}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Supprimer ou annuler l'opération">
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ marginBottom: '1rem' }}>
            Voulez-vous supprimer l'opération d'épargne <strong>{deletingSaving?.notes || deletingSaving?.label || 'Virement'}</strong> ({Number(deletingSaving?.amount).toFixed(2)} €) ?
          </p>
          {deletingSaving?.templateId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ backgroundColor: '#fef3c7', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem', color: '#92400e' }}>
                <ShieldAlert size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                Cette opération fait partie d'un mouvement d'épargne récurrent mensuel. Choisissez l'action souhaitée :
              </div>

              {/* Action A */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Option 1 — Annuler ce mois uniquement
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Désactive uniquement l'occurrence de {selectedMonth}. La récurrence reste active et se poursuivra les mois suivants.
                </div>
                <Button variant="outline" onClick={handleConfirmDeleteSingle}>
                  Annuler ce mois uniquement ({selectedMonth})
                </Button>
              </div>

              {/* Action B */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Option 2 — Arrêter la récurrence pour la suite
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Conserve intégralement l'opération de ce mois et tout l'historique passé. Désactive le modèle et supprime les futures opérations prévues non personnalisées.
                </div>
                <Button variant="outline" onClick={handleStopRecurrence} style={{ color: '#d97706', borderColor: '#d97706' }}>
                  Arrêter la récurrence pour la suite
                </Button>
              </div>

              {/* Action C */}
              <div style={{ border: '1px solid #fee2e2', backgroundColor: '#fff5f5', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--danger-color)', marginBottom: '0.25rem' }}>
                  Option 3 — Supprimer définitivement la récurrence
                </div>
                <div style={{ fontSize: '0.8rem', color: '#7f1d1d', marginBottom: '0.5rem' }}>
                  Supprime le modèle ainsi que toutes les opérations prévues ou annulées du mois courant et des mois futurs (même personnalisées). Conserve et détache tout l'historique passé ainsi que les opérations en attente ou pointées.
                </div>
                <Button variant="primary" style={{ backgroundColor: 'var(--danger-color)' }} onClick={handleDeletePermanently}>
                  Supprimer définitivement la récurrence
                </Button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Annuler</Button>
              <Button variant="primary" style={{ backgroundColor: 'var(--danger-color)' }} onClick={handleConfirmDeleteSingle}>
                Confirmer la suppression
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Création rapide de compte épargne */}
      <Modal isOpen={isNewAccountModalOpen} onClose={() => setIsNewAccountModalOpen(false)} title="Créer un nouveau compte épargne">
        <form onSubmit={handleCreateCustomAccount}>
          <div className="form-group">
            <label className="form-label">Nom du compte</label>
            <input 
              type="text" 
              className="form-control" 
              required 
              placeholder="Ex: Livret A, LDDS, LEP, Compte Épargne Logement..." 
              value={newAccountForm.name} 
              onChange={e => setNewAccountForm({...newAccountForm, name: e.target.value})} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Type de compte</label>
            <select 
              className="form-control" 
              value={newAccountForm.type} 
              onChange={e => setNewAccountForm({...newAccountForm, type: e.target.value as any})}
            >
              <option value="savings">Compte d'épargne (Livret, PEL, etc.)</option>
              <option value="checking">Compte courant secondaire</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Solde initial (€)</label>
            <input 
              type="number" 
              step="0.01" 
              className="form-control" 
              value={newAccountForm.initialBalance} 
              onChange={e => setNewAccountForm({...newAccountForm, initialBalance: parseFloat(e.target.value) || 0})} 
            />
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={() => setIsNewAccountModalOpen(false)}>Annuler</Button>
            <Button variant="primary" type="submit">Créer et sélectionner ce compte</Button>
          </div>
        </form>
      </Modal>

      {/* Modale d'ajout d'un nouveau compte */}
      <Modal
        isOpen={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        title="Nouveau compte"
      >
        <form onSubmit={handleAddNewAccountFromModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="new-acc-subtype">Type de compte *</label>
              <select
                id="new-acc-subtype"
                className="form-control"
                value={newAddAccountForm.subType}
                onChange={e => {
                  const val = e.target.value;
                  setNewAddAccountForm(prev => ({
                    ...prev,
                    subType: val
                  }));
                }}
              >
                {SAVINGS_SUBTYPES.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>

            {newAddAccountForm.subType === 'other' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="new-acc-custom-subtype">
                  Type de compte personnalisé *
                </label>
                <input
                  id="new-acc-custom-subtype"
                  type="text"
                  className="form-control"
                  placeholder="Ex: Assurance-vie luxembourgeoise, Livret Zesto..."
                  required
                  value={newAddAccountForm.customSubType}
                  onChange={e => setNewAddAccountForm(prev => ({ ...prev, customSubType: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="new-acc-name">
                Nom du compte
              </label>
              <input
                id="new-acc-name"
                type="text"
                className="form-control"
                placeholder={newAddAccountForm.subType === 'other' ? 'Ex: Mon assurance-vie' : 'Ex: Livret A'}
                value={newAddAccountForm.name}
                onChange={e => setNewAddAccountForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="new-acc-balance">Solde initial (€) *</label>
              <input
                id="new-acc-balance"
                type="text"
                className="form-control"
                required
                value={newAddAccountForm.initialBalance}
                onChange={e => setNewAddAccountForm(prev => ({ ...prev, initialBalance: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="new-acc-rate">
                Taux d'intérêt annuel (%) <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>(facultatif)</span>
              </label>
              <input
                id="new-acc-rate"
                type="text"
                className="form-control"
                placeholder="Ex: 3.0"
                value={newAddAccountForm.interestRate}
                onChange={e => setNewAddAccountForm(prev => ({ ...prev, interestRate: e.target.value }))}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="new-acc-target">
                Objectif d'épargne (€) <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>(facultatif)</span>
              </label>
              <input
                id="new-acc-target"
                type="text"
                className="form-control"
                placeholder="Ex: 10000"
                value={newAddAccountForm.targetAmount}
                onChange={e => setNewAddAccountForm(prev => ({ ...prev, targetAmount: e.target.value }))}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <Button type="button" variant="outline" onClick={() => setIsAddAccountModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Créer le compte
            </Button>
          </div>
        </form>
      </Modal>

      {/* Panneau latéral dédié aux paramètres d'un compte d'épargne */}
      {selectedAccountForDrawer && (() => {
        const acc = selectedAccountForDrawer;
        const currentRealBalance = calculateRealBalance(acc, allTransactions || []);
        const isVirginAccount = Number(acc.initialBalance || 0) === 0 && 
          !(allTransactions || []).some(t => t.accountId === acc.id || t.destinationAccountId === acc.id);

        return (
          <div className="drawer-overlay" onClick={handleCloseAccountDrawer}>
            <div className="drawer-panel" onClick={e => e.stopPropagation()}>
              {/* En-tête du panneau */}
              <div className="drawer-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Settings size={18} style={{ color: 'var(--primary-color)' }} />
                      Paramètres du compte
                    </h2>
                    <span className="badge" style={{ backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-color)', fontSize: '0.75rem' }}>
                      Actif
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.2rem' }}>
                    {acc.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseAccountDrawer}
                  aria-label="Fermer le panneau des paramètres"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-light)',
                    padding: '0.25rem',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Formulaire des paramètres ordinaires */}
              <form onSubmit={handleSaveAccountDrawer} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="drawer-body">
                  {/* Section 1 : Informations du compte */}
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.85rem 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Wallet size={16} style={{ color: 'var(--primary-color)' }} />
                      Informations du compte
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`drawer-subtype-${acc.id}`}>
                          Type de compte
                        </label>
                        <select
                          id={`drawer-subtype-${acc.id}`}
                          className="form-control"
                          value={drawerForm.subType}
                          onChange={e => setDrawerForm(prev => ({ ...prev, subType: e.target.value }))}
                        >
                          {SAVINGS_SUBTYPES.map(st => (
                            <option key={st.value} value={st.value}>{st.label}</option>
                          ))}
                        </select>
                      </div>

                      {drawerForm.subType === 'other' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" htmlFor={`drawer-custom-subtype-${acc.id}`}>
                            Type de compte personnalisé *
                          </label>
                          <input
                            id={`drawer-custom-subtype-${acc.id}`}
                            type="text"
                            className="form-control"
                            placeholder="Ex: Assurance-vie luxembourgeoise, Livret Zesto..."
                            required
                            value={drawerForm.customSubType}
                            onChange={e => setDrawerForm(prev => ({ ...prev, customSubType: e.target.value }))}
                          />
                        </div>
                      )}

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`drawer-name-${acc.id}`}>
                          Nom du compte
                        </label>
                        <input
                          id={`drawer-name-${acc.id}`}
                          type="text"
                          className="form-control"
                          required
                          value={drawerForm.name}
                          onChange={e => setDrawerForm(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`drawer-balance-${acc.id}`}>
                          Solde initial de départ (€)
                        </label>
                        <input
                          id={`drawer-balance-${acc.id}`}
                          type="text"
                          className="form-control"
                          required
                          value={drawerForm.initialBalance}
                          onChange={e => setDrawerForm(prev => ({ ...prev, initialBalance: e.target.value }))}
                        />
                      </div>

                      {/* Solde réel calculé en lecture seule */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-color)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.875rem'
                      }}>
                        <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>
                          Solde réel calculé (lecture seule) :
                        </span>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: currentRealBalance >= 0 ? 'var(--primary-color)' : 'var(--danger-color)'
                        }}>
                          {currentRealBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2 : Taux et objectif (purement informatifs) */}
                  <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.85rem 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp size={16} style={{ color: 'var(--primary-color)' }} />
                      Taux et objectif
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`drawer-rate-${acc.id}`}>
                          Taux d'intérêt annuel (%) <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>(facultatif, informatif)</span>
                        </label>
                        <input
                          id={`drawer-rate-${acc.id}`}
                          type="text"
                          className="form-control"
                          placeholder="Ex: 3.0"
                          value={drawerForm.interestRate}
                          onChange={e => setDrawerForm(prev => ({ ...prev, interestRate: e.target.value }))}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`drawer-target-${acc.id}`}>
                          Objectif d'épargne (€) <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>(facultatif)</span>
                        </label>
                        <input
                          id={`drawer-target-${acc.id}`}
                          type="text"
                          className="form-control"
                          placeholder="Ex: 10000"
                          value={drawerForm.targetAmount}
                          onChange={e => setDrawerForm(prev => ({ ...prev, targetAmount: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Boutons d'enregistrement des modifications des champs */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.5rem' }}>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCloseAccountDrawer}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!isDrawerDirty}
                    >
                      Enregistrer les modifications
                    </Button>
                  </div>

                  {/* Section 3 : Actions sensibles du compte (séparées des champs ordinaires) */}
                  <div style={{ 
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem', 
                    borderTop: '2px dashed var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <AlertCircle size={16} style={{ color: 'var(--warning-color)' }} />
                      <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Actions sensibles sur le compte
                      </h4>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-light)' }}>
                      Ces actions sont indépendantes de l'enregistrement des champs et nécessitent chacune une confirmation spécifique.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {/* Action individuelle : Clôturer le compte */}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => handleCloseAccount(acc)}
                        aria-label={`Clôturer le compte ${acc.name}`}
                        style={{
                          fontSize: '0.85rem',
                          padding: '0.5rem 0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          color: '#ffffff',
                          backgroundColor: '#dc2626',
                          borderColor: '#dc2626',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          cursor: 'pointer'
                        }}
                        title="Clôturer ce compte en conservant son historique financier complet"
                      >
                        <Archive size={16} style={{ color: '#ffffff' }} />
                        <span style={{ fontWeight: 500, color: '#ffffff' }}>Clôturer le compte</span>
                      </button>

                      {/* Action individuelle destructive : Supprimer définitivement */}
                      {isVirginAccount ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleDeleteAccountPermanently(acc)}
                          aria-label={`Supprimer définitivement le compte vierge ${acc.name}`}
                          style={{
                            fontSize: '0.85rem',
                            padding: '0.5rem 0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            color: '#ffffff',
                            backgroundColor: '#dc2626',
                            borderColor: '#dc2626',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            cursor: 'pointer'
                          }}
                          title="Supprimer définitivement ce compte vierge sans historique"
                        >
                          <Trash2 size={16} style={{ color: '#ffffff' }} />
                          <span style={{ fontWeight: 500, color: '#ffffff' }}>Supprimer définitivement</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleDeleteAccountPermanently(acc)}
                          aria-label={`Supprimer définitivement le compte ${acc.name} (action protégée)`}
                          style={{
                            fontSize: '0.85rem',
                            padding: '0.5rem 0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            color: '#ffffff',
                            backgroundColor: '#dc2626',
                            borderColor: '#dc2626',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            opacity: 0.75,
                            cursor: 'pointer'
                          }}
                          title="Ce compte possède un historique financier ou un solde : la suppression physique est bloquée"
                        >
                          <Trash2 size={16} style={{ color: '#ffffff' }} />
                          <span style={{ fontWeight: 500, color: '#ffffff' }}>Supprimer définitivement</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
