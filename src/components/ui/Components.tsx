import React from 'react';

export function Card({ title, value, children }: { title: string, value?: string, children?: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {value !== undefined && <div className="kpi-value">{value}</div>}
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', icon, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'outline' | 'icon',
  icon?: React.ReactNode
}) {
  return (
    <button type={props.type || 'button'} className={`btn btn-${variant} ${className || ''}`} {...props}>
      {icon} {children}
    </button>
  );
}

export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { StatusBadgeSelect, type StatusOption, type StatusBadgeSelectProps } from './StatusBadgeSelect';
export { AccountSelect, type AccountSelectProps } from './AccountSelect';
export { IncomePayerSelect, type IncomePayerSelectProps } from './IncomePayerSelect';
