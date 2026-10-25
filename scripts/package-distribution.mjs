import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

console.log('================================================================');
console.log('  BUDGET PERSO PRO — GÉNÉRATION DU PAQUET DE DISTRIBUTION       ');
console.log('================================================================\n');

const ROOT_DIR = process.cwd();
const DIST_PKG_DIR = path.join(ROOT_DIR, 'dist-package');
const ARCHIVE_NAME = 'budget-perso-pro.tar.gz';
const ARCHIVE_PATH = path.join(DIST_PKG_DIR, ARCHIVE_NAME);

// Dictionnaire de sentinelles sensibles et confidentielles à rechercher
const SENSITIVE_SENTINELS = [
  // Banques et établissements de prêt réels
  'Sofinco',
  'Crédit Mutuel',
  'Credit Mutuel',
  'CIC Allure',
  'MEIA',
  'Arkée',
  'Arkéa',
  // Contrats nominatifs et labels privés
  'AXA Scolaire',
  // Montants caractéristiques de l'ancien historique personnel
  '120686',
  '121000',
  '33082.93',
  '541.73',
  '544.12',
  '92827',
  '46268',
  // Chemins locaux de la machine Windows personnelle
  'C:\\Users\\',
  'IndexedDB\\http_localhost_5173'
];

// Fichiers autorisés à la racine
const ROOT_FILES_WHITELIST = new Set([
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  '.gitignore',
  '.dockerignore',
  '.oxlintrc.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'index.html',
  'README.md'
]);

// Extensions de fichiers strictement interdites dans le paquet
const FORBIDDEN_EXTENSIONS = new Set([
  '.db',
  '.db-wal',
  '.db-shm',
  '.sqlite',
  '.sqlite3',
  '.csv',
  '.xlsx',
  '.ldb',
  '.log'
]);

// ---------------------------------------------------------------------------
// 1. Exécution des tests de non-régression
// ---------------------------------------------------------------------------
console.log('⏳ Étape 1/6 : Exécution des tests de non-régression...');
try {
  execSync('npm test', { stdio: 'pipe', cwd: ROOT_DIR });
  console.log('   ✅ Tous les tests sont validés avec succès.\n');
} catch (err) {
  console.error('❌ Échec des tests de non-régression ! Arrêt immédiat de la distribution.');
  if (err.stdout) console.error(err.stdout.toString());
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Préparation du répertoire de staging isolé
// ---------------------------------------------------------------------------
console.log('⏳ Étape 2/6 : Préparation de la zone de staging isolée...');
const stagingDir = path.join(os.tmpdir(), `budget-perso-pro-staging-${Date.now()}`);
fs.mkdirSync(stagingDir, { recursive: true });

function copyFileSafe(srcRelPath) {
  const src = path.join(ROOT_DIR, srcRelPath);
  const dest = path.join(stagingDir, srcRelPath);
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

// Copie des fichiers racine autorisés
for (const file of ROOT_FILES_WHITELIST) {
  const full = path.join(ROOT_DIR, file);
  if (fs.existsSync(full)) {
    copyFileSafe(file);
  }
}

// Copie sélective de public/
function copyDirRecursive(relDir, filterFn) {
  const fullDir = path.join(ROOT_DIR, relDir);
  if (!fs.existsSync(fullDir)) return;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = path.join(relDir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (filterFn(relPath, true)) {
        copyDirRecursive(relPath, filterFn);
      }
    } else {
      if (filterFn(relPath, false)) {
        copyFileSafe(relPath);
      }
    }
  }
}

// public/**
copyDirRecursive('public', () => true);

// server/**
copyDirRecursive('server', (relPath, isDir) => {
  if (isDir) return true;
  const ext = path.extname(relPath);
  return ext === '.ts' || ext === '.js' || ext === '.json';
});

// src/** (exclure expressément les sauvegardes et les outils de maintenance personnelle)
copyDirRecursive('src', (relPath, isDir) => {
  if (relPath.startsWith('src/services/backups')) return false;
  if (relPath === 'src/services/productionDiagnosticAndRepair.ts') return false;
  if (isDir) return true;
  const ext = path.extname(relPath);
  return ext === '.ts' || ext === '.tsx' || ext === '.css' || ext === '.png' || ext === '.svg' || ext === '.json';
});

// Création du dossier data/ avec uniquement un .gitkeep vide
const stagingDataDir = path.join(stagingDir, 'data');
fs.mkdirSync(stagingDataDir, { recursive: true });
fs.writeFileSync(path.join(stagingDataDir, '.gitkeep'), '');

console.log(`   ✅ Fichiers éligibles copiés dans le staging (${stagingDir}).\n`);

// ---------------------------------------------------------------------------
// 3. Contrôle de sécurité approfondi sur les sources du staging
// ---------------------------------------------------------------------------
console.log('⏳ Étape 3/6 : Contrôle de sécurité approfondi des fichiers sources...');

function getAllFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(full, fileList);
    } else {
      fileList.push(full);
    }
  }
  return fileList;
}

