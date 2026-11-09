import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { 
  hasAnyUser, 
  registerUser, 
  authenticateUser, 
  validateSession, 
  logoutSession,
  changePassword,
  resetPasswordWithRecoveryKey,
  getOrGenerateRecoveryKey
} from './auth.ts';
import { getAllAccounts, saveAccount, deleteAccount } from './services/accountService.ts';
import { getAllCategories, saveCategory, deleteCategory } from './services/categoryService.ts';
import { getAllIncomePayers, saveIncomePayer, deleteIncomePayer } from './services/incomePayerService.ts';
import { getTransactions, saveTransaction, deleteTransaction, restoreTransaction, updateTransactionStatus } from './services/transactionService.ts';
import { 
  getAllLoans, 
  saveLoan, 
  updateLoanPaymentStatus, 
  deleteLoan,
  archiveLoan,
  reactivateLoanFuturePlanned,
  getLoanPaymentHistory,
  addLoanPaymentHistory,
  deleteLoanPaymentHistory,
  estimateLoanPayoff,
  getLoanById
} from './services/loanService.ts';
import { 
  getAllLoanCapitalHistory, 
  saveLoanCapitalRecord, 
  deleteLoanCapitalRecord, 
  clearLoanCapitalHistory, 
  exportLoanCapitalHistory, 
  importLoanCapitalHistory 
} from './services/loanCapitalHistoryService.ts';
import { getAllRecurrenceTemplates, saveRecurrenceTemplate, generateMonthlyOccurrences, deleteRecurrenceTemplate } from './services/recurrenceService.ts';
import { getAllPlannedExpenses, savePlannedExpense, deletePlannedExpense } from './services/plannedExpenseService.ts';
import { importBackupData, exportBackupData } from './services/migrationService.ts';
import { generateFullExportExcelWorkbook } from './services/excelExportService.ts';
import { 
  getMaintenanceStatus, 
  vacuumAndOptimize, 
  checkOrphans, 
  repairOrphans, 
  resetDatabaseData,
  restoreSqliteDbFile,
  runDailyAutoBackup,
  listServerSnapshots,
  restoreServerSnapshot,
  purgeServerBackups
} from './services/maintenanceService.ts';
import { 
  writeTechnicalLog, 
  getRecentTechnicalLogs, 
  clearTechnicalLogs, 
  getLogFilePath 
} from './services/loggerService.ts';

