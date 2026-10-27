import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export interface UserSession {
  userId: string;
  username: string;
  token: string;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const calculatedHash = crypto.scryptSync(password, salt, 64);
  const storedHashBuffer = Buffer.from(hash, 'hex');
  if (calculatedHash.length !== storedHashBuffer.length) return false;
  return crypto.timingSafeEqual(calculatedHash, storedHashBuffer);
}

export function hasAnyUser(db: DatabaseSync): boolean {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const row = stmt.get() as { count: number };
  return row ? row.count > 0 : false;
}

export function registerUser(db: DatabaseSync, username: string, password: string): { userId: string; recoveryKey: string } {
  if (!username || username.trim().length < 3) {
    throw new Error('Le nom d\'utilisateur doit comporter au moins 3 caractères.');
  }
  if (!password || password.length < 6) {
    throw new Error('Le mot de passe doit comporter au moins 6 caractères.');
  }

  const { hash, salt } = hashPassword(password);
  
  // Génération d'une clé de secours lisible et sécurisée : BUDGET-XXXX-XXXX-XXXX
  const rawHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const recoveryKey = `BUDGET-${rawHex.slice(0, 4)}-${rawHex.slice(4, 8)}-${rawHex.slice(8, 12)}`;
  const { hash: recHash, salt: recSalt } = hashPassword(recoveryKey);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO users (id, username, password_hash, salt, recovery_key_hash, recovery_key_salt, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, username.trim(), hash, salt, recHash, recSalt, createdAt);
  return { userId: id, recoveryKey };
}

export function changePassword(db: DatabaseSync, userId: string, currentPassword: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 6 caractères.');
  }

  const stmt = db.prepare('SELECT password_hash, salt FROM users WHERE id = ?');
  const user = stmt.get(userId) as { password_hash: string; salt: string } | undefined;
  if (!user) {
    throw new Error('Utilisateur introuvable.');
  }

  const valid = verifyPassword(currentPassword, user.password_hash, user.salt);
  if (!valid) {
    throw new Error('Le mot de passe actuel est incorrect.');
  }

  const { hash, salt } = hashPassword(newPassword);
  const updateStmt = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
  updateStmt.run(hash, salt, userId);
}

export function resetPasswordWithRecoveryKey(db: DatabaseSync, username: string, recoveryKey: string, newPassword: string): void {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 6 caractères.');
  }

  const normalizedKey = recoveryKey.trim().toUpperCase();
  const stmt = db.prepare('SELECT id, recovery_key_hash, recovery_key_salt FROM users WHERE username = ?');
  const user = stmt.get(username.trim()) as { id: string; recovery_key_hash: string; recovery_key_salt: string } | undefined;

  if (!user || !user.recovery_key_hash || !user.recovery_key_salt) {
    throw new Error('Utilisateur introuvable ou aucune clé de secours configurée.');
  }

  const validKey = verifyPassword(normalizedKey, user.recovery_key_hash, user.recovery_key_salt);
  if (!validKey) {
    throw new Error('La clé de secours est invalide.');
  }

  const { hash, salt } = hashPassword(newPassword);
  const updateStmt = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
  updateStmt.run(hash, salt, user.id);
}

export function getOrGenerateRecoveryKey(db: DatabaseSync, userId: string): string {
  const stmt = db.prepare('SELECT username, recovery_key_hash FROM users WHERE id = ?');
  const user = stmt.get(userId) as { username: string; recovery_key_hash: string | null } | undefined;
  if (!user) throw new Error('Utilisateur introuvable.');

  // Générer une nouvelle clé de secours
  const rawHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const newRecoveryKey = `BUDGET-${rawHex.slice(0, 4)}-${rawHex.slice(4, 8)}-${rawHex.slice(8, 12)}`;
  const { hash: recHash, salt: recSalt } = hashPassword(newRecoveryKey);

  const updateStmt = db.prepare('UPDATE users SET recovery_key_hash = ?, recovery_key_salt = ? WHERE id = ?');
  updateStmt.run(recHash, recSalt, userId);

  return newRecoveryKey;
}

export function authenticateUser(db: DatabaseSync, username: string, password: string): UserSession | null {
  const stmt = db.prepare('SELECT id, username, password_hash, salt FROM users WHERE username = ?');
  const user = stmt.get(username.trim()) as { id: string; username: string; password_hash: string; salt: string } | undefined;

  if (!user) return null;

  const valid = verifyPassword(password, user.password_hash, user.salt);
  if (!valid) return null;

  // Création d'une session valide 30 jours
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const sessionStmt = db.prepare(`
    INSERT INTO sessions (token, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  sessionStmt.run(token, user.id, createdAt, expiresAt);

  return {
    userId: user.id,
    username: user.username,
    token
  };
}

export function validateSession(db: DatabaseSync, token: string | undefined): UserSession | null {
  if (!token) return null;

  const stmt = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at, u.username
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `);
  const row = stmt.get(token) as { token: string; user_id: string; expires_at: string; username: string } | undefined;

  if (!row) return null;

  return {
    userId: row.user_id,
    username: row.username,
    token: row.token
  };
}

export function logoutSession(db: DatabaseSync, token: string): void {
  const stmt = db.prepare('DELETE FROM sessions WHERE token = ?');
  stmt.run(token);
}
