export interface LoanCapitalRecordData {
  month: string;
  realEstateCapital: number | null;
  realEstateMonthlyPayment: number | null;
  consumerCapital: number | null;
  consumerMonthlyPayment: number | null;
  notes?: string | null;
}

export interface CsvParseResult {
  records: LoanCapitalRecordData[];
  errors: string[];
  delimiter: ';' | ',';
  totalLines: number;
}

/**
 * Normalise les en-têtes reconnus (français et anglais).
 * Règle stricte : pas d'assignation approximative pour éviter les ambiguïtés.
 */
function normalizeHeader(raw: string): string {
  const clean = raw.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime accents (crédit -> credit)
    .replace(/[^a-z0-9]/g, ''); // Garde alphanumérique

  // Mois
  if (['month', 'mois', 'date', 'periode', 'anmois'].includes(clean)) {
    return 'month';
  }

  // Capital Prêt Immobilier
  if ([
    'mortgagecapital', 'realestatecapital', 'capitalimmo', 'capitalimmobilier',
    'capitalrestantduimmo', 'capitalrestantduimmobilier', 'capitalpretimmo', 'crdmp', 'crdimmo', 'pretimmo', 'immo'
  ].includes(clean)) {
    return 'realEstateCapital';
  }

  // Mensualité Prêt Immobilier
  if ([
    'mortgagemonthlypayment', 'realestatemonthlypayment', 'mensualiteimmo',
    'mensualiteimmobilier', 'echeanceimmo', 'mensimmo', 'mensualitepretimmo'
  ].includes(clean)) {
    return 'realEstateMonthlyPayment';
  }

  // Capital Crédits Consommation
  if ([
    'consumercapital', 'capitalconso', 'capitalconsommation',
    'capitalrestantduconso', 'capitalrestantduconsommation', 'capitalcreditsconso', 'capitalcreditconso', 'crdconso', 'creditsconso', 'conso'
  ].includes(clean)) {
    return 'consumerCapital';
  }

  // Mensualité Crédits Consommation
  if ([
    'consumermonthlypayment', 'mensualiteconso', 'mensualiteconsommation',
    'echeanceconso', 'mensconso', 'mensualitecreditconso', 'mensualitecreditsconso'
  ].includes(clean)) {
    return 'consumerMonthlyPayment';
  }

  // Notes / Remarques
  if (['notes', 'note', 'remarques', 'remarque', 'commentaire', 'commentaires'].includes(clean)) {
    return 'notes';
  }

  return raw.trim();
}

/**
 * Normalise un format de mois AAAA-MM ou MM/AAAA vers AAAA-MM
 */
