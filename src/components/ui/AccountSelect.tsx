import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Account } from '../../db/database';
import { generateId } from '../../db/database';
import { useServerDataOptional } from '../../contexts/ServerDataContext';
import { Button, Modal, AmountInput } from './Components';
import { formatAccountOptionLabel } from '../../services/accountPresentation';

export interface AccountSelectProps {
  value: string;
  onChange: (accountId: string) => void;
  accounts?: Account[];
  filterType?: 'checking' | 'savings' | 'cash' | Array<'checking' | 'savings' | 'cash'>;
  excludeId?: string;
  showClosedIfSelected?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  allowCreate?: boolean;
  disabled?: boolean;
}

export function formatAccountTypeLabel(type: string): string {
  switch (type) {
    case 'checking': return 'Courant';
    case 'savings': return 'Épargne';
    case 'cash': return 'Espèces';
    default: return type;
  }
}

export const AccountSelect: React.FC<AccountSelectProps> = ({
  value,
  onChange,
  accounts: propAccounts,
  filterType,
  excludeId,
  showClosedIfSelected = true,
  required = false,
  id,
  name,
  className = 'form-control',
  placeholder = 'Sélectionner un compte...',
  allowCreate = true,
  disabled = false
}) => {
  const serverData = useServerDataOptional();
  const allAccounts = propAccounts || serverData?.accounts || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [newAccForm, setNewAccForm] = useState({
    name: '',
    type: 'checking' as 'checking' | 'savings' | 'cash',
    initialBalance: 0,
    referenceDate: new Date().toISOString().split('T')[0]
  });

  // Filtrage des comptes
  const filteredAccounts = allAccounts.filter(acc => {
    if (excludeId && acc.id === excludeId) return false;

    // Gestion des comptes clôturés
    if (acc.isClosed) {
      if (showClosedIfSelected && acc.id === value) {
        return true;
      }
      return false;
    }

    if (filterType) {
      if (Array.isArray(filterType)) {
        if (!filterType.includes(acc.type as any)) return false;
      } else if (acc.type !== filterType) {
        return false;
      }
    }

    return true;
  });

  const handleOpenCreateModal = () => {
    setError(null);
    setNewAccForm({
      name: '',
      type: Array.isArray(filterType) ? filterType[0] : (filterType || 'checking'),
      initialBalance: 0,
      referenceDate: new Date().toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const handleCreateAccount = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!newAccForm.name.trim()) {
      setError('Veuillez saisir un nom pour le compte.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const newAccount: Account = {
      id: generateId(),
      name: newAccForm.name.trim(),
      type: newAccForm.type,
      subType: newAccForm.type === 'checking' ? 'checking' : 'other',
      initialBalance: Number(newAccForm.initialBalance) || 0,
      referenceDate: newAccForm.referenceDate || new Date().toISOString().split('T')[0],
      isClosed: false
    };

    try {
      if (serverData) {
        await serverData.saveAccount(newAccount);
      }
      onChange(newAccount.id);
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du compte.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
        <select
          id={id}
          name={name}
          className={className}
          required={required}
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">{placeholder}</option>
          {filteredAccounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {formatAccountOptionLabel(acc, serverData?.dashboardSettings?.primaryAccountId, allAccounts)}
            </option>
          ))}
        </select>

        {allowCreate && (
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenCreateModal}
            icon={<Plus size={16} />}
            title="Ajouter un compte bancaire"
            aria-label="Ajouter un compte bancaire"
            style={{ flexShrink: 0 }}
          />
        )}
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => { if (!isSaving) setIsModalOpen(false); }}
          title="Ajouter un compte bancaire"
        >
          <div>
            {error && (
              <div style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                color: '#991b1b',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                marginBottom: '1rem'
              }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Nom du compte *</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="Ex : Compte Courant, Livret A, Compte Joint..."
                value={newAccForm.name}
                onChange={e => setNewAccForm({ ...newAccForm, name: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateAccount(e);
                  }
                }}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Type de compte *</label>
              <select
                className="form-control"
                value={newAccForm.type}
                onChange={e => setNewAccForm({ ...newAccForm, type: e.target.value as any })}
              >
                <option value="checking">Compte Courant</option>
                <option value="savings">Compte d'Épargne</option>
                <option value="cash">Espèces / Portefeuille</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Solde initial (€)</label>
              <AmountInput
                allowNegative
                className="form-control"
                value={newAccForm.initialBalance}
                onValueChange={val => setNewAccForm({ ...newAccForm, initialBalance: val ?? 0 })}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreateAccount(e);
                  }
                }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Date de référence</label>
              <input
                type="date"
                className="form-control"
                value={newAccForm.referenceDate}
                onChange={e => setNewAccForm({ ...newAccForm, referenceDate: e.target.value })}
              />
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleCreateAccount}
                disabled={isSaving}
              >
                {isSaving ? 'Création...' : 'Créer et sélectionner'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