export function createServer(db: DatabaseSync, staticDir?: string) {
  // Verrou et drainage pour les opérations critiques de restauration
  let isRestoringDatabase = false;
  let activeDbRequestsCount = 0;

  // Permet d'attendre que toutes les requêtes actives utilisant la base soient terminées.
  // Abandonne avec une exception explicite si des requêtes sont encore actives après expiration du délai.
  const drainActiveDbRequests = async (timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (activeDbRequestsCount > 1 && (Date.now() - start) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (activeDbRequestsCount > 1) {
      throw new Error(`Délai d'attente dépassé (${timeoutMs} ms) : des requêtes concurrentes utilisent encore la base de données. Restauration abandonnée pour préserver l'intégrité.`);
    }
  };

  return http.createServer(async (req, res) => {
    // 1. Headers CORS pour accès multi-appareils (Localhost, IP locale 192.168.x.x, VPN Proxmox)
    const clientOrigin = req.headers.origin;
    if (clientOrigin) {
      res.setHeader('Access-Control-Allow-Origin', clientOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Helper pour répondre en JSON
    const sendJson = (statusCode: number, data: any) => {
      if (statusCode >= 400) {
        writeTechnicalLog('WARN', `${req.method} ${pathname} -> ${statusCode} (${data.error || 'Erreur'})`);
      }
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Protection contre les requêtes concurrentes pendant la restauration ou l'importation globale :
    // 1. Si une restauration/importation est déjà en cours, TOUTE nouvelle requête (y compris une autre demande de restauration ou d'import) est refusée.
    const isExclusiveRestoreOrImportRoute = 
      pathname === '/api/maintenance/restore-db' || 
      pathname === '/api/maintenance/backups/restore-snapshot' ||
      pathname === '/api/migration/import';

    if (isRestoringDatabase) {
      res.setHeader('Retry-After', '3');
      const errorMsg = isExclusiveRestoreOrImportRoute
        ? 'Une opération de restauration ou d\'importation est déjà en cours. Veuillez patienter avant d\'en lancer une nouvelle.'
        : 'Restauration ou mise à jour de la base de données en cours. Veuillez patienter quelques instants...';
      return sendJson(503, { error: errorMsg });
    }

    // Incrémenter le compteur de requêtes actives utilisant la base avec garde contre double décrémentation
    activeDbRequestsCount++;
    let hasDecremented = false;

    const finishRequest = () => {
      if (!hasDecremented) {
        hasDecremented = true;
        activeDbRequestsCount = Math.max(0, activeDbRequestsCount - 1);
      }
    };

    res.on('finish', finishRequest);
    res.on('close', finishRequest);

    // Helper pour lire le corps JSON avec protection contre la saturation mémoire (DoS)
    const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024; // 15 Mo max pour les imports de sauvegardes
    const readBody = async (maxBytes = MAX_PAYLOAD_BYTES): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = '';
        let receivedBytes = 0;
        let isAborted = false;

        req.on('data', chunk => {
          if (isAborted) return;
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes) {
            isAborted = true;
            const err: any = new Error('Corps de requête trop volumineux (dépassement de la taille maximale autorisée).');
            err.statusCode = 413;
            reject(err);
            return;
          }
          body += chunk;
        });

        req.on('end', () => {
          if (isAborted) return;
          if (!body) return resolve({});
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            const err: any = new Error('Corps de requête JSON invalide.');
            err.statusCode = 400;
            reject(err);
          }
        });
        req.on('error', reject);
      });
    };

    // Authentification de la requête
    const authHeader = req.headers['authorization'];
    const queryToken = parsedUrl.searchParams.get('token') || undefined;
    const token = (authHeader && authHeader.startsWith('Bearer ')) 
      ? authHeader.slice(7) 
      : queryToken;
    const session = validateSession(db, token);

    // Routes publiques
    if (pathname === '/api/health') {
      let appVersion = '1.0.0';
      try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.version) appVersion = pkg.version;
        }
      } catch {
        // Fallback standard
      }
      return sendJson(200, { status: 'ok', version: appVersion, hasUsers: hasAnyUser(db) });
    }

    if (pathname === '/api/auth/setup' && req.method === 'POST') {
      try {
        if (hasAnyUser(db)) {
          return sendJson(403, { error: 'La configuration initiale a déjà été effectuée.' });
        }
        const body = await readBody();
        const { userId, recoveryKey } = registerUser(db, body.username, body.password);
        const newSession = authenticateUser(db, body.username, body.password);
        return sendJson(201, { success: true, userId, session: newSession, recoveryKey });
      } catch (err: any) {
        return sendJson(400, { error: err.message });
      }
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      try {
        const body = await readBody();
        const userSession = authenticateUser(db, body.username, body.password);
        if (!userSession) {
          return sendJson(401, { error: 'Identifiants invalides.' });
        }
        return sendJson(200, { success: true, session: userSession });
      } catch (err: any) {
        return sendJson(400, { error: err.message });
      }
    }

    if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
      try {
        const body = await readBody();
        resetPasswordWithRecoveryKey(db, body.username, body.recoveryKey, body.newPassword);
        return sendJson(200, { success: true, message: 'Mot de passe réinitialisé avec succès.' });
      } catch (err: any) {
        return sendJson(400, { error: err.message });
      }
    }

    // Protection des routes /api
    if (pathname.startsWith('/api/')) {
      const isPublic = pathname === '/api/health' || 
                       pathname === '/api/auth/setup' || 
                       pathname === '/api/auth/login' || 
                       pathname === '/api/auth/reset-password';
      if (!isPublic) {
        if (!hasAnyUser(db)) {
          return sendJson(401, { error: 'Accès non autorisé : configuration initiale requise.' });
        }
        if (!session) {
          return sendJson(401, { error: 'Accès non autorisé : authentification requise.' });
        }
      }
    }

    try {
      // 2. Auth endpoints
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        return sendJson(200, { session });
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        if (token) logoutSession(db, token);
        return sendJson(200, { success: true });
      }

      if (pathname === '/api/auth/change-password' && req.method === 'POST') {
        try {
          const body = await readBody();
          changePassword(db, session!.userId, body.currentPassword, body.newPassword);
          return sendJson(200, { success: true, message: 'Mot de passe mis à jour avec succès.' });
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }

      if (pathname === '/api/auth/recovery-key' && req.method === 'GET') {
        try {
          const key = getOrGenerateRecoveryKey(db, session!.userId);
          return sendJson(200, { recoveryKey: key });
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }

      // 3. Accounts
      if (pathname === '/api/accounts') {
        if (req.method === 'GET') {
          return sendJson(200, getAllAccounts(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveAccount(db, body));
        }
      }
      if (pathname.startsWith('/api/accounts/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deleteAccount(db, id);
        return sendJson(200, { success: true });
      }

      // 4. Categories
      if (pathname === '/api/categories') {
        if (req.method === 'GET') {
          return sendJson(200, getAllCategories(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveCategory(db, body));
        }
      }
      if (pathname.startsWith('/api/categories/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deleteCategory(db, id);
        return sendJson(200, { success: true });
      }

      // 4b. Income Payers (Organismes verseurs)
      if (pathname === '/api/income-payers') {
        if (req.method === 'GET') {
          return sendJson(200, getAllIncomePayers(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveIncomePayer(db, body));
        }
      }
      if (pathname.startsWith('/api/income-payers/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deleteIncomePayer(db, id);
        return sendJson(200, { success: true });
      }

      // 5. Transactions
      if (pathname === '/api/transactions') {
        if (req.method === 'GET') {
          const month = parsedUrl.searchParams.get('month') || undefined;
          const accountId = parsedUrl.searchParams.get('accountId') || undefined;
          const type = parsedUrl.searchParams.get('type') || undefined;
          const status = parsedUrl.searchParams.get('status') || undefined;
          const includeDeleted = parsedUrl.searchParams.get('includeDeleted') === 'true';
          return sendJson(200, getTransactions(db, { month, accountId, type, status, includeDeleted }));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveTransaction(db, body));
        }
      }
      if (pathname.match(/^\/api\/transactions\/[^/]+\/restore$/) && req.method === 'POST') {
        const parts = pathname.split('/');
        const id = parts[3];
        try {
          const restored = restoreTransaction(db, id);
          return sendJson(200, { success: true, transaction: restored });
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }
      if (pathname.startsWith('/api/transactions/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deleteTransaction(db, id);
        return sendJson(200, { success: true });
      }
      if (pathname.match(/^\/api\/transactions\/[^/]+\/status$/) && req.method === 'PATCH') {
        const parts = pathname.split('/');
        const id = parts[3];
        const body = await readBody();
        return sendJson(200, updateTransactionStatus(db, id, body.status));
      }

      // 6. Loans & Loan payments
      if (pathname === '/api/loans') {
        if (req.method === 'GET') {
          return sendJson(200, getAllLoans(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveLoan(db, body));
        }
      }
      if (pathname.match(/^\/api\/loans\/[^/]+\/(archive|unarchive)$/) && req.method === 'POST') {
        const parts = pathname.split('/');
        const loanId = parts[3];
        const isUnarchiveAction = parts[4] === 'unarchive';
        const body = await readBody().catch(() => ({}));
        const isArchived = isUnarchiveAction ? false : (body?.isArchived !== undefined ? Boolean(body.isArchived) : true);
        const disableFuturePlanned = Boolean(body?.disableFuturePlanned);
        const result = archiveLoan(db, loanId, isArchived, disableFuturePlanned);
        return sendJson(200, result);
      }
      if (pathname.match(/^\/api\/loans\/[^/]+\/reactivate-future$/) && req.method === 'POST') {
        const parts = pathname.split('/');
        const loanId = parts[3];
        const reactivatedCount = reactivateLoanFuturePlanned(db, loanId);
        return sendJson(200, { success: true, reactivatedCount });
      }
      if (pathname.match(/^\/api\/loans\/[^/]+\/payment-history$/)) {
        const parts = pathname.split('/');
        const loanId = parts[3];
        if (req.method === 'GET') {
          return sendJson(200, getLoanPaymentHistory(db, loanId));
        }
        if (req.method === 'POST') {
          try {
            const body = await readBody();
            const saved = addLoanPaymentHistory(db, { ...body, loanId });
            return sendJson(201, saved);
          } catch (err: any) {
            return sendJson(400, { error: err.message });
          }
        }
      }
      if (pathname.match(/^\/api\/loans\/payment-history\/[^/]+$/) && req.method === 'DELETE') {
        const parts = pathname.split('/');
        const historyId = parts[4];
        try {
          const body = await readBody().catch(() => ({}));
          deleteLoanPaymentHistory(db, historyId, Boolean(body?.allowPastCorrection));
          return sendJson(200, { success: true });
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }
      if (pathname.match(/^\/api\/loans\/[^/]+\/payoff-estimate$/) && req.method === 'GET') {
        const parts = pathname.split('/');
        const loanId = parts[3];
        const loan = getLoanById(db, loanId);
        if (!loan) {
          return sendJson(404, { error: 'Crédit introuvable.' });
        }
        const monthlyPaymentParam = parsedUrl.searchParams.get('monthlyPayment');
        const startMonthParam = parsedUrl.searchParams.get('startMonth');
        const estimate = estimateLoanPayoff({
          remainingCapital: loan.remainingCapital,
          monthlyPayment: monthlyPaymentParam ? Number(monthlyPaymentParam) : loan.monthlyPayment,
          interestRate: loan.interestRate,
          insurancePart: loan.insurancePart,
          startMonth: startMonthParam || undefined
        });
        return sendJson(200, estimate);
      }
      if (pathname.match(/^\/api\/loans\/[^/]+$/) && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deleteLoan(db, id);
        return sendJson(200, { success: true });
      }
      if (pathname.match(/^\/api\/loans\/payments\/[^/]+\/status$/) && req.method === 'POST') {
        const parts = pathname.split('/');
        const paymentId = parts[4];
        const body = await readBody();
        const result = updateLoanPaymentStatus(db, paymentId, body.status);
        return sendJson(200, result);
      }

      // 6b. Historique des capitaux de prêts (Loan Capital History)
      if (pathname === '/api/loans/history' && req.method === 'GET') {
        try {
          return sendJson(200, getAllLoanCapitalHistory(db));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }
      if (pathname === '/api/loans/history/export' && req.method === 'GET') {
        try {
          const exportPayload = exportLoanCapitalHistory(db);
          const today = new Date().toISOString().split('T')[0];
          const fileName = `budget_pro_historique_prets_${today}.json`;
          const jsonBuffer = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf-8');

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': jsonBuffer.length,
            'Content-Disposition': `attachment; filename="${fileName}"`
          });
          res.end(jsonBuffer);
          return;
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }
      if (pathname === '/api/loans/history/import' && req.method === 'POST') {
        try {
          const body = await readBody();
          const mode = body.mode === 'merge' ? 'merge' : 'replace';
          const payload = body.payload || body;
          const result = importLoanCapitalHistory(db, payload, mode);
          return sendJson(200, result);
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }
      if (pathname === '/api/loans/history' && req.method === 'POST') {
        try {
          const body = await readBody();
          return sendJson(200, saveLoanCapitalRecord(db, body));
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }
      if (pathname.startsWith('/api/loans/history/') && req.method === 'PUT') {
        try {
          const month = pathname.replace('/api/loans/history/', '');
          const body = await readBody();
          return sendJson(200, saveLoanCapitalRecord(db, { ...body, month }));
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }
      if (pathname === '/api/loans/history' && req.method === 'DELETE') {
        try {
          const body = await readBody();
          if (!body || body.confirm !== true) {
            return sendJson(400, { error: 'Confirmation requise pour vider l\'historique des capitaux (confirm: true).' });
          }
          const deletedCount = clearLoanCapitalHistory(db);
          return sendJson(200, { success: true, deletedCount });
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }
      if (pathname.startsWith('/api/loans/history/') && req.method === 'DELETE') {
        try {
          const month = pathname.replace('/api/loans/history/', '');
          const deleted = deleteLoanCapitalRecord(db, month);
          return sendJson(200, { success: true, deleted });
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        }
      }

      // 7. Recurrence Templates
      if (pathname === '/api/recurrence-templates') {
        if (req.method === 'GET') {
          return sendJson(200, getAllRecurrenceTemplates(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, saveRecurrenceTemplate(db, body));
        }
      }
      if (pathname.startsWith('/api/recurrence-templates/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        const fromDate = parsedUrl.searchParams.get('fromDate') || undefined;
        deleteRecurrenceTemplate(db, id, fromDate);
        return sendJson(200, { success: true });
      }
      if (pathname === '/api/recurrence-templates/generate' && req.method === 'POST') {
        const body = await readBody();
        const count = generateMonthlyOccurrences(db, body.month);
        return sendJson(200, { generated: count });
      }

      // 7b. Planned Expenses (Dépenses prévisionnelles / wishlist isolée)
      if (pathname === '/api/planned-expenses') {
        if (req.method === 'GET') {
          return sendJson(200, getAllPlannedExpenses(db));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          return sendJson(200, savePlannedExpense(db, body));
        }
      }
      if (pathname.startsWith('/api/planned-expenses/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop()!;
        deletePlannedExpense(db, id);
        return sendJson(200, { success: true });
      }

      // 8. Settings & Dashboard state
      if (pathname === '/api/settings') {
        if (req.method === 'GET') {
          const stmt = db.prepare('SELECT key, value FROM app_settings');
          const rows = stmt.all() as { key: string; value: string }[];
          return sendJson(200, Object.fromEntries(rows.map(r => [r.key, r.value])));
        }
        if (req.method === 'POST') {
          const body = await readBody();
          const stmt = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
          for (const [k, v] of Object.entries(body)) {
            stmt.run(k, String(v));
          }
          return sendJson(200, { success: true });
        }
      }

      // 9. Data Migration / Backup
      if (pathname === '/api/migration/import' && req.method === 'POST') {
        if (isRestoringDatabase) {
          res.setHeader('Retry-After', '3');
          return sendJson(503, { error: 'Une opération de restauration ou d\'importation est déjà en cours. Veuillez patienter avant d\'en lancer une nouvelle.' });
        }
        isRestoringDatabase = true;

        try {
          const body = await readBody();
          await drainActiveDbRequests();
          const replaceLoanCapitalHistory = body.replaceLoanCapitalHistory !== false;
          const payload = body.payload || body;
          const result = importBackupData(db, payload, { replaceLoanCapitalHistory });
          return sendJson(200, result);
        } catch (err: any) {
          return sendJson(400, { error: err.message });
        } finally {
          isRestoringDatabase = false;
        }
      }
      if (pathname === '/api/migration/export' && req.method === 'GET') {
        return sendJson(200, exportBackupData(db));
      }

      // Export complet multi-feuilles Excel / LibreOffice Calc (.xlsx)
      if (pathname === '/api/migration/export-excel' && req.method === 'GET') {
        if (!session) {
          return sendJson(401, { error: 'Session invalide ou expirée.' });
        }
        try {
          const startDate = parsedUrl.searchParams.get('startDate') || undefined;
          const endDate = parsedUrl.searchParams.get('endDate') || undefined;

          // Validation des dates si spécifiées
          if (startDate && endDate && startDate > endDate) {
            return sendJson(400, { error: 'La date de début doit être antérieure ou égale à la date de fin.' });
          }

          const excelBuffer = await generateFullExportExcelWorkbook(db, { startDate, endDate });
          const today = new Date().toISOString().split('T')[0];
          const periodSuffix = startDate && endDate ? `_${startDate}_au_${endDate}` : '';
          const fileName = `budget_perso_pro_export_${today}${periodSuffix}.xlsx`;

          res.writeHead(200, {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Length': excelBuffer.length,
            'Content-Disposition': `attachment; filename="${fileName}"`
          });
          res.end(excelBuffer);
          return;
        } catch (err: any) {
          writeTechnicalLog('ERROR', `Échec lors de la génération de l'export Excel (.xlsx) : ${err.message}`);
          return sendJson(500, { error: `Erreur lors de la génération de l'export Excel : ${err.message}` });
        }
      }

      // 10. Maintenance, Health & Diagnostic SQLite
      if (pathname === '/api/maintenance/status' && req.method === 'GET') {
        try {
          return sendJson(200, getMaintenanceStatus(db));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/vacuum' && req.method === 'POST') {
        try {
          return sendJson(200, vacuumAndOptimize(db));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/orphans/check' && req.method === 'GET') {
        try {
          return sendJson(200, checkOrphans(db));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/orphans/repair' && req.method === 'POST') {
        try {
          return sendJson(200, repairOrphans(db));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/reset' && req.method === 'POST') {
        try {
          const body = await readBody();
          const reseedDefaults = body.reseedDefaults !== false;
          const resetLoanCapitalHistory = body.resetLoanCapitalHistory !== false;
          writeTechnicalLog('WARN', 'Exécution de la réinitialisation de la base SQLite par l\'utilisateur.');
          return sendJson(200, resetDatabaseData(db, reseedDefaults, resetLoanCapitalHistory));
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      // Redémarrage sécurisé et contrôlé du processus serveur
      if (pathname === '/api/maintenance/restart' && req.method === 'POST') {
        if (isRestoringDatabase) {
          res.setHeader('Retry-After', '3');
          return sendJson(503, { error: 'Une opération de maintenance critique est déjà en cours.' });
        }

        // Verrouiller les nouvelles opérations
        isRestoringDatabase = true;
        writeTechnicalLog('WARN', 'Demande de redémarrage sécurisé initiée via l\'interface d\'administration.');

        try {
          // Attendre la fin des requêtes en cours
          await drainActiveDbRequests(3000);

          // Répondre avec succès au client HTTP
          sendJson(200, {
            success: true,
            message: 'Signal de redémarrage reçu. Le serveur effectue un checkpoint SQLite et redémarre...'
          });

          // Attacher l'événement 'finish' pour s'assurer que la réponse a été totalement écrite sur la socket réseau
          res.on('finish', () => {
            // Laisser une marge de 250ms sur l'I/O réseau puis déclencher la fermeture ordonnée
            setTimeout(() => {
              try {
                // Checkpoint WAL TRUNCATE pour garantir qu'aucune transaction ne reste dans le journal
                db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
                db.close();
              } catch (e: any) {
                console.warn('[Restart] Avertissement fermeture SQLite avant sortie:', e.message);
              }
              // En environnement de test ou process parent géré
              if (process.env.NODE_ENV !== 'test') {
                process.exit(0);
              }
            }, 250);
          });
          return;
        } catch (err: any) {
          isRestoringDatabase = false;
          writeTechnicalLog('ERROR', `Échec de l'initialisation du redémarrage : ${err.message}`);
          return sendJson(500, { error: err.message });
        }
      }

      // 11. Logs techniques du serveur
      if (pathname === '/api/maintenance/logs' && req.method === 'GET') {
        try {
          const lines = getRecentTechnicalLogs(100);
          return sendJson(200, { lines });
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/logs' && req.method === 'DELETE') {
        try {
          clearTechnicalLogs();
          return sendJson(200, { success: true, message: 'Logs effacés.' });
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      if (pathname === '/api/maintenance/logs/download' && req.method === 'GET') {
        try {
          const filePath = getLogFilePath();
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="server_${new Date().toISOString().split('T')[0]}.log"`
          });
          const stream = fs.createReadStream(filePath);
          stream.pipe(res);
          return;
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      // Restauration d'un fichier SQLite (.db) complet
      if (pathname === '/api/maintenance/restore-db' && req.method === 'POST') {
        if (isRestoringDatabase) {
          res.setHeader('Retry-After', '3');
          return sendJson(503, { error: 'Une opération de restauration ou d\'importation est déjà en cours. Veuillez patienter avant d\'en lancer une nouvelle.' });
        }
        isRestoringDatabase = true;

        const tempUploadPath = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data', `upload_restore_${Date.now()}.db`);
        try {
          const fileStream = fs.createWriteStream(tempUploadPath);
          await new Promise((resolve, reject) => {
            req.pipe(fileStream);
            req.on('end', resolve);
            req.on('error', reject);
          });

          writeTechnicalLog('INFO', 'Tentative de restauration directe d\'un fichier SQLite (.db)');
          
          await drainActiveDbRequests();

          const result = restoreSqliteDbFile(db, tempUploadPath);
          try { fs.unlinkSync(tempUploadPath); } catch {}
          writeTechnicalLog('INFO', 'Restauration SQLite (.db) réussie avec succès.');
          return sendJson(200, result);
        } catch (err: any) {
          try { if (fs.existsSync(tempUploadPath)) fs.unlinkSync(tempUploadPath); } catch {}
          writeTechnicalLog('ERROR', `Échec de restauration SQLite (.db) : ${err.message}`);
          return sendJson(500, { error: err.message });
        } finally {
          isRestoringDatabase = false;
        }
      }

      // Liste des instantanés de sauvegarde SQLite stockés sur le serveur
      if (pathname === '/api/maintenance/backups/list' && req.method === 'GET') {
        try {
          const snapshots = listServerSnapshots();
          return sendJson(200, { snapshots });
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      // Purge de l'ensemble des sauvegardes stockées sur le serveur
      if ((pathname === '/api/maintenance/backups' || pathname === '/api/maintenance/backups/purge') && req.method === 'DELETE') {
        try {
          const result = purgeServerBackups();
          writeTechnicalLog('INFO', `Purge des sauvegardes serveur : ${result.deletedCount} fichier(s) supprimé(s).`);
          return sendJson(200, result);
        } catch (err: any) {
          writeTechnicalLog('ERROR', `Échec de la purge des sauvegardes serveur : ${err.message}`);
          return sendJson(500, { error: err.message });
        }
      }

      // Restauration directe à chaud depuis un instantané du serveur
      if (pathname === '/api/maintenance/backups/restore-snapshot' && req.method === 'POST') {
        if (isRestoringDatabase) {
          res.setHeader('Retry-After', '3');
          return sendJson(503, { error: 'Une opération de restauration ou d\'importation est déjà en cours. Veuillez patienter avant d\'en lancer une nouvelle.' });
        }
        isRestoringDatabase = true;

        try {
          const body = await readBody();
          if (!body?.fileName) {
            return sendJson(400, { error: 'Nom du fichier de sauvegarde requis.' });
          }

          writeTechnicalLog('INFO', `Restauration directe de l'instantané serveur : ${body.fileName}`);
          
          await drainActiveDbRequests();

          const result = restoreServerSnapshot(db, body.fileName);
          writeTechnicalLog('INFO', `Instantané ${body.fileName} restauré avec succès.`);
          return sendJson(200, result);
        } catch (err: any) {
          writeTechnicalLog('ERROR', `Échec de restauration de l'instantané serveur : ${err.message}`);
          return sendJson(500, { error: err.message });
        } finally {
          isRestoringDatabase = false;
        }
      }

      // Exécution de l'auto-backup quotidien
      if (pathname === '/api/maintenance/auto-backup' && req.method === 'POST') {
        try {
          const backupPath = runDailyAutoBackup(db);
          return sendJson(200, { success: true, backupPath });
        } catch (err: any) {
          return sendJson(500, { error: err.message });
        }
      }

      // Téléchargement direct du fichier SQLite complet (.db)
      if (pathname === '/api/maintenance/download-db' && req.method === 'GET') {
        try {
          const dbPath = process.env.DB_PATH || './data/budget.db';
          const dbDir = path.dirname(path.resolve(dbPath));
          const tempPath = path.join(dbDir, `budget_export_${Date.now()}.db`);
          
          db.exec(`VACUUM INTO '${tempPath.replace(/\\/g, '/')}'`);

          const stat = fs.statSync(tempPath);
          res.writeHead(200, {
            'Content-Type': 'application/x-sqlite3',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="budget_perso_pro_${new Date().toISOString().split('T')[0]}.db"`
          });

          const readStream = fs.createReadStream(tempPath);
          readStream.pipe(res);
          readStream.on('close', () => {
            try { fs.unlinkSync(tempPath); } catch {}
          });
          return;
        } catch (err: any) {
          return sendJson(500, { error: `Erreur lors de l'export SQLite : ${err.message}` });
        }
      }

      if (pathname === '/api/backup/snapshot' && req.method === 'POST') {
        try {
          const dbPath = process.env.DB_PATH || './data/budget.db';
          const dbDir = path.dirname(path.resolve(dbPath));
          const backupDir = path.join(dbDir, 'backups');
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupFileName = `budget_backup_${timestamp}.db`;
          const backupFilePath = path.join(backupDir, backupFileName);

          db.exec(`VACUUM INTO '${backupFilePath.replace(/\\/g, '/')}'`);
          return sendJson(200, {
            success: true,
            fileName: backupFileName,
            filePath: backupFilePath,
            timestamp: new Date().toISOString()
          });
        } catch (err: any) {
          return sendJson(500, { error: `Erreur lors de la création du snapshot : ${err.message}` });
        }
      }

      // Si route API non trouvée
      if (pathname.startsWith('/api/')) {
        return sendJson(404, { error: 'Route API introuvable.' });
      }

      // 10. Service des fichiers statiques frontend (dist/) pour hébergement Proxmox
      if (staticDir && fs.existsSync(staticDir)) {
        let filePath = path.join(staticDir, pathname === '/' ? 'index.html' : pathname);
        if (!fs.existsSync(filePath)) {
          // Fallback SPA (Single Page Application) vers index.html
          filePath = path.join(staticDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
          '.ttf': 'font/ttf'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      }

      sendJson(404, { error: 'Page introuvable.' });
    } catch (err: any) {
      sendJson(err.statusCode || 500, { error: err.message || 'Erreur interne du serveur.' });
    }
  });
}
