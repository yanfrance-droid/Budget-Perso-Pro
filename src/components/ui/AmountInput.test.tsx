// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import { AmountInput } from './AmountInput';

afterEach(() => {
  cleanup();
});

describe('AmountInput Component', () => {
  it('accepte la saisie directe du point décimal du pavé numérique', () => {
    const handleValueChange = vi.fn();
    render(<AmountInput placeholder="Montant" onValueChange={handleValueChange} />);
    const input = screen.getByPlaceholderText('Montant') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '123.45' } });
    expect(input.value).toBe('123.45');
    expect(handleValueChange).toHaveBeenCalledWith(123.45, '123.45');
  });

  it('normalise automatiquement la virgule (,) en point (.) à la volée', () => {
    const handleValueChange = vi.fn();
    render(<AmountInput placeholder="Montant" onValueChange={handleValueChange} />);
    const input = screen.getByPlaceholderText('Montant') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '45,67' } });
    expect(input.value).toBe('45.67');
    expect(handleValueChange).toHaveBeenCalledWith(45.67, '45.67');
  });

  it('préserve les états intermédiaires de frappe ("12.", "12,", "-") sans les écraser', () => {
    const handleValueChange = vi.fn();
    render(<AmountInput allowNegative placeholder="Montant" onValueChange={handleValueChange} />);
    const input = screen.getByPlaceholderText('Montant') as HTMLInputElement;

    // Frappe d'un signe moins seul
    fireEvent.change(input, { target: { value: '-' } });
    expect(input.value).toBe('-');
    expect(handleValueChange).toHaveBeenCalledWith(undefined, '-');

    // Frappe d'un nombre suivi d'un point
    fireEvent.change(input, { target: { value: '12.' } });
    expect(input.value).toBe('12.');
    expect(handleValueChange).toHaveBeenCalledWith(12, '12.');

    // Frappe d'une virgule immédiatement normalisée en point intermédiaire
    fireEvent.change(input, { target: { value: '12,' } });
    expect(input.value).toBe('12.');
  });

  it('nettoie le point ou tiret terminal lors du blur (perte de focus)', () => {
    const handleValueChange = vi.fn();
    render(<AmountInput placeholder="Montant" onValueChange={handleValueChange} />);
    const input = screen.getByPlaceholderText('Montant') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '99.' } });
    expect(input.value).toBe('99.');

    fireEvent.blur(input);
    expect(input.value).toBe('99');
    expect(handleValueChange).toHaveBeenLastCalledWith(99, '99');
  });

  it('bloque les caractères alphabétiques et non numériques', () => {
    render(<AmountInput placeholder="Montant" defaultValue="50" />);
    const input = screen.getByPlaceholderText('Montant') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '50abc' } });
    expect(input.value).toBe('50');

    fireEvent.change(input, { target: { value: 'invalid' } });
    expect(input.value).toBe('50');
  });

  it('respecte la limite de décimales spécifiée (ex: 2 par défaut, 4 pour taux)', () => {
    render(<AmountInput decimals={2} placeholder="Montant 2 dec" />);
    const input2 = screen.getByPlaceholderText('Montant 2 dec') as HTMLInputElement;

    fireEvent.change(input2, { target: { value: '10.12' } });
    expect(input2.value).toBe('10.12');

    // 3ème décimale rejetée
    fireEvent.change(input2, { target: { value: '10.123' } });
    expect(input2.value).toBe('10.12');

    cleanup();

    render(<AmountInput decimals={4} placeholder="Taux 4 dec" />);
    const input4 = screen.getByPlaceholderText('Taux 4 dec') as HTMLInputElement;

    fireEvent.change(input4, { target: { value: '2.8755' } });
    expect(input4.value).toBe('2.8755');

    // 5ème décimale rejetée
    fireEvent.change(input4, { target: { value: '2.87559' } });
    expect(input4.value).toBe('2.8755');
  });

  it('gère correctement les montants négatifs uniquement lorsque allowNegative est activé', () => {
    // Sans allowNegative : le signe négatif est rejeté
    render(<AmountInput placeholder="Positif" />);
    const inputPos = screen.getByPlaceholderText('Positif') as HTMLInputElement;
    fireEvent.change(inputPos, { target: { value: '-25' } });
    expect(inputPos.value).toBe('');

    cleanup();

    // Avec allowNegative : le signe négatif est accepté
    render(<AmountInput allowNegative placeholder="Solde négatif" />);
    const inputNeg = screen.getByPlaceholderText('Solde négatif') as HTMLInputElement;
    fireEvent.change(inputNeg, { target: { value: '-25.50' } });
    expect(inputNeg.value).toBe('-25.50');
  });

  it('synchronise la valeur reçue par props quand l\'input n\'a pas le focus actif', () => {
    function ControlledWrapper() {
      const [val, setVal] = useState<number | undefined>(10);
      return (
        <div>
          <button onClick={() => setVal(20)}>Changer à 20</button>
          <AmountInput placeholder="Sync" value={val} onValueChange={v => setVal(v)} />
        </div>
      );
    }

    render(<ControlledWrapper />);
    const input = screen.getByPlaceholderText('Sync') as HTMLInputElement;
    expect(input.value).toBe('10');

    fireEvent.click(screen.getByText('Changer à 20'));
    expect(input.value).toBe('20');
  });
});
