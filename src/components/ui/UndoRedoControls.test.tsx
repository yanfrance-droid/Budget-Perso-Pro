// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { UndoRedoControls } from './UndoRedoControls';
import * as ServerDataContextModule from '../../contexts/ServerDataContext';

describe('UndoRedoControls Component', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('appelle undo() lors du clic sur le bouton Annuler', () => {
    const mockUndo = vi.fn();
    const mockRedo = vi.fn();

    vi.spyOn(ServerDataContextModule, 'useServerData').mockReturnValue({
      undo: mockUndo,
      redo: mockRedo,
      canUndo: true,
      canRedo: false,
      undoStack: [
        { id: '1', label: 'Suppression test', timestamp: Date.now(), undo: vi.fn(), redo: vi.fn() }
      ],
      redoStack: []
    } as any);

    render(<UndoRedoControls />);

    const undoBtn = screen.getByRole('button', { name: /Annuler/i }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);
    expect(screen.getByText('1')).toBeTruthy();

    fireEvent.click(undoBtn);
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockRedo).not.toHaveBeenCalled();
  });

  it('appelle redo() lors du clic sur le bouton Rétablir', () => {
    const mockUndo = vi.fn();
    const mockRedo = vi.fn();

    vi.spyOn(ServerDataContextModule, 'useServerData').mockReturnValue({
      undo: mockUndo,
      redo: mockRedo,
      canUndo: false,
      canRedo: true,
      undoStack: [],
      redoStack: [
        { id: '2', label: 'Rétablissement test', timestamp: Date.now(), undo: vi.fn(), redo: vi.fn() }
      ]
    } as any);

    render(<UndoRedoControls />);

    const redoBtn = screen.getByRole('button', { name: /Rétablir/i }) as HTMLButtonElement;
    expect(redoBtn.disabled).toBe(false);
    expect(screen.getByText('1')).toBeTruthy();

    fireEvent.click(redoBtn);
    expect(mockRedo).toHaveBeenCalledTimes(1);
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('désactive les boutons quand les piles sont vides', () => {
    vi.spyOn(ServerDataContextModule, 'useServerData').mockReturnValue({
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      undoStack: [],
      redoStack: []
    } as any);

    render(<UndoRedoControls />);

    const undoBtn = screen.getByRole('button', { name: /Aucune action à annuler/i }) as HTMLButtonElement;
    const redoBtn = screen.getByRole('button', { name: /Aucune action à rétablir/i }) as HTMLButtonElement;

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
  });
});
