import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { IncomePayer } from '../../db/database';
import { generateId } from '../../db/database';
import { useServerDataOptional } from '../../contexts/ServerDataContext';
import { Button, Modal } from './Components';

export interface IncomePayerSelectProps {
  value?: string;
  onChange: (payerId: string) => void;
  incomePayers?: IncomePayer[];
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  allowCreate?: boolean;
  disabled?: boolean;
}

export const IncomePayerSelect: React.FC<IncomePayerSelectProps> = ({
  value = '',
  onChange,
  incomePayers: propPayers,
  required = false,
  id,
  name,
  className = 'form-control',
  placeholder = 'Sélectionner un organisme verseur...',
  allowCreate = true,
  disabled = false
}) => {
  const serverData = useServerDataOptional();
  const allPayers = propPayers || serverData?.incomePayers || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [payerName, setPayerName] = useState('');

  // Filtre les organismes archivés sauf s'il s'agit de la valeur sélectionnée
  const filteredPayers = allPayers.filter(p => !p.isArchived || p.id === value);

  const handleOpenCreateModal = () => {
    setError(null);
    setPayerName('');
    setIsModalOpen(true);
  };

  const handleCreatePayer = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = payerName.trim();
    if (!trimmed) {
      setError('Veuillez saisir un nom pour l\'organisme verseur.');
      return;
    }

    // Vérifier les doublons
    const exists = allPayers.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setError('Un organisme verseur avec ce nom existe déjà.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const newPayer: IncomePayer = {
      id: generateId(),
      name: trimmed,
      isArchived: false,
      createdAt: new Date().toISOString()
    };

    try {
      if (serverData) {
        await serverData.saveIncomePayer(newPayer);
      }
      onChange(newPayer.id);
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création de l\'organisme verseur.');
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
          {filteredPayers.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.isArchived ? ' (Désactivé)' : ''}
            </option>
          ))}
        </select>

        {allowCreate && (
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenCreateModal}
            icon={<Plus size={16} />}
            title="Ajouter un organisme verseur"
            aria-label="Ajouter un organisme verseur"
            style={{ flexShrink: 0 }}
          />
        )}
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => { if (!isSaving) setIsModalOpen(false); }}
          title="Ajouter un organisme verseur"
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
              <label className="form-label">Nom de l'organisme verseur *</label>
              <input
                type="text"
                className="form-control"
                required
                placeholder="Ex : Employeur SAS, CAF, CPAM, France Travail..."
                value={payerName}
                onChange={e => setPayerName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreatePayer(e);
                  }
                }}
                autoFocus
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
                onClick={handleCreatePayer}
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
