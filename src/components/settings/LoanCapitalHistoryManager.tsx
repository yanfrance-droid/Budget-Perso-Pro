import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Modal } from '../ui/Components';
import { 
  TrendingDown, Plus, Edit2, Trash2, Download, Upload, 
  AlertTriangle, CheckCircle, RefreshCw, AlertCircle, FileText, Info
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { parseLoanCapitalCsv, type CsvParseResult } from '../../services/loanCapitalCsvParser';

export interface LoanCapitalRecord {
  month: string;
  realEstateCapital: number | null;
  realEstateMonthlyPayment: number | null;
  consumerCapital: number | null;
  consumerMonthlyPayment: number | null;
  notes?: string | null;
}

export function formatMonthDisplay(ym: string): string {
  if (!ym || !ym.includes('-')) return ym;
  const [year, month] = ym.split('-');
  return `${month}/${year}`;
}

export function formatEuro(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '-';
  }
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function LoanCapitalHistoryManager() {
  const [records, setRecords] = useState<LoanCapitalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modale d'édition / création d'un mois
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LoanCapitalRecord | null>(null);
  const [formMonth, setFormMonth] = useState('');
  const [formRealEstateCapital, setFormRealEstateCapital] = useState('');
  const [formRealEstatePayment, setFormRealEstatePayment] = useState('');
  const [formConsumerCapital, setFormConsumerCapital] = useState('');
  const [formConsumerPayment, setFormConsumerPayment] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modale de confirmation de suppression d'un mois
  const [recordToDelete, setRecordToDelete] = useState<LoanCapitalRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);

  // Modale d'effacement complet
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);

  // Import de fichier
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<any>(null);
  const [importFileType, setImportFileType] = useState<'csv' | 'json' | null>(null);
  const [importParseErrors, setImportParseErrors] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [isImporting, setIsImporting] = useState(false);

  // Chargement des enregistrements depuis le serveur SQLite
  const fetchRecords = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiClient.loans.history.getAll();
      setRecords(data || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible de charger l\'historique des capitaux.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const triggerSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // -------------------------------------------------------------------------
  // Handlers Création / Édition
  // -------------------------------------------------------------------------
  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setFormMonth('');
    setFormRealEstateCapital('');
    setFormRealEstatePayment('');
    setFormConsumerCapital('');
    setFormConsumerPayment('');
    setFormNotes('');
    setErrorMessage(null);
    setIsEditModalOpen(true);
  };

  const handleOpenEditModal = (rec: LoanCapitalRecord) => {
    setEditingRecord(rec);
    setFormMonth(rec.month);
    setFormRealEstateCapital(rec.realEstateCapital !== null && rec.realEstateCapital !== undefined ? String(rec.realEstateCapital) : '');
    setFormRealEstatePayment(rec.realEstateMonthlyPayment !== null && rec.realEstateMonthlyPayment !== undefined ? String(rec.realEstateMonthlyPayment) : '');
    setFormConsumerCapital(rec.consumerCapital !== null && rec.consumerCapital !== undefined ? String(rec.consumerCapital) : '');
    setFormConsumerPayment(rec.consumerMonthlyPayment !== null && rec.consumerMonthlyPayment !== undefined ? String(rec.consumerMonthlyPayment) : '');
    setFormNotes(rec.notes || '');
    setErrorMessage(null);
    setIsEditModalOpen(true);
  };

  const parseNumberOrNull = (val: string): number | null => {
    const trimmed = val.trim().replace(',', '.');
    if (!trimmed) return null;
    const num = parseFloat(trimmed);
    if (isNaN(num) || num < 0) {
      throw new Error(`Le montant "${val}" doit être un nombre positif ou nul.`);
    }
    return Math.round(num * 100) / 100;
  };

  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const monthTrimmed = formMonth.trim();
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthTrimmed)) {
      setErrorMessage('Le mois doit être au format AAAA-MM (ex: 2024-05).');
      return;
    }

    let realEstateCap: number | null = null;
    let realEstatePay: number | null = null;
    let consumerCap: number | null = null;
    let consumerPay: number | null = null;

    try {
      realEstateCap = parseNumberOrNull(formRealEstateCapital);
      realEstatePay = parseNumberOrNull(formRealEstatePayment);
      consumerCap = parseNumberOrNull(formConsumerCapital);
      consumerPay = parseNumberOrNull(formConsumerPayment);
    } catch (parseErr: any) {
      setErrorMessage(parseErr.message);
      return;
    }

    setIsSaving(true);
    try {
      const payload: LoanCapitalRecord = {
        month: monthTrimmed,
        realEstateCapital: realEstateCap,
        realEstateMonthlyPayment: realEstatePay,
        consumerCapital: consumerCap,
        consumerMonthlyPayment: consumerPay,
        notes: formNotes.trim() || null
      };

      if (editingRecord) {
        await apiClient.loans.history.updateMonth(monthTrimmed, payload);
        triggerSuccess(`Relevé du mois ${formatMonthDisplay(monthTrimmed)} mis à jour avec succès.`);
      } else {
        await apiClient.loans.history.saveRecord(payload);
        triggerSuccess(`Relevé du mois ${formatMonthDisplay(monthTrimmed)} enregistré avec succès.`);
      }

      setIsEditModalOpen(false);
      await fetchRecords();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de l\'enregistrement du relevé.');
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers Suppression d'un mois
  // -------------------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    setIsDeletingRecord(true);
    try {
      await apiClient.loans.history.deleteMonth(recordToDelete.month);
      triggerSuccess(`Le relevé du mois ${formatMonthDisplay(recordToDelete.month)} a été supprimé.`);
      setRecordToDelete(null);
      await fetchRecords();
    } catch (err: any) {
      setErrorMessage(err.message || 'Impossible de supprimer ce relevé.');
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers Effacement complet (Vider tout l'historique)
  // -------------------------------------------------------------------------
  const handleClearAll = async () => {
    if (clearConfirmText.trim().toUpperCase() !== 'EFFACER') {
      alert('Veuillez taper le mot "EFFACER" pour confirmer cette action irréversible.');
      return;
    }

    setIsClearing(true);
    try {
      const res = await apiClient.loans.history.clearAll();
      triggerSuccess(`L'intégralité de l'historique a été effacée (${res.deletedCount} mois supprimés).`);
      setIsClearModalOpen(false);
      setClearConfirmText('');
      await fetchRecords();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de l\'effacement de l\'historique.');
    } finally {
      setIsClearing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers Export autonome
  // -------------------------------------------------------------------------
  const handleExport = async () => {
    try {
      const payload = await apiClient.loans.history.export();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `budget-pro-historique-prets_${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerSuccess('Export de l\'historique téléchargé avec succès.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de l\'export de l\'historique.');
    }
  };

  const handleDownloadCsvTemplate = () => {
    // Modèle CSV UTF-8 avec BOM (\uFEFF) pour une ouverture parfaite et sans altération d'accents dans Excel et LibreOffice
    const bom = '\uFEFF';
    const csvContent = 
      'Mois;Capital Prêt Immo;Mensualité Immo;Capital Crédits Conso;Mensualité Conso;Remarques\r\n' +
      '2024-01;120000,00;550,00;15000,00;250,00;Exemple début d\'année\r\n' +
      '2024-02;119600,00;550,00;14780,00;250,00;Deuxième mensualité';

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_historique_credits.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerSuccess('Modèle CSV téléchargé avec succès.');
  };

  // -------------------------------------------------------------------------
  // Handlers Import autonome (JSON et CSV Excel / LibreOffice)
  // -------------------------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setImportParseErrors([]);

        if (isCsv) {
          // Analyse CSV sécurisée avec détection automatique ; ou , et virgules décimales
          const parseResult = parseLoanCapitalCsv(text);
          if (parseResult.errors.length > 0) {
            setImportParseErrors(parseResult.errors);
            setImportPayload(null);
            setImportFileType('csv');
            setIsImportModalOpen(true);
            return;
          }

          if (parseResult.records.length === 0) {
            throw new Error('Aucun relevé mensuel valide trouvé dans ce fichier CSV.');
          }

          const firstM = parseResult.records[0].month;
          const lastM = parseResult.records[parseResult.records.length - 1].month;

          setImportPayload({
            format: 'PersonalBudgetPro_LoanCapitalHistory',
            version: 1,
            currency: 'EUR',
            metadata: {
              source: `Import CSV (${parseResult.delimiter === ';' ? 'point-virgule' : 'virgule'})`,
              recordsCount: parseResult.records.length,
              startMonth: firstM,
              endMonth: lastM
            },
            records: parseResult.records
          });
          setImportFileType('csv');
          setImportMode('replace');
          setIsImportModalOpen(true);
        } else {
          // Analyse JSON
          const parsed = JSON.parse(text);

          if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
            throw new Error('Le fichier sélectionné ne contient pas un objet JSON valide.');
          }

          const recordsList = Array.isArray(parsed.records) ? parsed.records : (Array.isArray(parsed) ? parsed : null);
          if (!recordsList || recordsList.length === 0) {
            throw new Error('Aucun relevé d\'historique trouvé dans ce fichier JSON.');
          }

          setImportPayload(parsed);
          setImportFileType('json');
          setImportMode('replace');
          setIsImportModalOpen(true);
        }
      } catch (err: any) {
        alert(`Fichier d'import invalide : ${err.message}`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!importPayload) return;

    // Protection stricte : si un historique existe déjà et que l'utilisateur a choisi le remplacement
    if (importMode === 'replace' && records.length > 0) {
      const confirmed = window.confirm(
        `ATTENTION : Vous êtes sur le point de remplacer l'intégralité de l'historique existant (${records.length} relevé(s) en base) par les données du fichier.\n\nToutes les valeurs actuelles seront définitivement effacées et remplacées.\n\nConfirmez-vous ce remplacement ?`
      );
      if (!confirmed) {
        return; // Annulation stricte : aucun appel API
      }
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const result = await apiClient.loans.history.import(importPayload, importMode);
      triggerSuccess(`Import réussi ! ${result.importedCount} mois ont été ${importMode === 'replace' ? 'installés en remplacement' : 'fusionnés'}.`);
      setIsImportModalOpen(false);
      setImportPayload(null);
      await fetchRecords();
    } catch (err: any) {
      setErrorMessage(err.message || 'Échec de l\'importation de l\'historique.');
    } finally {
      setIsImporting(false);
    }
  };

  // Calculs récapitulatifs pour l'entête
  const totalMonthsCount = records.length;
  const firstMonth = totalMonthsCount > 0 ? formatMonthDisplay(records[0].month) : '-';
  const lastMonth = totalMonthsCount > 0 ? formatMonthDisplay(records[records.length - 1].month) : '-';

  return (
    <div>
      {/* Messages d'alerte ou de succès */}
      {successMessage && (
        <div style={{
          backgroundColor: '#dcfce7',
          color: '#166534',
          border: '1px solid #86efac',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          <CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Cartes d'indicateurs de l'historique */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Card title="Mois enregistrés" value={String(totalMonthsCount)} />
        <Card title="Premier relevé" value={firstMonth} />
        <Card title="Dernier relevé" value={lastMonth} />
      </div>

      {/* Guide pédagogique pas-à-pas pour l'import CSV / Excel */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: '10px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color, #f1f5f9)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} color="#2563eb" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
              Guide pas-à-pas : Importer vos relevés depuis Excel ou LibreOffice Calc
            </h3>
          </div>
          <Button 
            variant="outline"
            onClick={handleDownloadCsvTemplate}
            icon={<Download size={15} color="#2563eb" />}
            style={{ fontSize: '0.825rem', padding: '0.4rem 0.75rem', borderColor: '#bfdbfe', color: '#1d4ed8', backgroundColor: '#eff6ff' }}
          >
            Télécharger le modèle CSV
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', color: '#2563eb', marginBottom: '0.35rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.8rem' }}>1</span>
              <span>Téléchargez le modèle</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.45 }}>
              Cliquez sur le bouton <strong>« Télécharger le modèle CSV »</strong> pour obtenir un fichier pré-configuré (encodé en UTF-8 avec séparateur point-virgule <code>;</code>).
            </p>
          </div>

          <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', color: '#2563eb', marginBottom: '0.35rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.8rem' }}>2</span>
              <span>Remplissez vos montants</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.45 }}>
              Ouvrez le fichier dans <strong>Excel</strong> ou <strong>LibreOffice Calc</strong>. Indiquez vos mois (<code>AAAA-MM</code> ou <code>MM/AAAA</code>) et vos capitaux restants dus (avec virgule ou point).
            </p>
          </div>

          <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary, #f8fafc)', borderRadius: '8px', border: '1px solid var(--border-color, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem', color: '#2563eb', marginBottom: '0.35rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.8rem' }}>3</span>
              <span>Importez en 1 clic</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.45 }}>
              Cliquez sur <strong>« Importer un historique »</strong> ci-dessous et sélectionnez votre fichier enregistré. Vos courbes d'amortissement apparaîtront instantanément au Dashboard !
            </p>
          </div>
        </div>
      </div>

      {/* Conteneur principal du tableau */}
      <div className="table-container">
        <div style={{
          padding: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Historique des capitaux des prêts</h2>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #666)', fontSize: '0.85rem' }}>
              Relevés réels constatés mois par mois pour alimenter les courbes de capitaux restants dus.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button 
              variant="outline"
              onClick={handleDownloadCsvTemplate}
              icon={<Download size={16} />}
              title="Télécharger un modèle CSV prêt à remplir"
            >
              Modèle CSV
            </Button>
            <Button 
              onClick={handleOpenAddModal} 
              icon={<Plus size={16} />}
            >
              Ajouter un mois
            </Button>
            <Button 
              variant="outline" 
              onClick={handleExport} 
              icon={<Download size={16} />}
              disabled={totalMonthsCount === 0}
            >
              Exporter l'historique
            </Button>
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()} 
              icon={<Upload size={16} />}
            >
              Importer un historique
            </Button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".csv,.json,text/csv,application/json,text/plain" 
              onChange={handleFileChange} 
            />
            {totalMonthsCount > 0 && (
              <Button 
                variant="outline" 
                onClick={() => { setClearConfirmText(''); setIsClearModalOpen(true); }} 
                icon={<Trash2 size={16} color="var(--danger-color)" />}
                style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
              >
                Tout effacer
              </Button>
            )}
            <Button 
              variant="icon" 
              onClick={fetchRecords} 
              title="Rafraîchir"
              style={{ padding: '0.5rem' }}
            >
              <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Tableau des relevés mensuels */}
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #666)' }}>
            Chargement de l'historique...
          </div>
        ) : records.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary, #666)' }}>
            <TrendingDown size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, margin: '0 0 0.5rem' }}>
              Aucun historique de capitaux enregistré
            </p>
            <p style={{ fontSize: '0.85rem', margin: '0 0 1.5rem', maxWidth: '500px', marginInline: 'auto' }}>
              Vous pouvez ajouter manuellement des relevés mensuels ou importer un fichier CSV (export LibreOffice Calc / Excel avec séparateur point-virgule) ou JSON dédié.
            </p>
            <Button onClick={handleOpenAddModal} icon={<Plus size={16} />}>
              Ajouter votre premier relevé mensuel
            </Button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg, #fff)', zIndex: 1 }}>
                <tr>
                  <th style={{ width: '110px' }}>Mois</th>
                  <th style={{ textAlign: 'right' }}>Capital Prêt Immo</th>
                  <th style={{ textAlign: 'right' }}>Mensualité Immo</th>
                  <th style={{ textAlign: 'right' }}>Capital Crédits Conso</th>
                  <th style={{ textAlign: 'right' }}>Mensualité Conso</th>
                  <th>Notes</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map(rec => (
                  <tr key={rec.month}>
                    <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMonthDisplay(rec.month)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatEuro(rec.realEstateCapital)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatEuro(rec.realEstateMonthlyPayment)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatEuro(rec.consumerCapital)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatEuro(rec.consumerMonthlyPayment)}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #666)' }}>
                      {rec.notes || '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                        <Button 
                          variant="icon" 
                          onClick={() => handleOpenEditModal(rec)} 
                          title="Modifier ce relevé"
                          style={{ padding: '0.3rem' }}
                        >
                          <Edit2 size={15} />
                        </Button>
                        <Button 
                          variant="icon" 
                          onClick={() => setRecordToDelete(rec)} 
                          title="Supprimer ce relevé"
                          style={{ padding: '0.3rem', color: 'var(--danger-color)' }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODALE 1 : AJOUT / MODIFICATION D'UN RELEVÉ MENSUEL                  */}
      {/* ===================================================================== */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => !isSaving && setIsEditModalOpen(false)}
        title={editingRecord ? `Modifier le relevé du mois ${formatMonthDisplay(editingRecord.month)}` : 'Ajouter un relevé mensuel'}
      >
        <form onSubmit={handleSaveRecord}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Mois (AAAA-MM) *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ex: 2024-05" 
              value={formMonth}
              onChange={e => setFormMonth(e.target.value)}
              disabled={Boolean(editingRecord) || isSaving}
              required
            />
            <small style={{ color: 'var(--text-secondary, #666)', fontSize: '0.75rem' }}>
              Format attendu : 4 chiffres pour l'année, tiret, puis 2 chiffres pour le mois (ex: 2024-05).
            </small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Capital restant Prêt immobilier (€)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ex: 185000 (ou laisser vide)" 
                value={formRealEstateCapital}
                onChange={e => setFormRealEstateCapital(e.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mensualité Prêt immobilier (€)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ex: 950 (ou laisser vide)" 
                value={formRealEstatePayment}
                onChange={e => setFormRealEstatePayment(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Capital restant Crédits consommation (€)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ex: 15000 (ou laisser vide)" 
                value={formConsumerCapital}
                onChange={e => setFormConsumerCapital(e.target.value)}
                disabled={isSaving}
              />
              <small style={{ color: 'var(--text-secondary, #666)', fontSize: '0.75rem' }}>
                Laissez vide si vous n'aviez pas de crédit consommation pour ce mois.
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Mensualité Crédits consommation (€)</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Ex: 350 (ou laisser vide)" 
                value={formConsumerPayment}
                onChange={e => setFormConsumerPayment(e.target.value)}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Notes ou commentaire (optionnel)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ex: Déblocage initial, remboursement anticipé..." 
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {errorMessage && (
            <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSaving}
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={isSaving}
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ===================================================================== */}
      {/* MODALE 2 : CONFIRMATION DE SUPPRESSION D'UN MOIS                      */}
      {/* ===================================================================== */}
      <Modal 
        isOpen={Boolean(recordToDelete)} 
        onClose={() => !isDeletingRecord && setRecordToDelete(null)}
        title="Supprimer un relevé mensuel"
      >
        <div>
          <p style={{ margin: '0 0 1rem' }}>
            Êtes-vous sûr de vouloir supprimer définitivement le relevé du mois de <strong>{recordToDelete ? formatMonthDisplay(recordToDelete.month) : ''}</strong> ?
          </p>
          <p style={{ color: 'var(--text-secondary, #666)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
            Cette action retirera ce point du graphique.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button 
              variant="outline" 
              onClick={() => setRecordToDelete(null)}
              disabled={isDeletingRecord}
            >
              Annuler
            </Button>
            <Button 
              onClick={handleConfirmDelete}
              disabled={isDeletingRecord}
              style={{ backgroundColor: 'var(--danger-color)', borderColor: 'var(--danger-color)', color: '#fff' }}
            >
              {isDeletingRecord ? 'Suppression...' : 'Supprimer définitivement'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODALE 3 : EFFACEMENT COMPLET (VIDER TOUT L'HISTORIQUE)                */}
      {/* ===================================================================== */}
      <Modal 
        isOpen={isClearModalOpen} 
        onClose={() => !isClearing && setIsClearModalOpen(false)}
        title="Effacer l'intégralité de l'historique des capitaux"
      >
        <div>
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.85rem' }}>
              <strong>Attention : cette action est irréversible !</strong><br />
              Tous les enregistrements d'historique de capitaux ({records.length} mois) seront définitivement supprimés de la base de données.
              Vos comptes bancaires, transactions et fiches de prêts resteront quant à eux inchangés.
            </div>
          </div>

          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            Pour confirmer, veuillez saisir le mot <strong>EFFACER</strong> ci-dessous :
          </p>

          <input 
            type="text" 
            className="form-control" 
            placeholder="Tapez EFFACER" 
            value={clearConfirmText}
            onChange={e => setClearConfirmText(e.target.value)}
            disabled={isClearing}
            style={{ marginBottom: '1.5rem' }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button 
              variant="outline" 
              onClick={() => setIsClearModalOpen(false)}
              disabled={isClearing}
            >
              Annuler
            </Button>
            <Button 
              onClick={handleClearAll}
              disabled={clearConfirmText.trim().toUpperCase() !== 'EFFACER' || isClearing}
              style={{ backgroundColor: 'var(--danger-color)', borderColor: 'var(--danger-color)', color: '#fff' }}
            >
              {isClearing ? 'Effacement...' : 'Confirmer la suppression totale'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ===================================================================== */}
      {/* MODALE 4 : IMPORT AVEC PRÉVISUALISATION ET MODE DE REMPLACEMENT        */}
      {/* ===================================================================== */}
      <Modal 
        isOpen={isImportModalOpen} 
        onClose={() => !isImporting && setIsImportModalOpen(false)}
        title="Importer un fichier d'historique des capitaux"
      >
        <div>
          {/* Guide d'aide sur les formats et colonnes attendues */}
          <div style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            color: '#1e40af',
            lineHeight: 1.45
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              <Info size={16} />
              <span>Formats acceptés : CSV (LibreOffice Calc, Excel) et JSON</span>
            </div>
            <div>• <strong>Séparateurs CSV reconnus :</strong> point-virgule (<code>;</code>) ou virgule (<code>,</code>).</div>
            <div>• <strong>Format des mois :</strong> <code>AAAA-MM</code> (ex: <code>2024-01</code>) ou <code>MM/AAAA</code> (ex: <code>01/2024</code>).</div>
            <div>• <strong>Montants :</strong> décimales françaises acceptées avec virgule (ex: <code>120 500,50</code>) ou point.</div>
            <div>• <strong>Colonnes reconnues :</strong> <code>Mois</code> (obligatoire), <code>Capital Prêt Immo</code>, <code>Mensualité Immo</code>, <code>Capital Crédits Conso</code>, <code>Mensualité Conso</code>, <code>Remarques</code>.</div>
          </div>

          {/* Affichage des erreurs bloquantes de parsing */}
          {importParseErrors.length > 0 && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.825rem',
              color: '#991b1b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                <AlertTriangle size={16} />
                <span>Le fichier contient des erreurs bloquantes (aucun import réalisé) :</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', maxHeight: '180px', overflowY: 'auto' }}>
                {importParseErrors.map((err, idx) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{err}</li>
                ))}
              </ul>
              <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>Fermer</Button>
              </div>
            </div>
          )}

          {importPayload && (
            <div>
              <p style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
                Fichier <strong>{importFileType?.toUpperCase()}</strong> contenant <strong>{Array.isArray(importPayload.records) ? importPayload.records.length : (Array.isArray(importPayload) ? importPayload.length : 0)} relevé(s) mensuel(s)</strong> validé(s) avec succès.
              </p>

              <div style={{
                backgroundColor: 'var(--bg-secondary, #f8fafc)',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                marginBottom: '1.25rem',
                fontSize: '0.85rem'
              }}>
                <div><strong>Format :</strong> {importPayload.metadata?.source || importPayload.format || 'Fichier JSON standard'}</div>
                {importPayload.metadata && (
                  <div>
                    <strong>Période couverte :</strong> {importPayload.metadata.startMonth ? formatMonthDisplay(importPayload.metadata.startMonth) : '-'} au {importPayload.metadata.endMonth ? formatMonthDisplay(importPayload.metadata.endMonth) : '-'}
                  </div>
                )}
                <div><strong>Historique existant actuel :</strong> {records.length} relevé(s) en base</div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                  Mode d'importation souhaité :
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      name="importMode" 
                      value="replace" 
                      checked={importMode === 'replace'} 
                      onChange={() => setImportMode('replace')}
                      disabled={isImporting}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong>Remplacer l'historique complet (recommandé)</strong>
                      <div style={{ color: 'var(--text-secondary, #666)' }}>
                        Efface les relevés existants pour installer exactement ceux du fichier.
                      </div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input 
                      type="radio" 
                      name="importMode" 
                      value="merge" 
                      checked={importMode === 'merge'} 
                      onChange={() => setImportMode('merge')}
                      disabled={isImporting}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <strong>Fusionner avec l'existant</strong>
                      <div style={{ color: 'var(--text-secondary, #666)' }}>
                        Ajoute les mois manquants et met à jour les mois existants sans supprimer les autres.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {errorMessage && (
                <div style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button 
                  variant="outline" 
                  onClick={() => setIsImportModalOpen(false)}
                  disabled={isImporting}
                >
                  Annuler
                </Button>
                <Button 
                  onClick={handleExecuteImport}
                  disabled={isImporting}
                  style={importMode === 'replace' && records.length > 0 ? { backgroundColor: '#ea580c', borderColor: '#ea580c', color: '#fff' } : undefined}
                >
                  {isImporting ? 'Importation...' : (importMode === 'replace' && records.length > 0 ? 'Confirmer le remplacement' : 'Confirmer et importer')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
