import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface StatusOption {
  value: string;
  label: string;
}

export interface StatusBadgeSelectProps {
  status: string;
  options: StatusOption[];
  onChange: (newStatus: string) => void | Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export function StatusBadgeSelect({
  status,
  options,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  style
}: StatusBadgeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find(o => o.value === status);
  const label = currentOption ? currentOption.label : status;

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuEstimatedHeight = options.length * 36 + 16;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;
    
    const top = openUpwards ? (rect.top - menuEstimatedHeight) : (rect.bottom + 4);
    // Assurer que le menu ne dépasse pas à droite ou à gauche de la fenêtre
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - 170));

    setMenuPos({ top, left });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const handleSelect = async (newValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (newValue !== status) {
      try {
        await onChange(newValue);
      } catch (err) {
        console.error('Erreur lors du changement de statut:', err);
      }
    }
  };

  const iconSize = size === 'sm' ? 10 : 12;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`badge badge-${status} badge-clickable status-badge-trigger ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: size === 'sm' ? '0.12rem 0.4rem' : '0.2rem 0.55rem',
          fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
          fontWeight: 600,
          outline: 'none',
          opacity: status === 'disabled' ? 0.65 : 1,
          ...style
        }}
        title="Cliquer pour changer le statut"
      >
        <span>{label}</span>
        <ChevronDown size={iconSize} style={{ opacity: 0.75 }} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="status-badge-dropdown"
          style={{
            position: 'fixed',
            top: `${menuPos.top}px`,
            left: `${menuPos.left}px`,
            zIndex: 99999,
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.08)',
            padding: '4px',
            minWidth: '150px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
          onClick={e => e.stopPropagation()}
        >
          {options.map(opt => {
            const isSelected = opt.value === status;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={e => handleSelect(opt.value, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isSelected ? '#f8fafc' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background-color 0.12s ease'
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = isSelected ? '#f1f5f9' : '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = isSelected ? '#f8fafc' : 'transparent')}
              >
                <span className={`badge badge-${opt.value}`} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                  {opt.label}
                </span>
                {isSelected && <Check size={14} color="#0284c7" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
