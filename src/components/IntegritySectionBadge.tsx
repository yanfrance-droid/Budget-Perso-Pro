import React from 'react';
import { useServerDataOptional } from '../contexts/ServerDataContext';
import { computeContractIntegrity } from '../engine/contractIntegrityEngine';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface IntegritySectionBadgeProps {
  type: 'fixed_expense' | 'variable_expense' | 'income';
  month: string;
  onClick?: () => void;
}

export const IntegritySectionBadge: React.FC<IntegritySectionBadgeProps> = ({ type, month, onClick }) => {
  const serverData = useServerDataOptional();

  const recurrenceTemplates = serverData?.recurrenceTemplates || [];
  const transactions = serverData?.transactions || [];
  const acceptedExceptions = serverData?.acceptedExceptions || {};

  // Tous les Hooks sont impérativement appelés en tête de composant avant tout return
  const report = React.useMemo(() => {
    return computeContractIntegrity(
      recurrenceTemplates,
      transactions,
      month,
      acceptedExceptions
    );
  }, [recurrenceTemplates, transactions, month, acceptedExceptions]);

  if (!serverData) return null;

  const section = type === 'fixed_expense'
    ? report.sections.fixedExpenses
    : type === 'variable_expense'
    ? report.sections.variableExpenses
    : report.sections.incomes;

  if (section.totalExpected === 0) {
    return null;
  }

  const isCompliant = section.isFullyCompliant;
  const hasAccepted = section.acceptedCount > 0;
  const hasDuplicates = section.duplicateCount > 0;
  const displayCount = hasDuplicates ? (section.totalFound + section.duplicateCount) : section.totalFound;

  const duplicateDetails = section.duplicateItems.length > 0
    ? ` [Doublons : ${section.duplicateItems.map(d => `${d.label} (${d.amount.toFixed(2)} €)`).join(', ')}]`
    : '';

  return (
    <div
      onClick={onClick}
      role="status"
      title={
        isCompliant
          ? `${section.title} : 100 % conforme (${section.totalFound}/${section.totalExpected} instanciées${hasAccepted ? `, ${section.acceptedCount} écart(s) accepté(s)` : ''})`
          : section.missingCount > 0
          ? `${section.title} : ${section.missingCount} contrat(s) manquant(s) sur ce mois (${section.missingAmount.toFixed(2)} €)`
          : `${section.title} : ${section.duplicateCount} doublon(s)${duplicateDetails} (${displayCount} lignes pour ${section.totalExpected} contrats attendus)`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.25rem 0.65rem',
        borderRadius: '9999px',
        fontSize: '0.78rem',
        fontWeight: 600,
        backgroundColor: isCompliant 
          ? (hasAccepted ? '#ecfdf5' : '#f0fdf4') 
          : '#fef2f2',
        color: isCompliant 
          ? (hasAccepted ? '#065f46' : '#15803d') 
          : '#b91c1c',
        border: `1px solid ${isCompliant ? (hasAccepted ? '#a7f3d0' : '#bbf7d0') : '#fecaca'}`,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'all 0.15s ease'
      }}
    >
      {isCompliant ? (
        <CheckCircle2 size={13} color={hasAccepted ? '#059669' : '#16a34a'} />
      ) : (
        <AlertTriangle size={13} color="#dc2626" />
      )}
      <span>
        {section.title} : {displayCount}/{section.totalExpected}
        {!isCompliant && (
          section.missingCount > 0
            ? ` (${section.missingCount} manquante${section.missingCount > 1 ? 's' : ''})`
            : ` (${section.duplicateCount} doublon${section.duplicateCount > 1 ? 's' : ''})`
        )}
        {isCompliant && hasAccepted && ` (${section.acceptedCount} accepté)`}
      </span>
    </div>
  );
};
