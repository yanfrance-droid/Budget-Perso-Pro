// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { StatusBadgeSelect } from './StatusBadgeSelect';

afterEach(() => {
  cleanup();
});

describe('StatusBadgeSelect', () => {
  const options = [
    { value: 'cleared', label: 'Débité' },
    { value: 'pending', label: 'En attente' },
    { value: 'planned', label: 'Prévu' },
    { value: 'disabled', label: 'Désactivé' }
  ];

  it('affiche le libellé et la classe de statut initial', () => {
    render(<StatusBadgeSelect status="pending" options={options} onChange={() => {}} />);
    const badge = screen.getByRole('button', { name: /en attente/i });
    expect(badge).toBeDefined();
    expect(badge.className).toContain('badge-pending');
  });

  it('ouvre le menu déroulant au clic et liste toutes les options', () => {
    render(<StatusBadgeSelect status="pending" options={options} onChange={() => {}} />);
    const badge = screen.getByRole('button', { name: /en attente/i });
    fireEvent.click(badge);

    expect(screen.getByRole('button', { name: /débité/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /prévu/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /désactivé/i })).toBeDefined();
  });

  it('appelle onChange avec la nouvelle valeur sélectionnée et ferme le menu', () => {
    const handleChange = vi.fn();
    render(<StatusBadgeSelect status="pending" options={options} onChange={handleChange} />);
    const badge = screen.getByRole('button', { name: /en attente/i });
    fireEvent.click(badge);

    const debiteBtn = screen.getByRole('button', { name: /débité/i });
    fireEvent.click(debiteBtn);

    expect(handleChange).toHaveBeenCalledWith('cleared');
  });

  it('ne déclenche pas onChange si on sélectionne le même statut', () => {
    const handleChange = vi.fn();
    render(<StatusBadgeSelect status="pending" options={options} onChange={handleChange} />);
    const badge = screen.getByRole('button', { name: /en attente/i });
    fireEvent.click(badge);

    const pendingOption = screen.getAllByRole('button', { name: /en attente/i })[1];
    fireEvent.click(pendingOption);

    expect(handleChange).not.toHaveBeenCalled();
  });
});
