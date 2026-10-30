import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db.ts';
import { createServer } from './app.ts';
import { writeTechnicalLog } from './services/loggerService.ts';
import { runDailyAutoBackup } from './services/maintenanceService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/budget.db');
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../dist');

console.log('--- DÉMARRAGE DU SERVEUR BUDGET PERSO PRO ---');
console.log(`Port d'écoute : ${PORT}`);
console.log(`Base de données SQLite : ${DB_PATH}`);
console.log(`Fichiers statiques Frontend : ${STATIC_DIR}`);

writeTechnicalLog('INFO', `Démarrage du serveur sur le port ${PORT} (SQLite: ${DB_PATH})`);

const db = initDatabase(DB_PATH);
const server = createServer(db, STATIC_DIR);

let isShuttingDown = false;
export async function gracefulShutdown(exitCode = 0, trigger = 'UNKNOWN') {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Arrêt] Fermeture ordonnée initiée (signal/trigger: ${trigger})...`);
  writeTechnicalLog('WARN', `Fermeture ordonnée du serveur (trigger: ${trigger}, code: ${exitCode})`);

  try {
    // 1. Fermeture des nouvelles connexions HTTP
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[Arrêt] Serveur HTTP arrêté.');
        resolve();
      });
    });
  } catch (err: any) {
    console.warn('[Arrêt] Avertissement arrêt serveur HTTP:', err.message);
  }

  try {
    // 2. Vidage et checkpoint WAL de SQLite
    console.log('[Arrêt] Exécution PRAGMA wal_checkpoint(TRUNCATE)...');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (err: any) {
    console.warn('[Arrêt] Avertissement checkpoint WAL SQLite:', err.message);
  }

  try {
    // 3. Fermeture de la base SQLite
    db.close();
    console.log('[Arrêt] Base SQLite fermée proprement.');
  } catch (err: any) {
    console.warn('[Arrêt] Avertissement fermeture SQLite:', err.message);
  }

  console.log(`[Arrêt] Terminé avec succès. Code de sortie : ${exitCode}`);
  process.exit(exitCode);
}

process.on('SIGTERM', () => gracefulShutdown(0, 'SIGTERM'));
process.on('SIGINT', () => gracefulShutdown(0, 'SIGINT'));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur Budget Perso Pro actif sur http://0.0.0.0:${PORT}`);
  console.log('Prêt pour les connexions PC, iPhone et VPN Proxmox.');
  writeTechnicalLog('INFO', `Serveur opérationnel sur http://0.0.0.0:${PORT}`);

  // Exécution initiale de la sauvegarde automatique quotidienne
  runDailyAutoBackup(db);

  // Vérification périodique toutes les 6 heures pour déclencher le backup quotidien
  setInterval(() => {
    runDailyAutoBackup(db);
  }, 6 * 60 * 60 * 1000);
});
