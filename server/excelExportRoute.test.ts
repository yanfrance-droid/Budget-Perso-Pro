import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';
import ExcelJS from 'exceljs';
import { initDatabase } from './db.ts';
import { createServer } from './app.ts';
import { registerUser, authenticateUser } from './auth.ts';
import { saveAccount } from './services/accountService.ts';
import { saveTransaction } from './services/transactionService.ts';

describe('GET /api/migration/export-excel (API Route Integration)', () => {
  let db: DatabaseSync;
  let server: http.Server;
  let port: number;
  let baseUrl: string;
  let authToken: string;

  beforeEach(async () => {
    // Base SQLite isolée en mémoire
    db = initDatabase(':memory:');
    server = createServer(db);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Créer un utilisateur et récupérer une session valide
    registerUser(db, 'admin', 'Secr3tPassword!');
    const session = authenticateUser(db, 'admin', 'Secr3tPassword!');
    expect(session).not.toBeNull();
    authToken = session!.token;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      db.close();
    } catch {}
  });

  it('rejette la requête avec HTTP 401 si aucun token de session valide n\'est fourni', async () => {
    const res = await fetch(`${baseUrl}/api/migration/export-excel`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('authentification requise');
  });

  it('génère et retourne un fichier .xlsx avec les bons en-têtes HTTP lorsque le token est valide', async () => {
    const acc = saveAccount(db, {
      id: 'acc-http-test',
      name: 'Compte Courant API Test',
      type: 'checking',
      initialBalance: 1000,
      referenceDate: '2026-01-01'
    });

    saveTransaction(db, {
      id: 'tx-http-test',
      date: '2026-03-01',
      type: 'income',
      amount: 1500,
      status: 'cleared',
      accountId: acc.id!,
      label: 'Virement entrant'
    });

    const res = await fetch(`${baseUrl}/api/migration/export-excel`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const disposition = res.headers.get('content-disposition');
    expect(disposition).toContain('attachment; filename="budget_perso_pro_export_');
    expect(disposition).toContain('.xlsx"');

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    expect(buffer.length).toBeGreaterThan(1000);

    // Valider la structure du classeur retourné
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    expect(workbook.worksheets.map(w => w.name)).toEqual([
      'Tableau de bord',
      'Revenus',
      'Charges fixes',
      'Charges variables',
      'Dépenses',
      'Analyse des dépenses',
      'Santé',
      'Crédits',
      'Épargne',
      'Analyses croisées'
    ]);
    expect(workbook.getWorksheet('Graphiques')).toBeUndefined();
    expect(workbook.getWorksheet('Dépenses prévisionnelles')).toBeUndefined();

    // Vérifier la présence du graphique dans le Tableau de bord
    const wsDash = workbook.getWorksheet('Tableau de bord');
    expect(wsDash).toBeDefined();
    expect(wsDash!.getImages().length).toBe(1);

    const wsRev = workbook.getWorksheet('Revenus');
    // En-tête + 1 transaction + ligne de total = 3 lignes dans le tableau principal
    // (le tableau d'analyse dynamique adjacent s'étend sur 4 lignes : titre, en-tête, catégorie, total)
    expect(wsRev!.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('permet également le téléchargement via token en query param ?token=...', async () => {
    const res = await fetch(`${baseUrl}/api/migration/export-excel?token=${encodeURIComponent(authToken)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
