import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import { initDatabase } from './db.ts';
import { createServer } from './app.ts';
import { savePlannedExpense, getAllPlannedExpenses } from './services/plannedExpenseService.ts';

describe('Vérification temporelle et persistance des dépenses prévisionnelles', () => {
  let db: DatabaseSync;
  let server: http.Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Base SQLite isolée en mémoire
    db = initDatabase(':memory:');
    server = createServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Configuration d'un utilisateur et d'une session pour les appels HTTP
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, created_at)
      VALUES ('u_test', 'user_test', 'hash', 'salt', '2026-01-01');
    `).run();
    db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES ('valid_token', 'u_test', '2099-12-31', '2026-01-01');
    `).run();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it('1. Scénario Présent : une dépense enregistrée aujourd\'hui est restituée fidèlement par SQLite et l\'API', async () => {
    // Date système simulée : 2026-10-24
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));

    const item = savePlannedExpense(db, {
      label: 'Achat du jour',
      estimatedAmount: 150.00,
      urgency: 'urgent',
      targetDate: '2026-10-24',
      notes: 'Test aujourd\'hui'
    });

    // Requête HTTP GET via l'API
    const res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(item.id);
    expect(data[0].label).toBe('Achat du jour');
    expect(data[0].targetDate).toBe('2026-10-24');
  });

  it('2. Scénario +1 mois : la dépense d\'aujourd\'hui est toujours renvoyée dans 1 mois', async () => {
    // Dépense enregistrée le 24 octobre 2026
    savePlannedExpense(db, {
      id: 'plan-oct',
      label: 'Remplacement chauffe-eau',
      estimatedAmount: 800,
      urgency: 'urgent',
      targetDate: '2026-10-24',
      createdAt: '2026-10-24T10:00:00.000Z'
    });

    // Avancement du temps système d'un mois : 24 novembre 2026
    vi.setSystemTime(new Date('2026-11-24T12:00:00.000Z'));

    // Requête directe SQLite
    const sqliteRows = getAllPlannedExpenses(db);
    expect(sqliteRows).toHaveLength(1);
    expect(sqliteRows[0].id).toBe('plan-oct');

    // Requête API HTTP
    const res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-oct');
    expect(data[0].label).toBe('Remplacement chauffe-eau');
  });

  it('3. Scénario +6 mois : la dépense est toujours présente après plusieurs mois', async () => {
    savePlannedExpense(db, {
      id: 'plan-plus-6m',
      label: 'Peinture façade',
      estimatedAmount: 1200,
      urgency: 'medium',
      targetDate: '2026-10-24',
      createdAt: '2026-10-24T10:00:00.000Z'
    });

    // Avancement de 6 mois : 24 avril 2027
    vi.setSystemTime(new Date('2027-04-24T12:00:00.000Z'));

    const res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-plus-6m');
  });

  it('4. Scénario +1 an et +5 ans : la dépense persiste indéfiniment sans expiration automatique', async () => {
    savePlannedExpense(db, {
      id: 'plan-perenne',
      label: 'Agrandissement terrasse',
      estimatedAmount: 5000,
      urgency: 'low',
      targetDate: '2026-10-24',
      createdAt: '2026-10-24T10:00:00.000Z'
    });

    // Avancement à 1 an : 24 octobre 2027
    vi.setSystemTime(new Date('2027-10-24T12:00:00.000Z'));
    let res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    let data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-perenne');

    // Avancement à 5 ans : 24 octobre 2031
    vi.setSystemTime(new Date('2031-10-24T12:00:00.000Z'));
    res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-perenne');
    expect(data[0].estimatedAmount).toBe(5000);
  });

  it('5. Scénario Date passée : une dépense avec une date déjà échue reste visible dans la liste', async () => {
    // Date système actuelle : 2026-10-24
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));

    // Dépense dont la date envisagée était l'année dernière (2025-05-10)
    savePlannedExpense(db, {
      id: 'plan-passe',
      label: 'Achat initialement prévu en 2025',
      estimatedAmount: 300,
      urgency: 'urgent',
      targetDate: '2025-05-10',
      createdAt: '2025-04-01T10:00:00.000Z'
    });

    const res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-passe');
    expect(data[0].targetDate).toBe('2025-05-10');
  });

  it('6. Scénario Date très lointaine dans le futur (+10 ans)', async () => {
    savePlannedExpense(db, {
      id: 'plan-futur-lointain',
      label: 'Projet retraite',
      estimatedAmount: 20000,
      urgency: 'low',
      targetDate: '2036-06-15',
      createdAt: '2026-10-24T10:00:00.000Z'
    });

    const res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('plan-futur-lointain');
    expect(data[0].targetDate).toBe('2036-06-15');
  });

  it('7. Seule une action explicite (suppression ou marquage comme réalisée) retire la dépense', async () => {
    const item = savePlannedExpense(db, {
      label: 'Table de chevet',
      estimatedAmount: 80,
      urgency: 'low'
    });

    // 10 ans plus tard
    vi.setSystemTime(new Date('2036-10-24T12:00:00.000Z'));
    let res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    expect((await res.json()).length).toBe(1);

    // Suppression explicite (comme le fait le bouton "Réalisée" ou "Supprimer")
    const delRes = await fetch(`${baseUrl}/api/planned-expenses/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid_token' }
    });
    expect(delRes.status).toBe(200);

    // Désormais absente
    res = await fetch(`${baseUrl}/api/planned-expenses`, {
      headers: { Authorization: 'Bearer valid_token' }
    });
    expect((await res.json()).length).toBe(0);
  });
});
