import React, { useState, useEffect, useRef } from 'react';
import { generateId } from '../../db/database';
import type { Transaction, Category, Account } from '../../db/database';
import { Modal, Button, AccountSelect, AmountInput } from '../ui/Components';
import { Plus } from 'lucide-react';
import { useServerDataOptional } from '../../contexts/ServerDataContext';

export const PAYMENT_METHODS = [
  'Carte bancaire',
  'Virement',
  'Prélèvement automatique',
  'Espèces',
  'Chèque',
  'PayPal',
  'Paiement mobile',
  'Autre'
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Transaction) => Promise<void> | void;
  editingTransaction?: Transaction | null;
  categories: Category[];
  accounts: Account[];
  onAddCategory?: () => Promise<void> | void;
  title?: string;
  defaultDate?: string;
  isFutureMode?: boolean;
  defaultStatus?: 'planned' | 'pending' | 'cleared' | 'disabled';
}

export default function ExpenseModal({
  isOpen,
  onClose,
  onSave,
  editingTransaction,
  categories,
  accounts,
  onAddCategory,
  title,
  defaultDate,
  isFutureMode,
  defaultStatus
}: ExpenseModalProps) {
  const serverData = useServerDataOptional();
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const prevIsOpenRef = useRef(false);
  const prevEditingIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevEditingIdRef.current = undefined;
      return;
    }

    const currentEditingId = editingTransaction?.id;
    const justOpened = !prevIsOpenRef.current;
    const editingTargetChanged = currentEditingId !== prevEditingIdRef.current;

    if (justOpened || editingTargetChanged) {
      prevIsOpenRef.current = true;
      prevEditingIdRef.current = currentEditingId;

      if (editingTransaction) {
        setFormData({
          ...editingTransaction,
          paymentMethod: editingTransaction.paymentMethod || '',
          checkNumber: editingTransaction.checkNumber || ''
        });
      } else {
        setFormData({
          date: defaultDate || new Date().toISOString().split('T')[0],
          amount: 0,
          status: defaultStatus || 'planned',
          label: '',
          notes: '',
          paymentMethod: '',
          checkNumber: '',
          categoryId: categories?.[0]?.id || '',
          accountId: accounts?.[0]?.id || '',
          type: 'daily'
        });
      }
    }
  }, [isOpen, editingTransaction?.id, defaultDate, isFutureMode, defaultStatus]);

  const handleAddCategory = async () => {
    if (onAddCategory) {
      await onAddCategory();
      return;
    }
    const name = window.prompt('Nom de la nouvelle catégorie :');
    if (name && serverData) {
      const newCat = { id: generateId(), name, type: 'daily' as const, isArchived: false };
      const saved = await serverData.saveCategory(newCat);
      setFormData(prev => ({ ...prev, categoryId: saved.id }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId || !formData.categoryId || formData.amount === undefined || isNaN(formData.amount)) {
      alert("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    // Si le moyen de paiement n'est pas Chèque, le numéro de chèque ne doit pas être conservé
    const cleanPaymentMethod = formData.paymentMethod ? String(formData.paymentMethod).trim() : undefined;
    const cleanCheckNumber = cleanPaymentMethod === 'Chèque' && formData.checkNumber 
      ? String(formData.checkNumber).trim() 
      : undefined;

    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    const currentMonthKey = todayStr.slice(0, 7);

    // Détermination de l'éligibilité au statut de dépense future :
    // - Mode création/édition depuis « Dépenses futures » (isFutureMode)
    // - Dépense ayant déjà un marqueur expectedDate (conserve son statut de dépense future/en retard)
    // - Dépense dont la date appartient à un mois strictement futur
    const isFutureEligible = Boolean(
      isFutureMode || 
      (editingTransaction?.expectedDate && editingTransaction.expectedDate.trim() !== '') ||
      (formData.date && formData.date.slice(0, 7) > currentMonthKey)
    );

    // Actualisation de expectedDate : suit la nouvelle date saisie si la dépense est éligible
    let expectedDate: string | undefined = undefined;
    if (isFutureEligible && formData.date) {
      expectedDate = formData.date;
    }

    const transactionToSave: Transaction = {
      ...formData,
      amount: Number(formData.amount),
      id: editingTransaction?.id || generateId(),
      type: 'daily',
      paymentMethod: cleanPaymentMethod || undefined,
      checkNumber: cleanCheckNumber || undefined,
      expectedDate: expectedDate || undefined
    } as Transaction;

    // Supprimer les clés si undefined pour garder un objet propre
    if (!transactionToSave.paymentMethod) delete transactionToSave.paymentMethod;
    if (!transactionToSave.checkNumber) delete transactionToSave.checkNumber;
    if (!transactionToSave.expectedDate) delete transactionToSave.expectedDate;

    await onSave(transactionToSave);
    onClose();
  };

  const modalTitle = title || (editingTransaction ? 'Modifier la dépense' : 'Ajouter une dépense');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input 
            type="date" 
            className="form-control" 
            required 
            value={formData.date || ''} 
            onChange={e => setFormData({ ...formData, date: e.target.value })} 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Libellé</label>
          <input 
            type="text" 
            className="form-control" 
            required 
            placeholder="Ex: Courses, Restaurant..." 
            value={formData.label || ''} 
            onChange={e => setFormData({ ...formData, label: e.target.value })} 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Montant (€)</label>
          <AmountInput 
            className="form-control" 
            required 
            value={formData.amount === undefined ? '' : formData.amount} 
            onValueChange={val => setFormData({ ...formData, amount: val })} 
          />
        </div>
        <div className="form-group">
          <label className="form-label">Catégorie</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select 
              className="form-control" 
              required 
              value={formData.categoryId || ''} 
              onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">Sélectionner...</option>
              {categories?.filter(c => !c.isArchived || c.id === formData.categoryId).map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.isArchived ? ' (Archivée)' : ''}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={handleAddCategory} type="button" icon={<Plus size={16} />} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Compte</label>
          <AccountSelect
            accounts={accounts}
            value={formData.accountId || ''}
            onChange={id => setFormData({ ...formData, accountId: id })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Moyen de paiement</label>
          <select 
            data-testid="payment-method-select"
            className="form-control" 
            value={formData.paymentMethod || ''} 
            onChange={e => {
              const nextMethod = e.target.value;
              setFormData(prev => ({
                ...prev,
                paymentMethod: nextMethod,
                checkNumber: nextMethod === 'Chèque' ? prev.checkNumber : ''
              }));
            }}
          >
            <option value="">Non spécifié</option>
            {PAYMENT_METHODS.map(method => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>
        {formData.paymentMethod === 'Chèque' && (
          <div className="form-group" data-testid="check-number-group">
            <label className="form-label">Numéro de chèque</label>
            <input 
              data-testid="check-number-input"
              type="text" 
              className="form-control" 
              placeholder="Ex: 001245" 
              value={formData.checkNumber || ''} 
              onChange={e => setFormData({ ...formData, checkNumber: e.target.value })} 
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select 
            className="form-control" 
            required 
            value={formData.status || defaultStatus || 'planned'} 
            onChange={e => setFormData({ ...formData, status: e.target.value as any })}
          >
            <option value="cleared">Débité</option>
            <option value="pending">En attente</option>
            <option value="planned">Prévu</option>
            <option value="disabled">Désactivé</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Note</label>
          <input 
            type="text" 
            className="form-control" 
            value={formData.notes || ''} 
            onChange={e => setFormData({ ...formData, notes: e.target.value })} 
          />
        </div>
        <div className="modal-footer">
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary">Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}
