/**
 * Utilitaires de dates en heure locale
 * Évite les décalages UTC provoqués par new Date().toISOString()
 * (qui affiche le mois ou le jour précédent en UTC+1/UTC+2 entre 00h et 01h/02h du matin).
 */

export function getCurrentMonth(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getCurrentDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateFr(isoDate?: string | null): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (parts.length === 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}
