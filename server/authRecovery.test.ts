import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDatabase } from './db.ts';
import { 
  registerUser, 
  authenticateUser, 
  changePassword, 
  resetPasswordWithRecoveryKey, 
  getOrGenerateRecoveryKey 
} from './auth.ts';

describe('Auth - Password Change and Recovery Key', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  it('1. permet à l utilisateur connecté de changer son mot de passe avec l ancien', () => {
    const { userId } = registerUser(db, 'yann', 'AncienPass123!');
    
    // Échec si ancien mot de passe erroné
    expect(() => changePassword(db, userId, 'FauxPass', 'NouveauPass456!')).toThrow('Le mot de passe actuel est incorrect.');

    // Succès
    changePassword(db, userId, 'AncienPass123!', 'NouveauPass456!');

    // L'ancien ne fonctionne plus
    expect(authenticateUser(db, 'yann', 'AncienPass123!')).toBeNull();

    // Le nouveau fonctionne
    const session = authenticateUser(db, 'yann', 'NouveauPass456!');
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
  });

  it('2. permet la réinitialisation de mot de passe via la clé de secours', () => {
    const { userId, recoveryKey } = registerUser(db, 'yann', 'MonPassInitial123!');
    expect(recoveryKey).toMatch(/^BUDGET-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // Échec si mauvaise clé
    expect(() => resetPasswordWithRecoveryKey(db, 'yann', 'BUDGET-FAUX-CLE1-0000', 'NouveauPassSecours!'))
      .toThrow('La clé de secours est invalide.');

    // Réinitialisation réussie
    resetPasswordWithRecoveryKey(db, 'yann', recoveryKey, 'NouveauPassSecours!');

    // Connexion avec le nouveau mot de passe
    const session = authenticateUser(db, 'yann', 'NouveauPassSecours!');
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
  });

  it('3. permet de régénérer une nouvelle clé de secours', () => {
    const { userId, recoveryKey: firstKey } = registerUser(db, 'yann', 'MonPass123!');
    
    const secondKey = getOrGenerateRecoveryKey(db, userId);
    expect(secondKey).not.toBe(firstKey);
    expect(secondKey).toMatch(/^BUDGET-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // La première clé ne doit plus fonctionner
    expect(() => resetPasswordWithRecoveryKey(db, 'yann', firstKey, 'TestKeyFail!'))
      .toThrow('La clé de secours est invalide.');

    // La seconde fonctionne
    resetPasswordWithRecoveryKey(db, 'yann', secondKey, 'TestKeySuccess!');
    expect(authenticateUser(db, 'yann', 'TestKeySuccess!')).not.toBeNull();
  });
});