export function normalizeMonth(raw: string): string | null {
  const s = raw.trim();
  // Format ISO : YYYY-MM ou YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.].*)?$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${m}`;
    }
  }

  // Format français usuel : MM/YYYY ou MM-YYYY
  const frMatch = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (frMatch) {
    const m = frMatch[1].padStart(2, '0');
    const y = frMatch[2];
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${m}`;
    }
  }

  return null;
}

/**
 * Analyse un nombre à la française (virgule décimale, espaces de milliers) ou standard
 */
export function parseFrenchNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim()
    .replace(/€/g, '')
    .replace(/\s/g, '') // Espace de séparation de milliers (insécable ou normal)
    .replace(/\u00a0/g, '')
    .replace(/\u202f/g, '');

  if (s === '' || s === '-' || s.toLowerCase() === 'null') return null;

  // Si contient une virgule décimale (ex: "120372,90"), remplacer par un point
  const normalized = s.replace(',', '.');
  const num = Number(normalized);
  if (isNaN(num)) {
    return NaN;
  }
  return Math.round(num * 100) / 100;
}

/**
 * Découpe une ligne CSV en tenant compte des guillemets éventuels
 */
export function splitCsvLine(line: string, delimiter: ';' | ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Sauter l'échappement
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Détecte le délimiteur le plus probable (; ou ,) à partir de la première ligne
 */
export function detectDelimiter(firstLine: string): ';' | ',' {
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semiCount >= commaCount ? ';' : ',';
}

/**
 * Analyse un contenu CSV complet et retourne les relevés validés ou les erreurs bloquantes.
 */
export function parseLoanCapitalCsv(content: string): CsvParseResult {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const errors: string[] = [];

  if (lines.length === 0) {
    return { records: [], errors: ['Le fichier CSV est vide.'], delimiter: ';', totalLines: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headerCells = splitCsvLine(lines[0], delimiter);
  const expectedColumnCount = headerCells.length;
  const normalizedHeaders = headerCells.map(normalizeHeader);

  const monthIdx = normalizedHeaders.indexOf('month');
  if (monthIdx === -1) {
    return {
      records: [],
      errors: [`Colonne obligatoire de mois introuvable dans l'en-tête (en-têtes reconnus : "month", "mois", "date", "période"). En-têtes trouvés : [${headerCells.join(', ')}]`],
      delimiter,
      totalLines: lines.length
    };
  }

  const immoCapIdx = normalizedHeaders.indexOf('realEstateCapital');
  const immoPayIdx = normalizedHeaders.indexOf('realEstateMonthlyPayment');
  const consoCapIdx = normalizedHeaders.indexOf('consumerCapital');
  const consoPayIdx = normalizedHeaders.indexOf('consumerMonthlyPayment');
  const notesIdx = normalizedHeaders.indexOf('notes');

  const records: LoanCapitalRecordData[] = [];
  const seenMonths = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cells = splitCsvLine(lines[i], delimiter);

    // Si ligne complètement vide
    if (cells.every(c => c === '')) continue;

    // Contrôle strict de structure : chaque ligne doit avoir exactement le même nombre de colonnes que l'en-tête
    if (cells.length !== expectedColumnCount) {
      errors.push(`Ligne ${lineNum} : Nombre de colonnes incorrect (${cells.length} trouvée(s), ${expectedColumnCount} attendue(s)). Vérifiez le séparateur ou les décimales à virgule non protégées par des guillemets.`);
      continue;
    }

    const rawMonth = cells[monthIdx] || '';
    const normMonth = normalizeMonth(rawMonth);
    if (!normMonth) {
      errors.push(`Ligne ${lineNum} : Format de mois invalide "${rawMonth}". Formats acceptés : AAAA-MM ou MM/AAAA.`);
      continue;
    }

    if (seenMonths.has(normMonth)) {
      errors.push(`Ligne ${lineNum} : Doublon détecté pour le mois "${normMonth}". Chaque mois doit être unique.`);
      continue;
    }
    seenMonths.add(normMonth);

    // Extraction et validation des montants
    const rawImmoCap = immoCapIdx !== -1 ? cells[immoCapIdx] : null;
    const immoCap = parseFrenchNumber(rawImmoCap);
    if (immoCap !== null && isNaN(immoCap)) {
      errors.push(`Ligne ${lineNum} (${normMonth}) : Valeur invalide pour le capital immobilier "${rawImmoCap}". Nombre attendu.`);
    }

    const rawImmoPay = immoPayIdx !== -1 ? cells[immoPayIdx] : null;
    const immoPay = parseFrenchNumber(rawImmoPay);
    if (immoPay !== null && isNaN(immoPay)) {
      errors.push(`Ligne ${lineNum} (${normMonth}) : Valeur invalide pour la mensualité immobilière "${rawImmoPay}". Nombre attendu.`);
    }

    const rawConsoCap = consoCapIdx !== -1 ? cells[consoCapIdx] : null;
    const consoCap = parseFrenchNumber(rawConsoCap);
    if (consoCap !== null && isNaN(consoCap)) {
      errors.push(`Ligne ${lineNum} (${normMonth}) : Valeur invalide pour le capital consommation "${rawConsoCap}". Nombre attendu.`);
    }

    const rawConsoPay = consoPayIdx !== -1 ? cells[consoPayIdx] : null;
    const consoPay = parseFrenchNumber(rawConsoPay);
    if (consoPay !== null && isNaN(consoPay)) {
      errors.push(`Ligne ${lineNum} (${normMonth}) : Valeur invalide pour la mensualité consommation "${rawConsoPay}". Nombre attendu.`);
    }

    const notes = notesIdx !== -1 && cells[notesIdx] ? cells[notesIdx].trim() : null;

    if (errors.length === 0) {
      records.push({
        month: normMonth,
        realEstateCapital: immoCap,
        realEstateMonthlyPayment: immoPay,
        consumerCapital: consoCap,
        consumerMonthlyPayment: consoPay,
        notes
      });
    }
  }

  // Tri chronologique
  records.sort((a, b) => a.month.localeCompare(b.month));

  return {
    records: errors.length === 0 ? records : [],
    errors,
    delimiter,
    totalLines: lines.length - 1
  };
}
