import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useServerData } from '../../contexts/ServerDataContext';

interface UndoRedoControlsProps {
  compact?: boolean;
}

export const UndoRedoControls: React.FC<UndoRedoControlsProps> = ({ compact = false }) => {
  const { undo, redo, canUndo, canRedo, undoStack, redoStack } = useServerData();

  const nextUndoAction = undoStack?.[0];
  const nextRedoAction = redoStack?.[0];

  const undoTitle = canUndo
    ? `Annuler : ${nextUndoAction?.label || 'Dernière action'} (Ctrl+Z)`
    : 'Aucune action à annuler (Ctrl+Z)';

  const redoTitle = canRedo
    ? `Rétablir : ${nextRedoAction?.label || 'Action suivante'} (Ctrl+Y)`
    : 'Aucune action à rétablir (Ctrl+Y)';

  const handleUndo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    undo();
  };

  const handleRedo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    redo();
  };

  return (
    <div 
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', position: 'relative', zIndex: 50 }} 
      role="toolbar" 
      aria-label="Historique des actions (Annuler / Rétablir)"
    >
      <button
        type="button"
        onClick={handleUndo}
        disabled={!canUndo}
        title={undoTitle}
        aria-label={undoTitle}
        className="undo-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? '0.2rem' : '0.4rem',
          padding: compact ? '0.3rem 0.5rem' : '0.4rem 0.75rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          borderRadius: '6px',
          border: '1px solid var(--border-color, #cbd5e1)',
          backgroundColor: canUndo ? 'var(--card-bg, #ffffff)' : 'transparent',
          color: canUndo ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #94a3b8)',
          boxShadow: canUndo ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
          cursor: canUndo ? 'pointer' : 'not-allowed',
          opacity: canUndo ? 1 : 0.45,
          transition: 'all 0.15s ease',
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        <Undo2 size={16} style={{ pointerEvents: 'none' }} />
        {!compact && <span style={{ pointerEvents: 'none' }}>Annuler</span>}
        {undoStack.length > 0 && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '9999px',
              padding: '0.1rem 0.4rem',
              lineHeight: 1,
              pointerEvents: 'none'
            }}
          >
            {undoStack.length}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={handleRedo}
        disabled={!canRedo}
        title={redoTitle}
        aria-label={redoTitle}
        className="redo-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: compact ? '0.2rem' : '0.4rem',
          padding: compact ? '0.3rem 0.5rem' : '0.4rem 0.75rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          borderRadius: '6px',
          border: '1px solid var(--border-color, #cbd5e1)',
          backgroundColor: canRedo ? 'var(--card-bg, #ffffff)' : 'transparent',
          color: canRedo ? 'var(--text-main, #0f172a)' : 'var(--text-muted, #94a3b8)',
          boxShadow: canRedo ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
          cursor: canRedo ? 'pointer' : 'not-allowed',
          opacity: canRedo ? 1 : 0.45,
          transition: 'all 0.15s ease',
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        <Redo2 size={16} style={{ pointerEvents: 'none' }} />
        {!compact && <span style={{ pointerEvents: 'none' }}>Rétablir</span>}
        {redoStack.length > 0 && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '9999px',
              padding: '0.1rem 0.4rem',
              lineHeight: 1,
              pointerEvents: 'none'
            }}
          >
            {redoStack.length}
          </span>
        )}
      </button>
    </div>
  );
};

export default UndoRedoControls;