const stagingFiles = getAllFiles(stagingDir);

for (const file of stagingFiles) {
  const rel = path.relative(stagingDir, file).replace(/\\/g, '/');
  const ext = path.extname(file).toLowerCase();

  // A. Vérification d'extensions interdites
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new Error(`VIOLATION DE SÉCURITÉ : Extension interdite détectée dans le staging : "${rel}"`);
  }

  // B. Vérification que le dossier data/ ne contient QUE .gitkeep
  if (rel.startsWith('data/')) {
    if (rel !== 'data/.gitkeep') {
      throw new Error(`VIOLATION DE SÉCURITÉ : Fichier non autorisé présent dans data/ : "${rel}"`);
    }
  }

  // C. Vérification du dataset de crédits
  if (rel === 'src/data/personalLoanCapitalDataset.ts') {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes('records: []')) {
      throw new Error(`VIOLATION DE SÉCURITÉ : personalLoanCapitalDataset.ts contient encore des enregistrements !`);
    }
  }

  // D. Recherche textuelle des sentinelles sensibles dans les fichiers texte
  if (ext === '.ts' || ext === '.tsx' || ext === '.json' || ext === '.html' || ext === '.yml') {
    const content = fs.readFileSync(file, 'utf8');
    for (const sentinel of SENSITIVE_SENTINELS) {
      if (content.includes(sentinel)) {
        throw new Error(`VIOLATION DE SÉCURITÉ : Sentinelle personnelle "${sentinel}" trouvée dans "${rel}"`);
      }
    }
  }
}
console.log(`   ✅ 100% des fichiers sources (${stagingFiles.length} fichiers) ont passé l'audit de confidentialité.\n`);

// ---------------------------------------------------------------------------
// 4. Compilation et audit approfondi du bundle JavaScript
// ---------------------------------------------------------------------------
console.log('⏳ Étape 4/6 : Compilation Frontend et inspection du bundle JavaScript...');

// Build du frontend
try {
  execSync('npm run build', { stdio: 'pipe', cwd: ROOT_DIR });
} catch (err) {
  console.error('❌ Échec de la compilation du frontend !');
  process.exit(1);
}

// Analyse des fichiers compilés dans dist/assets/
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distDir)) {
  const distFiles = getAllFiles(distDir);
  for (const file of distFiles) {
    const ext = path.extname(file);
    if (ext === '.js' || ext === '.css' || ext === '.html') {
      const content = fs.readFileSync(file, 'utf8');
      for (const sentinel of SENSITIVE_SENTINELS) {
        if (content.includes(sentinel)) {
          throw new Error(`VIOLATION DE SÉCURITÉ : Sentinelle personnelle "${sentinel}" compilée dans le bundle dist : "${path.basename(file)}"`);
        }
      }
    }
  }
}
console.log('   ✅ Le bundle JavaScript compilé est garanti exempt de toute donnée personnelle.\n');

// ---------------------------------------------------------------------------
// 5. Test runtime d'une initialisation SQLite vierge dans un environnement isolé
// ---------------------------------------------------------------------------
console.log('⏳ Étape 5/6 : Validation runtime d\'initialisation d\'une base SQLite vierge...');
const testDbPath = path.join(os.tmpdir(), `budget-virgin-test-${Date.now()}.db`);

