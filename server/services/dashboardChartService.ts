import puppeteer from 'puppeteer';

export interface DashboardExpenseSlice {
  label: string;
  amount: number;
  color: string;
  isSavings?: boolean;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function formatEuro(val: number): string {
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Génère le SVG du graphique en anneau : « Répartition des dépenses par catégories »
 * Représente les 6 catégories : Charges fixes, Charges variables, Dépenses courantes, Santé, Crédits, Épargne.
 * Dimensions par défaut : 920 x 480
 */
export function renderDashboardExpensesDonutSvg(data: DashboardExpenseSlice[], width = 920, height = 480): string {
  const activeItems = data.filter(d => d.amount > 0);
  const total = activeItems.reduce((s, d) => s + d.amount, 0);

  if (activeItems.length === 0 || total <= 0) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#ffffff" rx="8" stroke="#cbd5e1" stroke-width="1.5"/>
      <text x="${width / 2}" y="40" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#1e3a8a" text-anchor="middle">RÉPARTITION DES DÉPENSES PAR CATÉGORIES</text>
      <text x="${width / 2}" y="${height / 2}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Aucune sortie de fonds ou dépense active enregistrée sur cette période.</text>
    </svg>`;
  }

  const cx = 270;
  const cy = 250;
  const outerR = 145;
  const innerR = 80;

  let currentAngle = -Math.PI / 2;
  let pathsSvg = '';

  activeItems.forEach(d => {
    const sliceAngle = (d.amount / total) * 2 * Math.PI;
    const endAngle = currentAngle + sliceAngle;

    const x1_out = cx + outerR * Math.cos(currentAngle);
    const y1_out = cy + outerR * Math.sin(currentAngle);
    const x2_out = cx + outerR * Math.cos(endAngle);
    const y2_out = cy + outerR * Math.sin(endAngle);

    const x1_in = cx + innerR * Math.cos(endAngle);
    const y1_in = cy + innerR * Math.sin(endAngle);
    const x2_in = cx + innerR * Math.cos(currentAngle);
    const y2_in = cy + innerR * Math.sin(currentAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    const pathData = `M ${x1_out} ${y1_out} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2_out} ${y2_out} L ${x1_in} ${y1_in} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2_in} ${y2_in} Z`;
    pathsSvg += `<path d="${pathData}" fill="${d.color}" stroke="#ffffff" stroke-width="2.5" />`;

    currentAngle = endAngle;
  });

  // Légende sur la droite (2 colonnes si 6 items pour un affichage très aéré)
  const legCol1X = 490;
  const legCol2X = 710;
  let legendSvg = '';

  activeItems.forEach((d, idx) => {
    const colX = idx < 3 ? legCol1X : legCol2X;
    const rowY = 110 + (idx % 3) * 75;
    const pct = ((d.amount / total) * 100).toFixed(1);

    legendSvg += `
      <g transform="translate(${colX}, ${rowY})">
        <rect x="0" y="0" width="16" height="16" fill="${d.color}" rx="3" />
        <text x="26" y="13" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="600" fill="#1e293b">${escapeXml(d.label)}</text>
        <text x="26" y="32" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" fill="#475569">${formatEuro(d.amount)} (${pct} %)</text>
        ${d.isSavings ? `<text x="26" y="47" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10" italic="true" fill="#047857">Flux financier d'épargne nette</text>` : ''}
      </g>
    `;
  });

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#ffffff" rx="8" stroke="#cbd5e1" stroke-width="1.5"/>
    
    <!-- En-tête -->
    <text x="40" y="36" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#1e3a8a">RÉPARTITION DES DÉPENSES PAR CATÉGORIES</text>
    <text x="40" y="56" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" italic="true" fill="#64748b">Ventilation des sorties réelles du foyer et des versements nets d'épargne sur la période</text>

    <!-- Tranches de l'anneau -->
    ${pathsSvg}

    <!-- Centre du Donut -->
    <text x="${cx}" y="${cy - 8}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">TOTAL DÉCAISSÉ</text>
    <text x="${cx}" y="${cy + 16}" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="15" font-weight="bold" fill="#1e293b" text-anchor="middle">${formatEuro(total)}</text>

    <!-- Légende détaillée -->
    ${legendSvg}

    <!-- Note explicative sur l'épargne en bas -->
    <line x1="490" y1="365" x2="${width - 40}" y2="365" stroke="#e2e8f0" stroke-width="1" />
    <text x="490" y="385" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10.5" fill="#475569">* Note : Les versements vers l'épargne constituent un flux financier net et non une consommation.</text>
    <text x="490" y="402" font-family="'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10.5" fill="#475569">Les dépenses de santé sont comptabilisées nettes des remboursements reçus.</text>
  </svg>`;
}

/**
 * Génère l'image PNG haute résolution du graphique Donut du Dashboard
 */
export async function generateDashboardExpenseDonutPng(data: DashboardExpenseSlice[]): Promise<Buffer> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 920, height: 480, deviceScaleFactor: 2 });
    const svg = renderDashboardExpensesDonutSvg(data, 920, 480);
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:#ffffff;">${svg}</body></html>`;
    await page.setContent(html);
    const uint8 = await page.screenshot({ type: 'png', omitBackground: false });
    return Buffer.from(uint8);
  } finally {
    await browser.close();
  }
}
