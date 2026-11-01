import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Modal } from '../components/ui/Components';
import { Plus, Edit2, Trash2, CheckCircle, Clock, AlertTriangle, Calendar, FileText, Tag, Filter } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { useServerDataOptional } from '../contexts/ServerDataContext';
import type { PlannedExpense, PlannedUrgency } from '../db/database';

interface PlannedExpenseFormData {
  id?: string;
  label: string;
  estimatedAmount: string;
  categoryId: string;
  urgency: PlannedUrgency;
  targetDate: string;
  notes: string;
}

const URGENCY_CONFIG: Record<PlannedUrgency, { label: string; badgeClass: string; bg: string; color: string; border: string }> = {
  urgent: {
    label: 'Urgent',
    badgeClass: 'badge-danger',
    bg: '#fee2e2',
    color: '#991b1b',
    border: '#f87171'
  },
  medium: {
    label: 'Moyennement urgent',
    badgeClass: 'badge-warning',
    bg: '#fef3c7',
    color: '#92400e',
    border: '#fbbf24'
  },
  low: {
    label: 'Pas urgent',
    badgeClass: 'badge-info',
    bg: '#dcfce7',
    color: '#166534',
    border: '#86efac'
  }
};

export default function PlannedExpenses() {
  const serverData = useServerDataOptional();
  const [items, setItems] = useState<PlannedExpense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtre par urgence
  const [selectedUrgencyFilter, setSelectedUrgencyFilter] = useState<string>('all');

  // Modal d'ajout / modification
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlannedExpense | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PlannedExpenseFormData>({
    label: '',
    estimatedAmount: '',
    categoryId: '',
    urgency: 'medium',
    targetDate: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.plannedExpenses.getAll();
      setItems(data || []);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger vos projets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [serverData?.lastSyncTime]);

  // Catégories disponibles pour le sélecteur
  const availableCategories = useMemo(() => {
    if (!serverData?.categories) return [];
    return serverData.categories.filter(c => !c.isArchived);
  }, [serverData?.categories]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    if (serverData?.categories) {
      for (const cat of serverData.categories) {
        map.set(cat.id, cat.name);
      }
    }
    return map;
  }, [serverData?.categories]);

  // Filtrage et tri
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedUrgencyFilter === 'all') return true;
      return item.urgency === selectedUrgencyFilter;
    });
  }, [items, selectedUrgencyFilter]);

  // Total général des montants estimés pour les projets actifs
  const totalEstimatedAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.estimatedAmount) || 0), 0);
  }, [items]);

  const urgentCount = useMemo(() => items.filter(i => i.urgency === 'urgent').length, [items]);
  const mediumCount = useMemo(() => items.filter(i => i.urgency === 'medium').length, [items]);
  const lowCount = useMemo(() => items.filter(i => i.urgency === 'low').length, [items]);

  // Ouverture modal Création
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData({
      label: '',
      estimatedAmount: '',
      categoryId: '',
      urgency: 'medium',
      targetDate: '',
      notes: ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Ouverture modal Édition
  const handleOpenEditModal = (item: PlannedExpense) => {
    setEditingItem(item);
    setFormData({
      id: item.id,
      label: item.label,
      estimatedAmount: String(item.estimatedAmount),
      categoryId: item.categoryId || '',
      urgency: item.urgency,
      targetDate: item.targetDate || '',
      notes: item.notes || ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Enregistrement
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedLabel = formData.label.trim();
    if (!trimmedLabel) {
      setFormError('L\'intitulé du projet est obligatoire.');
      return;
    }

    const amount = parseFloat(formData.estimatedAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setFormError('Le montant estimé doit être un nombre strictement supérieur à 0.');
      return;
    }

    const payload: Partial<PlannedExpense> = {
      ...(editingItem ? { id: editingItem.id, createdAt: editingItem.createdAt } : {}),
      label: trimmedLabel,
      estimatedAmount: amount,
      categoryId: formData.categoryId || null,
      urgency: formData.urgency,
      targetDate: formData.targetDate || null,
      notes: formData.notes.trim() || null
    };

    try {
      const saved = await apiClient.plannedExpenses.save(payload);
      if (editingItem) {
        setItems(prev => prev.map(item => item.id === saved.id ? saved : item));
      } else {
        setItems(prev => [saved, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Erreur lors de l\'enregistrement.');
    }
  };

  // Suppression manuelle avec confirmation
  const handleDelete = async (item: PlannedExpense) => {
    const ok = window.confirm(`Êtes-vous sûr de vouloir supprimer le projet « ${item.label} » ?`);
    if (!ok) return;

    try {
      await apiClient.plannedExpenses.delete(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err: any) {
      alert(`Erreur lors de la suppression : ${err.message}`);
    }
  };

  // Marquer comme réalisée : retire immédiatement l'élément de la liste sans créer de transaction
  const handleMarkAsRealized = async (item: PlannedExpense) => {
    const ok = window.confirm(
      `Confirmez-vous que le projet « ${item.label} » a été réalisé ?\n\n` +
      `Il sera retiré de vos projets. Aucune transaction bancaire ne sera créée automatiquement.`
    );
    if (!ok) return;

    try {
      await apiClient.plannedExpenses.delete(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err: any) {
      alert(`Erreur lors de la mise à jour : ${err.message}`);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* En-tête et Titre */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', color: 'var(--text-main)' }}>Mes projets</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Pense-bête et liste de projets d'achats ou d'investissements pour anticiper vos dépenses sans impacter votre trésorerie active.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={handleOpenCreateModal}>
          Nouveau projet
        </Button>
      </div>

      {/* Cartes d'indicateurs / KPI */}
      <div className="cards-grid">
        <Card title="Total prévisionnel" value={formatCurrency(totalEstimatedAmount)}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {items.length} projet{items.length > 1 ? 's' : ''} actif{items.length > 1 ? 's' : ''}
          </div>
        </Card>
        <Card title="Urgentes" value={String(urgentCount)}>
          <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.25rem', fontWeight: 500 }}>
            Priorité haute
          </div>
        </Card>
        <Card title="Moyennement urgentes" value={String(mediumCount)}>
          <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: '0.25rem', fontWeight: 500 }}>
            À planifier
          </div>
        </Card>
        <Card title="Pas urgentes" value={String(lowCount)}>
          <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '0.25rem', fontWeight: 500 }}>
            Souhaits & confort
          </div>
        </Card>
      </div>

      {/* Barre de filtre */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius)',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Filter size={18} color="var(--text-muted)" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Filtrer par degré d'urgence :</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `Toutes (${items.length})` },
              { id: 'urgent', label: `Urgentes (${urgentCount})` },
              { id: 'medium', label: `Moyennes (${mediumCount})` },
              { id: 'low', label: `Pas urgentes (${lowCount})` }
            ].map(btn => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setSelectedUrgencyFilter(btn.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: selectedUrgencyFilter === btn.id ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: selectedUrgencyFilter === btn.id ? 'var(--primary-color)' : 'transparent',
                  color: selectedUrgencyFilter === btn.id ? '#ffffff' : 'var(--text-main)',
                  transition: 'all 0.15s ease'
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {selectedUrgencyFilter !== 'all' && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Affichage de {filteredItems.length} sur {items.length}
          </span>
        )}
      </div>

      {/* Contenu principal */}
      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Chargement de vos projets...
        </div>
      ) : error ? (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          color: '#991b1b',
          padding: '1rem',
          borderRadius: 'var(--radius)'
        }}>
          {error}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          background: 'var(--card-bg)',
          border: '1px dashed var(--border-color)',
          borderRadius: 'var(--radius)',
          padding: '3.5rem 1.5rem',
          textAlign: 'center',
          color: 'var(--text-muted)'
        }}>
          <Clock size={40} style={{ opacity: 0.35, marginBottom: '0.75rem' }} />
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>
            {items.length === 0 ? 'Aucun projet enregistré' : 'Aucun projet correspondant à ce filtre'}
          </h3>
          <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.875rem', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
            {items.length === 0
              ? 'Ajoutez ici vos projets d\'achats, rénovations ou envies pour garder un œil sur leur montant estimé et leur degré d\'urgence.'
              : 'Modifiez votre filtre d\'urgence ci-dessus pour afficher l\'ensemble de vos projets.'}
          </p>
          {items.length === 0 && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={handleOpenCreateModal}>
              Ajouter un premier projet
            </Button>
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Urgence</th>
                <th>Intitulé</th>
                <th style={{ textAlign: 'right' }}>Montant estimé</th>
                <th>Catégorie</th>
                <th>Date souhaitée</th>
                <th>Note</th>
                <th style={{ textAlign: 'center', width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
                {filteredItems.map(item => {
                  const urgencyInfo = URGENCY_CONFIG[item.urgency] || URGENCY_CONFIG.medium;
                  const categoryName = item.categoryId ? categoryMap.get(item.categoryId) || 'Catégorie inconnue' : null;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.2rem 0.65rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: urgencyInfo.bg,
                          color: urgencyInfo.color,
                          border: `1px solid ${urgencyInfo.border}`
                        }}>
                          {urgencyInfo.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {item.label}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                        {formatCurrency(item.estimatedAmount)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {categoryName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Tag size={13} style={{ opacity: 0.6 }} /> {categoryName}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Non catégorisé</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {item.targetDate ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Calendar size={13} style={{ opacity: 0.6 }} /> {item.targetDate}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                        {item.notes ? (
                          <span title={item.notes} style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '0.825rem'
                          }}>
                            {item.notes}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleMarkAsRealized(item)}
                            title="Marquer comme réalisée (retire de la liste)"
                            style={{
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#059669',
                              padding: '0.35rem 0.55rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            <CheckCircle size={14} /> Réalisée
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            title="Modifier ce projet"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-muted)',
                              padding: '0.35rem',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Supprimer ce projet"
                            style={{
                              background: 'transparent',
                              border: '1px solid #fecaca',
                              color: '#dc2626',
                              padding: '0.35rem',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </div>
      )}

      {/* Modal d'ajout / modification */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Modifier le projet' : 'Ajouter un projet'}
      >
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {formError && (
            <div style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #ef4444',
              color: '#991b1b',
              padding: '0.65rem 0.85rem',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}>
              {formError}
            </div>
          )}

          {/* Intitulé */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
              Intitulé <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Remplacement chauffe-eau, Ordinateur portable..."
              value={formData.label}
              onChange={e => setFormData({ ...formData, label: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                fontSize: '0.9rem',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-main)'
              }}
            />
          </div>

          {/* Montant estimé & Degré d'urgence */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
                Montant estimé (€) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="Ex: 450.00"
                value={formData.estimatedAmount}
                onChange={e => setFormData({ ...formData, estimatedAmount: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-main)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
                Degré d'urgence <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={formData.urgency}
                onChange={e => setFormData({ ...formData, urgency: e.target.value as PlannedUrgency })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-main)'
                }}
              >
                <option value="urgent">Urgent</option>
                <option value="medium">Moyennement urgent</option>
                <option value="low">Pas urgent</option>
              </select>
            </div>
          </div>

          {/* Catégorie & Date souhaitée */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
                Catégorie (optionnelle)
              </label>
              <select
                value={formData.categoryId}
                onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-main)'
                }}
              >
                <option value="">-- Aucune catégorie --</option>
                {availableCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
                Date souhaitée (optionnelle)
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={e => setFormData({ ...formData, targetDate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-main)'
                }}
              />
            </div>
          </div>

          {/* Note complémentaire */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
              Note complémentaire (optionnelle)
            </label>
            <textarea
              rows={3}
              placeholder="Précisions sur la référence, devis envisagé, magasin, conditions..."
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
                fontSize: '0.9rem',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-main)',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit">
              {editingItem ? 'Enregistrer les modifications' : 'Ajouter le projet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
