import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { seedDemoDatabase } from './seed-demo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DEMO_DB_PATH = path.resolve(ROOT_DIR, 'data/budget.demo.db');
const DOCS_DIR = path.resolve(ROOT_DIR, 'docs/screenshots');
const DESKTOP_DIR = path.join(DOCS_DIR, 'desktop');
const MOBILE_DIR = path.join(DOCS_DIR, 'mobile');
const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

// Attente active que le serveur réponde sur /api/health
function waitForServer(port: number, maxTries = 30, delayMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      tries++;
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (tries >= maxTries) {
          reject(new Error(`Le serveur sur le port ${port} a retourné le code HTTP ${res.statusCode}`));
        } else {
          setTimeout(check, delayMs);
        }
      });
      req.on('error', () => {
        if (tries >= maxTries) {
          reject(new Error(`Délai d'attente dépassé pour le serveur sur le port ${port}`));
        } else {
          setTimeout(check, delayMs);
        }
      });
    };
    check();
  });
}

async function main() {
  console.log('=================================================================');
  console.log('🚀 CAMPAGNE DE CAPTURES D’ÉCRAN HEADLESS (Desktop & iPhone)');
  console.log('=================================================================');

  // 1. Initialisation de la base démo étanche
  seedDemoDatabase(DEMO_DB_PATH);

  // 2. Création de l'arborescence docs/screenshots/
  fs.mkdirSync(DESKTOP_DIR, { recursive: true });
  fs.mkdirSync(MOBILE_DIR, { recursive: true });

  // 3. Lancement du serveur temporaire sur le port 3099 pointé sur budget.demo.db
  console.log(`[Server] Démarrage du serveur Node.js sur le port ${PORT}...`);
  const serverProc = spawn('node', ['server/index.ts'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: DEMO_DB_PATH,
      STATIC_DIR: path.resolve(ROOT_DIR, 'dist')
    },
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[Server] ${msg}`);
  });

  serverProc.stderr.on('data', (d) => {
    console.error(`[Server ERR] ${d.toString().trim()}`);
  });

  try {
    await waitForServer(PORT);
    console.log(`[Server] ✅ Serveur opérationnel sur ${BASE_URL}`);

    // 4. Lancement de Puppeteer
    console.log('[Puppeteer] Lancement du navigateur Chromium headless...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
      ]
    });

    const setupAuthAndStyles = async (page: any) => {
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('budget_server_token', 'demo-session-token-1234567890');
        localStorage.setItem('budget_server_url', 'http://localhost:3099');
        localStorage.setItem('theme', 'light');
        localStorage.setItem('isPrivacyMode', 'false');
      });
    };

    const waitStable = async (page: any, extraMs = 500) => {
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForSelector('.recharts-surface, .card, table', { timeout: 4000 }).catch(() => {});
      await new Promise(r => setTimeout(r, extraMs));
    };

    // =========================================================================
    // SÉRIE 1 : DESKTOP (1920x1080 @2x)
    // =========================================================================
    console.log('\n--- CAPTURE DE LA SÉRIE DESKTOP (1920x1080) ---');
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    });
    await setupAuthAndStyles(desktopPage);

    const desktopScreenshots = [
      { id: 'desktop-01-dashboard.png', path: '/', label: 'Tableau de bord général' },
      { id: 'desktop-02-loans-active.png', path: '/credits', label: 'Crédits actifs & Jauges' },
      { 
        id: 'desktop-03-loans-timeline.png', 
        path: '/credits', 
        label: 'Trajectoire & Libération (Frise)',
        action: async (p: any) => {
          // Clic sur l'onglet Trajectoire & Libération
          const clicked = await p.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => b.textContent && b.textContent.includes('Trajectoire & Libération'));
            if (target) {
              target.click();
              return true;
            }
            return false;
          });
          if (clicked) await new Promise(r => setTimeout(r, 600));
        }
      },
      { id: 'desktop-04-health.png', path: '/sante', label: 'Cycle Santé & Reste à charge' },
      { id: 'desktop-05-current-expenses.png', path: '/depenses-courantes', label: 'Dépenses courantes & Pointage' },
      { id: 'desktop-06-fixed-expenses.png', path: '/charges-fixes', label: 'Charges fixes & Engagements' },
      { id: 'desktop-07-variable-expenses.png', path: '/charges-variables', label: 'Charges variables & Enveloppes' },
      { id: 'desktop-08-future-expenses.png', path: '/depenses-futures', label: 'Dépenses futures (Échéancier)' },
      { id: 'desktop-09-projects-wishlist.png', path: '/mes-projets', label: 'Projets & Wishlist' },
      { id: 'desktop-10-expense-analysis.png', path: '/analyse-depenses', label: 'Analyse des dépenses (Donut Recharts)' },
      { id: 'desktop-11-charges-analysis.png', path: '/analyse-charges', label: 'Analyse des charges & Inflation' },
      { id: 'desktop-12-savings.png', path: '/epargne', label: 'Épargne & Plafonds livrets' },
      { 
        id: 'desktop-13-settings-server.png', 
        path: '/parametres', 
        label: 'Administration Serveur & SQLite WAL',
        action: async (p: any) => {
          await p.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const srvBtn = btns.find(b => b.textContent && b.textContent.includes('Serveur'));
            if (srvBtn) srvBtn.click();
          });
          await new Promise(r => setTimeout(r, 600));
        }
      },
      { 
        id: 'desktop-14-settings-backup.png', 
        path: '/parametres', 
        label: 'Sauvegardes & Restauration SQLite',
        action: async (p: any) => {
          await p.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const bkpBtn = btns.find(b => b.textContent && b.textContent.includes('Sauvegardes'));
            if (bkpBtn) bkpBtn.click();
          });
          await new Promise(r => setTimeout(r, 600));
        }
      }
    ];

    for (const item of desktopScreenshots) {
      console.log(`📸 [Desktop] Capture de ${item.id} (${item.label})...`);
      await desktopPage.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle0', timeout: 15000 });
      if (item.action) {
        await item.action(desktopPage);
      }
      await waitStable(desktopPage, 500);
      const outPath = path.join(DESKTOP_DIR, item.id);
      await desktopPage.screenshot({ path: outPath, fullPage: false });
    }

    await desktopPage.close();

    // =========================================================================
    // SÉRIE 2 : MOBILE IPHONE 14 PRO (393x852 @3x)
    // =========================================================================
    console.log('\n--- CAPTURE DE LA SÉRIE MOBILE IPHONE (393x852) ---');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({
      width: 393,
      height: 852,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });
    await setupAuthAndStyles(mobilePage);

    const mobileScreenshots = [
      { id: 'mobile-01-dashboard.png', path: '/', label: 'Dashboard Mobile' },
      { 
        id: 'mobile-02-loans-timeline.png', 
        path: '/credits', 
        label: 'Frise Trajectoire Mobile',
        action: async (p: any) => {
          await p.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => b.textContent && b.textContent.includes('Trajectoire & Libération'));
            if (target) target.click();
          });
          await new Promise(r => setTimeout(r, 600));
        }
      },
      { id: 'mobile-03-loans-active.png', path: '/credits', label: 'Crédits Actifs Mobile' },
      { id: 'mobile-04-health.png', path: '/sante', label: 'Pôle Santé Mobile' },
      { id: 'mobile-05-current-expenses.png', path: '/depenses-courantes', label: 'Dépenses Courantes Mobile' },
      { id: 'mobile-06-variable-expenses.png', path: '/charges-variables', label: 'Charges Variables Mobile' },
      { id: 'mobile-07-savings.png', path: '/epargne', label: 'Épargne Mobile' }
    ];

    for (const item of mobileScreenshots) {
      console.log(`📱 [Mobile] Capture de ${item.id} (${item.label})...`);
      await mobilePage.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle0', timeout: 15000 });
      if (item.action) {
        await item.action(mobilePage);
      }
      await waitStable(mobilePage, 500);
      const outPath = path.join(MOBILE_DIR, item.id);
      await mobilePage.screenshot({ path: outPath, fullPage: false });
    }

    await mobilePage.close();
    await browser.close();
    console.log('\n✅ [Puppeteer] Campagne de captures terminée avec succès !');

  } finally {
    // 5. Arrêt propre du serveur de test
    console.log('[Server] Arrêt du serveur de test...');
    serverProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('❌ Erreur critique lors de la génération des captures :', err);
  process.exit(1);
});
