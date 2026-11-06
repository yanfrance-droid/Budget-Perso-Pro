// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { Modal } from './Components';

afterEach(() => {
  cleanup();
});

describe('Modal Overlay Drag-to-Close Protection', () => {
  it('ne s\'affiche pas si isOpen est false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Contenu</p>
      </Modal>
    );
    expect(screen.queryByText('Test Modal')).toBeNull();
    expect(screen.queryByText('Contenu')).toBeNull();
  });

  it('ferme la modale lorsque l\'utilisateur clique directement et volontairement sur le fond (overlay)', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <input placeholder="Saisir montant" />
      </Modal>
    );

    const overlay = container.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay).toBeDefined();

    // Clic volontaire complet débutant et finissant sur l'overlay
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('PROTECTION CRITIQUE : NE FERME PAS la modale si le mouseDown a commencé à l\'intérieur du contenu ou d\'un input (sélection de texte / glisser-déposer vers l\'overlay)', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <input placeholder="Saisir montant" defaultValue="1500.00" />
      </Modal>
    );

    const overlay = container.querySelector('.modal-overlay') as HTMLElement;
    const input = screen.getByPlaceholderText('Saisir montant');

    // Scénario du bug : l'utilisateur commence à sélectionner du texte dans l'input (mouseDown sur input)
    fireEvent.mouseDown(input);

    // La souris dépasse sur le backdrop lors du relâchement, le navigateur émet le click sur l'ancêtre commun (overlay)
    fireEvent.click(overlay);

    // La modale NE DOIT PAS se fermer
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('ne ferme pas la modale lors d\'un clic à l\'intérieur du contenu de la modale', () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <button>Bouton interne</button>
      </Modal>
    );

    const content = container.querySelector('.modal-content') as HTMLElement;
    fireEvent.mouseDown(content);
    fireEvent.click(content);

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('ferme la modale lors du clic sur le bouton de fermeture (×)', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <p>Contenu</p>
      </Modal>
    );

    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
