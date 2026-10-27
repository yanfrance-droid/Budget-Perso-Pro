import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface TechnicalLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo max
const LOG_DIR = path.resolve(process.env.LOG_DIR || './logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');

/**
 * Formate la date courante à l'heure locale de la machine (ex: 2026-10-22 10:45:12)
 */
function getLocalTimestamp(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Assure que le dossier ./logs existe
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Rotation automatique : si server.log dépasse 5 Mo, on crée server.log.1
 */
function checkRotation(): void {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size >= MAX_FILE_SIZE_BYTES) {
        const backupFile = `${LOG_FILE}.1`;
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
  } catch (err) {
    console.error('Erreur lors de la rotation des logs :', err);
  }
}

/**
 * Écrit une entrée dans le fichier de log technique
 */
export function writeTechnicalLog(level: LogLevel, message: string): void {
  try {
    ensureLogDir();
    checkRotation();

    const timestamp = getLocalTimestamp();
    const line = `[${timestamp}] [${level.padEnd(5)}] ${message}\n`;

    fs.appendFileSync(LOG_FILE, line, 'utf-8');

    // Affichage console optionnel pour dev
    if (level === 'ERROR') {
      console.error(line.trim());
    } else if (level === 'WARN') {
      console.warn(line.trim());
    }
  } catch (err) {
    console.error('Échec d\'écriture du log technique :', err);
  }
}

/**
 * Récupère les N dernières lignes du fichier de log
 */
export function getRecentTechnicalLogs(maxLines = 100): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];

    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    return lines.slice(-maxLines);
  } catch (err) {
    console.error('Échec de lecture des logs récents :', err);
    return [];
  }
}

/**
 * Récupère le chemin absolu du fichier log pour téléchargement
 */
export function getLogFilePath(): string {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, `[${getLocalTimestamp()}] [INFO ] Fichier de journalisation initialisé.\n`, 'utf-8');
  }
  return LOG_FILE;
}

/**
 * Efface le contenu du fichier de log technique
 */
export function clearTechnicalLogs(): void {
  try {
    ensureLogDir();
    const timestamp = getLocalTimestamp();
    fs.writeFileSync(LOG_FILE, `[${timestamp}] [INFO ] Journal technique réinitialisé par l'administrateur.\n`, 'utf-8');
  } catch (err) {
    console.error('Échec de réinitialisation des logs :', err);
  }
}