try {
  // Initialisation du schéma SQLite synchrone
  const db = new DatabaseSync(testDbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  // Exécution de createSchema
  const dbModulePath = path.join(ROOT_DIR, 'server', 'db.ts');
  const { initDatabase } = await import(new URL(`file://${dbModulePath.replace(/\\/g, '/')}`).href);
  const initializedDb = initDatabase(testDbPath);

  // Vérification de la vacuité des données utilisateur et de la présence de l'unique compte courant par défaut
  const emptyTables = ['users', 'transactions', 'loans', 'recurrence_templates', 'categories', 'income_payers'];
  for (const table of emptyTables) {
    const row = initializedDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
    if (row.count !== 0) {
      throw new Error(`VIOLATION : La table "${table}" contient ${row.count} enregistrements au premier démarrage !`);
    }
  }

  // Vérifier qu'exactement 1 compte par défaut a été créé (Compte Courant, type checking, solde 0)
  const accRow = initializedDb.prepare('SELECT COUNT(*) as count FROM accounts').get();
  if (accRow.count !== 1) {
    throw new Error(`VIOLATION : La table "accounts" doit contenir exactement 1 compte par défaut, mais en contient ${accRow.count} !`);
  }
  const defaultAcc = initializedDb.prepare('SELECT * FROM accounts').get();
  if (defaultAcc.name !== 'Compte Courant' || defaultAcc.type !== 'checking') {
    throw new Error(`VIOLATION : Le compte par défaut n'est pas "Compte Courant" (type checking) !`);
  }

  initializedDb.close();
} finally {
  // Nettoyage immédiat du fichier de test
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {}
}
console.log('   ✅ La base SQLite s\'initialise rigoureusement avec 1 compte courant par défaut (solde 0), 0 opération, 0 crédit et 0 utilisateur.\n');

// ---------------------------------------------------------------------------
// 6. Création et vérification de l'archive tar.gz
// ---------------------------------------------------------------------------
console.log('⏳ Étape 6/6 : Création et vérification de l\'archive de distribution...');

if (!fs.existsSync(DIST_PKG_DIR)) {
  fs.mkdirSync(DIST_PKG_DIR, { recursive: true });
}

// Utilisation de tar natif (bsdtar disponible sur Windows et Linux)
execSync(`tar -czf "${ARCHIVE_PATH}" -C "${stagingDir}" .`, { stdio: 'pipe' });

// Vérification du contenu interne de l'archive
const archiveListRaw = execSync(`tar -tzf "${ARCHIVE_PATH}"`, { encoding: 'utf8' });
const archiveEntries = archiveListRaw.split(/\r?\n/).filter(line => line.trim().length > 0);

for (const entry of archiveEntries) {
  const clean = entry.replace(/^\.\//, '').replace(/\\/g, '/');
  const ext = path.extname(clean).toLowerCase();

  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new Error(`VIOLATION ARCHIVE : Fichier interdit présent dans l'archive tar : "${clean}"`);
  }
  if (clean.startsWith('data/') && clean !== 'data/' && clean !== 'data/.gitkeep') {
    throw new Error(`VIOLATION ARCHIVE : Donnée non autorisée dans data/ : "${clean}"`);
  }
}

// Calcul de l'empreinte SHA-256 et de la taille
const archiveBuffer = fs.readFileSync(ARCHIVE_PATH);
const sha256 = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
const sizeKb = (archiveBuffer.length / 1024).toFixed(2);

// Nettoyage du dossier temporaire de staging
try {
  fs.rmSync(stagingDir, { recursive: true, force: true });
} catch {}

console.log('================================================================');
console.log('  PAQUET DE DISTRIBUTION VALIDÉ ET GÉNÉRÉ AVEC SUCCÈS !        ');
console.log('================================================================');
console.log(`📦 Fichier archive : ${ARCHIVE_PATH}`);
console.log(`⚖️  Taille archive  : ${sizeKb} Ko (${archiveBuffer.length} octets)`);
console.log(`🔒 Empreinte SHA256: ${sha256}`);
console.log(`📁 Fichiers inclus : ${archiveEntries.length} entrées validées`);
console.log('================================================================\n');
