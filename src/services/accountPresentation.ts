import type { Account } from '../db/database';

/**
 * Résout de façon déterministe l'identifiant du compte courant principal actif.
 * Règle de résolution :
 * 1. Si primaryAccountId est fourni et correspond à un compte checking actif (non clôturé) -> c'est lui.
 * 2. Sinon, stratégie de transition sûre : le premier compte checking actif non clôturé.
 * 3. Si aucun compte checking actif n'existe -> null.
 */
export function resolvePrimaryAccountId(
  accounts: Account[] = [],
  configuredPrimaryId?: string | null
): string | null {
  const activeCheckingAccounts = accounts.filter(a => a.type === 'checking' && !a.isClosed);
  if (configuredPrimaryId && activeCheckingAccounts.some(a => a.id === configuredPrimaryId)) {
    return configuredPrimaryId;
  }
  return activeCheckingAccounts.length > 0 ? activeCheckingAccounts[0].id : null;
}

/**
 * Retourne le libellé qualifié du type de compte :
 * - « Compte courant principal » pour le compte principal actif
 * - « Compte courant secondaire » pour tout autre compte courant (ou compte courant clôturé)
 * - Le nom du livret / sous-type pour un compte d'épargne (ex: « Livret A », « LDDS »)
 * - « Espèces / Manuel » pour un compte cash
 */
export function getAccountTypeLabel(
  account: Account,
  configuredPrimaryId?: string | null,
  allAccounts?: Account[]
): string {
  if (account.type === 'checking') {
    const primaryId = resolvePrimaryAccountId(allAccounts || [account], configuredPrimaryId);
    if (primaryId && account.id === primaryId) {
      return 'Compte courant principal';
    }
    return 'Compte courant secondaire';
  }

  if (account.type === 'cash') {
    return 'Espèces / Manuel';
  }

  // Comptes d'épargne : sous-types connus ou personnalisés
  if (account.subType) {
    switch (account.subType) {
      case 'livret_a': return 'Livret A';
      case 'lep': return 'LEP — Livret d’épargne populaire';
      case 'ldds': return 'LDDS — Livret de développement durable et solidaire';
      case 'livret_jeune': return 'Livret jeune';
      case 'livret_bancaire': return 'Livret bancaire';
      case 'pel': return 'PEL — Plan d’épargne logement';
      case 'cel': return 'CEL — Compte épargne logement';
      case 'assurance_vie': return 'Assurance-vie';
      case 'pea': return 'PEA — Plan d’épargne en actions';
      case 'compte_a_terme': return 'Compte à terme';
      case 'pee': return 'PEE — Plan d’épargne entreprise';
      case 'perco': return 'PERCO';
      case 'pereco': return 'PERECO — Plan d’épargne retraite d’entreprise collectif';
      default: return account.subType;
    }
  }

  // Détection heuristique si pas de subType
  const lowerName = account.name.toLowerCase();
  if (lowerName.includes('livret a')) return 'Livret A';
  if (lowerName.includes('lep')) return 'LEP — Livret d’épargne populaire';
  if (lowerName.includes('ldds') || lowerName.includes('ldd')) return 'LDDS — Livret de développement durable et solidaire';
  if (lowerName.includes('pel')) return 'PEL — Plan d’épargne logement';
  if (lowerName.includes('cel')) return 'CEL — Compte épargne logement';
  if (lowerName.includes('assurance-vie') || lowerName.includes('assurance vie')) return 'Assurance-vie';
  if (lowerName.includes('pea')) return 'PEA — Plan d’épargne en actions';

  return 'Compte d\'épargne';
}

/**
 * Formate le libellé complet pour les options de formulaires et sélecteurs :
 * Ex : « Boursorama (Compte courant principal) »
 * Ex : « Revolut (Compte courant secondaire) »
 * Ex : « Mon Livret A (Livret A) »
 * Ex : « Ancien Compte (Compte courant secondaire) (clôturé) »
 */
export function formatAccountOptionLabel(
  account: Account,
  configuredPrimaryId?: string | null,
  allAccounts?: Account[]
): string {
  const typeLabel = getAccountTypeLabel(account, configuredPrimaryId, allAccounts);
  return `${account.name} (${typeLabel})${account.isClosed ? ' (clôturé)' : ''}`;
}
