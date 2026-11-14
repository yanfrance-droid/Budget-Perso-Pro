# Journal des Modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère à [Semantic Versioning (SemVer)](https://semver.org/spec/v2.0.0.html).

---

## [1.7.1] - 2026-11-14

### Fixed
- **Alignement inter-pages du calcul de `totalObligatoires` (`src/pages/Incomes.tsx`) :**
  - Retrait définitif de `+ transfer` (virements vers l'épargne) dans la formule des charges obligatoires de la page Revenus (`roundCurrency(fixed + variable + totalLoanPlanned)`).
  - Suppression de la divergence historique : le montant correspond désormais exactement aux **2 314,40 €** calculés sur le Dashboard (au lieu de 4 174,98 € avec l'épargne volontaire), restaurant la cohérence stricte du Reste à vivre brut théorique.
- **Ventilation dynamique sur la carte KPI « Total des charges obligatoires » (`src/pages/Dashboard.tsx`) :**
  - Remplacement du sous-titre générique obsolète (`Fixes, variables, crédit, épargne`) par la décomposition dynamique en temps réel affichant les 3 composantes réelles : `Fixes : {formatCurrency(chargesMois.fixed)} • Crédits : {formatCurrency(chargesMois.loan)} • Variables : {formatCurrency(chargesMois.variable)}`.
- **Actualisation des tests unitaires (`src/pages/Incomes.test.tsx`) :**
  - Mise à jour des assertions du Reste à vivre brut théorique pour valider formellement l'exclusion des flux d'épargne volontaire des charges obligatoires (675 tests au vert sur 70 suites).

---

## [1.7.0] - 2026-11-14

### Added
- **Console d'Intégrité DB Doctor & Safe Healer permanente et proactive (`src/pages/Settings.tsx`) :**
  - Affichage immédiat d'un cartouche d'information et d'état dès l'ouverture de la carte « Santé & Optimisation du fichier SQLite » (élimine toute perception de "fonction cachée ou fantôme").
  - Présentation explicite des deux moteurs : DB Doctor (audit 100 % passif en lecture seule) et Safe Healer (moteur chirurgical transactionnel avec simulation à blanc et sauvegarde atomique).
  - Explication pédagogique immédiate de la différence fondamentale entre le compactage physique `VACUUM` (disque, défragmentation des pages B-Tree, vidage du WAL) et l'audit logique `DB Doctor` (vérité financière et conformité relationnelle des données).
- **Indicateur d'état actif pour le DB Healer en santé nominale :**
  - Lorsque la base est 100 % saine (`totalAnomalies === 0`), affichage explicite du statut vert émeraude du DB Doctor doublé du statut bleu océan du DB Healer : « En veille active (Au repos — Aucune réparation requise) », attestant que le moteur est armé et prêt à intervenir.
- **Guide Opérationnel complet dans le Manuel d'Aide in-app (`activeSection === 'help'`) :**
  - Ajout d'une sous-section dédiée « Guide Opérationnel : DB Doctor & Safe Healer (Intégrité & Réparations Sécurisées) ».
  - Détail du protocole de réparation en 3 étapes : Détection passive -> Simulation à blanc (Dry-Run via Savepoint éphémère avec tableau de diff) -> Sauvegarde atomique préalable `VACUUM INTO` dans `data/backups/auto/` et application sous clés étrangères obligatoires (`PRAGMA foreign_key_check`).
  - Référentiel pliable et documenté des 13 sondes forensiques (`ANOM-01` à `ANOM-13`).
- **Enrichissement de la documentation de référence (`README.md`, `PROJECT_KNOWLEDGE.md`) :**
  - Ajout de la section 4 dans le `README.md` détaillant le fonctionnement de la console d'intégrité, la distinction `VACUUM` vs `DB Doctor`, et le cycle de vie du Safe Healer.
- **Tests & Assurance Qualité :**
  - Enrichissement de `Settings.test.tsx` pour valider la présence de la console proactive dès l'ouverture de l'onglet et le badge de veille du DB Healer.

---

## [1.6.3] - 2026-11-13

### Changed
- **Bandeaux d'en-tête pleins et contrastés pour les 4 cartes « Serveur & Synchro » (`src/pages/Settings.tsx`) :**
  - Remplacement des fonds translucides à 8 % par de **vrais bandeaux pleins, riches et immédiatement visibles** avec typographie blanche immaculée et pastille d'icône translucide :
    - *Base centralisée SQLite & Accès distant VPN* : bandeau bleu roi `#1d4ed8`, titre blanc pur, boutons de session en verre translucide avec texte blanc.
    - *Ressources système & Réseau Proxmox* : bandeau vert émeraude franc `#059669`, titre blanc pur, badge "Actif & Surveillé" intégré.
    - *Santé & Optimisation du fichier SQLite* : bandeau bleu océan dynamique `#0284c7`, titre blanc pur.
    - *Journal des événements techniques (Logs)* : bandeau violet franc `#7c3aed`, titre blanc pur et boutons d'action du journal en verre translucide blanc.
- **Refonte haute visibilité des boutons de navigation supérieure :**
  - Les boutons inactifs passent sur un fond doux surélevé (`#f1f5f9`), une bordure fine et conservent leur icône thématisée en couleur.
  - Le bouton actif s'illumine en **couleur pleine (Solid Badge)** avec texte blanc immaculé (`#ffffff`) et ombre portée douce, rendant l'onglet sélectionné 100 % indiscutable.
- **Éradication du cache persistant mobile & en-têtes HTTP anti-cache (`server/app.ts`) :**
  - Injection des en-têtes `Cache-Control: no-cache, no-store, must-revalidate` sur la racine et les pages `.html`.
  - Résout définitivement le problème de mise en cache agressive sur smartphones (iPhone / Android) où les anciens bundles restaient affichés après une mise à jour serveur.

---

## [1.6.2] - 2026-11-13

### Changed
- **Bandeaux d'en-tête teintés doux pour les 4 cartes « Serveur & Synchro » (`src/pages/Settings.tsx`) :**
  - Ajout d'un bandeau complet sur chaque en-tête de carte avec fond pastel (8 % d'opacité), bordure assortie (20 % d'opacité) et titre coloré gras contrasté pour une surbrillance douce et instantanément lisible :
    - *Base centralisée SQLite & Accès distant VPN* : bandeau bleu doux `rgba(59, 130, 246, 0.08)`, titre en bleu franc `#1d4ed8`.
    - *Ressources système & Réseau Proxmox* : bandeau émeraude doux `rgba(16, 185, 129, 0.08)`, titre en vert franc `#047857`.
    - *Santé & Optimisation du fichier SQLite* : bandeau bleu océan doux `rgba(2, 132, 199, 0.08)`, titre en bleu océan `#0284c7`.
    - *Journal des événements techniques (Logs)* : bandeau violet doux `rgba(139, 92, 246, 0.08)`, titre en violet franc `#6d28d9`.
- **Refonte ergonomique des boutons de navigation supérieure des Paramètres :**
  - Remplacement de l'ancien style transparent/bleu dur par un système de boutons à palette thématique douce et logique :
    - État inactif : fond doux surélevé (`--card-bg`), bordure subtile, texte net et accueillant (fini l'aspect fil de fer vide).
    - État actif : fond pastel teinté (10 % d'opacité), bordure thématique fine, texte richement coloré et ombre portée délicate.
    - Ajout de l'icône manquante `<Tag size={16} />` sur l'onglet *Catégories de budget*.
- **Pérennité & Fiabilité des Tests :**
  - Robustesse du test `Settings.test.tsx` face aux exécutions nocturnes à 23h (tolérance de collision d'horodatage sur le chiffre 23).
  - 100 % des 70 suites de tests validées (675 tests au vert).

---

## [1.6.1] - 2026-11-13

### Changed
- **Mise en valeur visuelle et ergonomique de l'onglet « Serveur & Synchro » (`src/pages/Settings.tsx`) :**
  - Découpage du bloc monolithique unique en **4 cartes distinctes** à bordure latérale douce et badges colorés pour une lisibilité immédiate :
    1. **Base centralisée SQLite & Accès distant VPN** : liseré bleu `#3b82f6`, badge icône serveur sur fond doux, cartouche de synchronisation et statut de connexion.
    2. **Ressources système & Réseau Proxmox** : liseré émeraude `#10b981`, badge activité, métriques conteneur temps réel (uptime, CPU, RAM, I/O réseau).
    3. **Santé & Optimisation du fichier SQLite** : liseré bleu ciel `#0284c7`, badge outil, diagnostic d'intégrité, tailles base et WAL.
    4. **Journal des événements techniques (Logs)** : liseré violet `#8b5cf6`, badge terminal, console dark monospace, actions et pied de page d'auteur.
  - **Coloration distinctive et visible des boutons d'action de la base de données :**
    - Bouton **Audit Intégrité (DB Doctor)** habillé d'un vert émeraude vibrant (`#059669`) avec ombre portée légère.
    - Bouton **Optimiser & Compacter (VACUUM)** habillé d'un bleu océan dynamique (`#0284c7`) avec ombre portée légère.
    - Bouton **Redémarrer le serveur** conservé en rouge de sécurité (`danger`).
- **Pérennité & Non-Régression :**
  - Maintien rigoureux de l'accessibilité ARIA et des rôles de boutons.
  - 100 % des tests unitaires et d'intégration validés (70 suites, 675 tests au vert).

---

## [1.6.0] - 2026-11-13

### Added
- **Moteur DB Doctor 100 % Lecture Seule (`server/services/dbDoctorService.ts`) :**
  - Audit forensic d'intégrité SQLite B-Tree (`PRAGMA quick_check(1)`) et détection des 13 anomalies structurelles réelles (`ANOM-01` à `ANOM-13`).
  - Zéro écriture, zéro effet de bord, analyse complète sans mutation.
  - Métriques d'intégrité temps réel avec ventilation SQL dynamique des 30 modèles de récurrence (23 charges fixes, 4 revenus, 1 dépense variable active, 2 contrats inactifs) et 496 transactions actives.
  - Exposition sécurisée via la route API `GET /api/maintenance/doctor` avec support du paramètre `referenceMonth`.
- **Moteur DB Healer Transactionnel & Réparations Sécurisées (`server/services/dbHealerService.ts`) :**
  - Mode simulation **Dry-Run 100 % passif** (`POST /api/maintenance/doctor/dry-run`) via Savepoint isolé avec rollback immédiat, restituant la table de diff exacte (`table`, `recordId`, `field`, `oldValue`, `newValue`, `action`) et le contre-audit prévisionnel.
  - Mode application chirurgicale sécurisée (`POST /api/maintenance/healer`) avec sauvegarde physique préalable atomique (`VACUUM INTO`), transaction isolée (`SAVEPOINT`), exécution sous `foreign_keys = ON`, validation de cohérence relationnelle (`PRAGMA foreign_key_check`), et contre-audit post-application strict avec rollback en cas d'erreur.
  - Résolution complète d'`ANOM-03` (rattachement à un prêt valide ou dissociation propre `linkedId = NULL`), politique anti-extinction totale sur les doublons `ANOM-09` (élection d'un `keepId` unique selon l'état `cleared` > `pending` > `isCustomized` > `planned` et purge douce uniquement des excédents `planned`), et interdiction formelle d'auto-réassignation aveugle sans compte bancaire cible (`ANOM-04`, `ANOM-05`).
- **Interface UI DB Doctor & Safe Healer (`src/pages/Settings.tsx` & `src/services/apiClient.ts`) :**
  - Refonte complète de la rubrique Maintenance : carte d'état de santé globale en temps réel (badge vert "100 % saine et intègre" ou alerte détaillée par niveau de gravité).
  - Cartouche de métriques d'intégrité avec répartition dynamique des 30 contrats sans valeurs en dur.
  - Formulaire d'arbitrage guidé pour les anomalies nécessitant un choix humain (comptes cibles, prêts cibles, arbitrage pointage vs corbeille pour les charges planifiées échues `ANOM-13`).
  - Modale de prévisualisation Dry-Run avec tableau de diff interactif et badge d'avertissement de sécurité.
  - Nouvelles méthodes API `apiClient.maintenance.getDoctorAudit`, `previewHealer` et `applyHealer`.

### Fixed
- **Sécurisation du Boot Système (Safe Boot) :**
  - Éradication de toute mutation silencieuse au démarrage (`server/db.ts`) : retrait de l'appel automatique à `repairOrphans(db)` dans `runStartupMaintenance`, tout en préservant la signature de retour `{ repaired: 0, purged }`.
  - Retrait de l'appel automatique à `rehabilitateOrphanRecurrentTransactions(db)` dans `runMigrations`, garantissant que le démarrage et les migrations sont 100 % passifs et non-destructifs.

### QA & Testing
- 13 tests unitaires exhaustifs pour le DB Doctor (`server/services/dbDoctorService.test.ts`).
- 10 tests de sécurité et d'atomicité pour le DB Healer (`server/services/dbHealerService.test.ts`).
- Tests d'intégration Front/Back de bout en bout dans `server/serverIntegration.test.ts` (GET doctor, POST dry-run, POST healer, avec nettoyage automatique de sauvegarde).
- 2 tests d'intégration React UI dans `src/pages/Settings.test.tsx` (audit initial et flux complet Dry-Run -> choix corbeille -> modale diff -> confirmation).
- 70 suites de tests Vitest, 675 tests au vert (100 % passants).

---

## [1.5.0] - 2026-11-12

### Added
- **Watchdog d'Intégrité Universel des Contrats (`src/engine/contractIntegrityEngine.ts`) :**
  - Audit d'intégrité contractuelle automatique couvrant l'ensemble des rubriques (charges fixes, variables récurrentes, revenus).
  - **Fidélité historique du dénominateur :** Prise en compte des factures passées scellées dont le contrat a été résilié ultérieurement (`totalExpected++` et `totalFound++`), maintenant un historique fidèle (`23/23` en Octobre, `22/22` en Novembre) sans faux positifs.
  - **Exclusion stricte des ponctuels :** Filtrage des opérations purement ponctuelles (sans `templateId` ni `recurrenceDay`) qui n'interfèrent plus dans les compteurs contractuels.
  - **Détection hybride des doublons & Clustering :** Regroupement par composantes connexes détectant les doublons par `templateId` ou par correspondance exacte libellé normalisé + montant absolu + jour d'échéance.
- **Interface Arbitrable & Nominative du Watchdog (`src/components/ContractIntegrityBanner.tsx` & `src/components/IntegritySectionBadge.tsx`) :**
  - Affichage nominatif et détaillé des doublons dans le tiroir de détails : `⚠️ Doublon : {label} ({amount} €) — {count} occurrences le {dates}`.
  - Infobulle enrichie sur les badges d'en-tête de section listant les doublons détectés.
  - Pastilles d'état d'intégrité par onglet et par rubrique (conforme / anomalie détectée).
  - Boutons d'arbitrage par contrat : régénération unitaire instantanée ou acceptation de l'écart.
  - Bouton global de synchronisation de l'horizon glissant sécurisé (ne descend jamais sous le mois courant).

### Fixed
- **Verrouillage Temporel du Passé en Lecture Seule :**
  - Blocage structurel côté backend dans `generateMonthlyOccurrences` et `syncRollingHorizon` interdisant toute génération d'occurrences sur un mois antérieur au mois civil en cours (`< 2026-11`).
  - Neutralisation des `useEffect` clients sur les 5 pages (`Dashboard`, `FixedExpenses`, `VariableExpenses`, `Incomes`, `Savings`) lors de la navigation dans les mois passés.
  - Éradication de la génération parasite de charges prévisionnelles passées et des faux « Impayés antérieurs ».
- **Suppression Atomique en 1 Clic sur Résiliation (`server/services/recurrenceService.ts`) :**
  - Dans `deleteRecurrenceTemplate(db, id, fromDate)`, lorsqu'une charge est déjà pointée (`cleared` ou `pending`) sur le mois sélectionné $M$, elle est immédiatement soft-deletée (`deleted_at = now, templateId = NULL`).
  - La charge disparaît instantanément de l'écran en un seul clic, éliminant le bug du double-clic (qui nécessitait un second clic de suppression sur la ligne orpheline).
  - Génération d'une seule entrée atomique dans la pile Undo pour l'ensemble de l'opération (suppression de 23 charges = exactement 23 Undos, et non 30).
- **Étanchéité Absolue du Passé (< M) & Sanctuarisation du Grand Livre (`server/services/recurrenceService.ts`) :**
  - Éradication définitive de la purge physique SQL sans filtre de date (`DELETE FROM transactions WHERE templateId = ?`).
  - Lors d'une résiliation à date d'effet $M$, la purge est strictement limitée aux occurrences futures prévisionnelles (`date >= fromDate AND status = 'planned'`). Les factures passées (`< fromDate`) ou déjà pointées (`cleared`, `pending`) sont 100 % intangibles et sanctuarisées.
- **Sécurisation de l'Interface Utilisateur (`src/pages/FixedExpenses.tsx`, `src/pages/VariableExpenses.tsx`) :**
  - Remplacement des choix trompeurs par deux options explicites et sûres : *« Choix 1 — Supprimer pour ce mois de {mois} uniquement »* (échéance ponctuelle) et *« Choix 2 — Résilier le contrat (à partir de {mois}) »* (résiliation sans altération de l'historique bancaire passé).
- **Snapshot Intégral Undo sur Résiliation & Restauration Fidèle (`src/contexts/ServerDataContext.tsx`) :**
  - Capture exhaustive de l'ensemble des transactions filles rattachées au contrat avant résiliation.
  - Lors de l'annulation (Undo), chaque transaction est restaurée avec son statut exact d'origine (`cleared`, `pending`, `planned`), interdisant toute rétrogradation en statut prévisionnel sur le Dashboard.
- **Assainissement Forensique de la Base Locale SQLite (`data/budget.db`) :**
  - Purge des 9 transactions prévisionnelles parasites passées (69,87 €).
  - Alignement des dates de démarrage des templates sur le mois courant (`2026-11`).
  - Vérification de l'intégrité globale : 0 orphelin, 0 impayé antérieur, 100 % conforme sur Octobre (`23/23`), Novembre (`23/23`), et Décembre (`23/23`).

### QA & Testing
- 8 tests complets du moteur d'intégrité contractuelle (`src/engine/contractIntegrityEngine.test.ts`).
- Tests de validation unitaire des 3 Invariants d'Or dans `server/services/recurrenceService.test.ts`.
- Tests de validation du Snapshot Intégral Undo sur résiliation dans `src/contexts/UndoRedoEngine.test.tsx`.
- 68 suites de tests Vitest, 649 tests au vert (100 % passants).

---

## [1.4.2] - 2026-11-11

### Fixed
- **Sentinelle Crash-Test (`src/engine/insightsEngine.ts`) :** Intégration des opérations au statut `pending` dont la date est échue (`date < currentDate`). Celles-ci sont désormais projetées immédiatement à la date du jour afin de fiabiliser le solde plancher prévisionnel face aux dépenses engagées non encore pointées.

### QA & Testing
- Ajout d'un test unitaire dédié dans `src/engine/insightsEngine.test.ts` validant la détection de découvert avec opération pending échue.
- 65 suites de tests Vitest, 627 tests au vert (100 % passants).

---

## [1.4.1] - 2026-11-11

### Added
- **Loans / Crédits :** Dedicated internal tab "[🚀 Trajectoire & Libération]" separating daily operations from strategic roadmap.
- **Loans / Crédits :** New component `LoanReleaseTimeline` displaying chronological debt freedom milestones (2028 to 2044).
- **Loans / Crédits :** Cumulative liberated monthly cash-flow calculation (+XX,XX €/mois) and projected residual debt ratio at each stage.
- **In-App Help :** Detailed documentation of release milestones and debt trajectory inside the collapsible guide (`src/pages/Loans.tsx`).

### Fixed
- **Loans / Crédits :** Harmonized HCSF status badge terminology with Dashboard (<30% now displays "Sain (< 30%)").

### QA & Testing
- Added 5 unit tests for timeline computation and tab switching (`src/components/loans/__tests__/LoanReleaseTimeline.test.tsx`).
- 65 test suites, 626 tests passing at 100%.

---

## [1.4.0] - 2026-11-11

### Added
- **Dashboard :** Widget KPI d'endettement du foyer avec suivi des normes HCSF (sain < 30 %, modéré 30-33 %, limite 33-35 %, élevé 35-45 %, critique ≥ 45 %).
- **Dashboard :** Découpe en temps réel entre dette patrimoniale (prêt immobilier) et endettement fractionné (crédits consommation).
- **Dashboard :** Synthèse du passif global (capital restant dû total et facture réelle résiduelle avec intérêts/assurances).
- **Insights Engine :** 3 sentinelles expertes d'anticipation des prêts (`auditConsumerDebtVulnerability` au seuil de 15 % des revenus, `auditLoanFreedomCountdown` pour le cash-flow libéré ≤ 3 mensualités, et `auditUpcomingLoanTiers` pour les variations de mensualité sous 60 jours).
- **Crédits & Prêts :** Bandeau macro d'amortissement pour les prêts immobiliers (`mortgage`) et encart d'électrochoc du « coût caché réel » (facture restante et perte sèche banque).
- **Crédits & Prêts :** Micro-barre bicolore de découpe de mensualité (capital utile vs coût banque).
- **Documentation :** Guide méthodologique interactif in-app (`src/pages/Loans.tsx`) expliquant les normes HCSF, la perte sèche et les formules de calcul.

### Fixed
- **Crédits & Prêts :** Cohérence arithmétique stricte du compteur d'échéances payées entre parenthèses (`effectivePrepaid = Math.max(0, prepaid + adjustment)`).
- **Crédits & Prêts :** Décalage temporel dynamique de la simulation actuarielle (`simStartMonth` à M+1) lorsque la mensualité courante est déjà pointée au statut `cleared`, supprimant tout double comptage.
- **Crédits & Prêts :** Alignement du compte à rebours de libération d'échéance sur le compteur contractuel issu de la base SQLite (`durationMonths - clearedPayments`).

### QA & Testing
- Ajout des suites de tests unitaires pour le widget KPI d'endettement (`DashboardDebtKpi.test.tsx`), les 3 sentinelles de prêts (`insightsEngine.test.ts`) et la décomposition actuarielle (`LoansCostBreakdown.test.tsx`).
- 64 suites de tests Vitest, **621 tests automatisés au vert (100 % passants)**.

---

## [1.3.9] - 2026-11-09

### Suivi des Fins de Contrat, Anticipation des Tacites Reconductions & Alertes Dashboard (Feature & Backend)
- **Modèle de données & Persistance SQLite (`server/db.ts`, `recurrenceService.ts`) :**
  - Ajout de la colonne optionnelle `contract_end_date TEXT DEFAULT NULL` (format `YYYY-MM-DD`) dans la table des récurrences / charges fixes (`recurrence_templates`).
  - Migration idempotente centralisée (`runMigrations`) ajoutant automatiquement la colonne sans perte de données sur les bases SQLite existantes.
  - Prise en compte intégrale du champ dans les fonctions CRUD, l'export/import JSON de sauvegarde et la synchronisation avec le frontend.
- **Interface Utilisateur (`src/pages/FixedExpenses.tsx`) :**
  - Saisie de la date d'expiration de contrat dans la modale d'ajout et d'édition des charges fixes avec libellé explicatif anti-reconduction tacite.
  - Affichage d'un indicateur visuel adaptatif et d'un compte à rebours sous le libellé dans le tableau des charges fixes :
    - Badge rouge d'urgence si le contrat est expiré (`Expiré (date)`).
    - Badge orange d'imminence si l'échéance arrive dans les 30 jours avec compte à rebours (`Fin : date (J-X)`).
    - Badge gris discret si l'échéance est lointaine (`Fin : date`).
- **Moteur d'Insights & Conseiller Financier (`src/engine/insightsEngine.ts`, `Dashboard.tsx`) :**
  - Ajout de la sentinelle `auditContractExpirations()` scannant les charges fixes actives possédant un `contract_end_date`.
  - Déclenchement automatique d'alertes hiérarchisées sur le Dashboard :
    - Niveau **Critique** si le contrat est déjà échu ou si l'échéance intervient sous 15 jours.
    - Niveau **Attention (Warning)** si l'échéance intervient entre 16 et 30 jours.
    - Redirection en un clic vers la gestion des charges fixes (`/charges-fixes`).
  - Intégration des modèles de récurrence dans le contexte central du conseiller financier (`insightsContext.templates`).
- **Couverture de tests Vitest (62 suites, 599 tests au vert) :**
  - Création de `server/contractExpiration.test.ts` validant la persistance SQLite, les migrations idempotentes et la résilience du snapshot export/import.
  - Ajout de 6 tests unitaires dans `src/engine/insightsEngine.test.ts` validant les seuils d'alertes J-X, contrats échus et l'intégration dans `generateInsights`.

---

## [1.3.8] - 2026-11-09

### Correction de l'Assiette du Matelas de Sécurité & Élimination de la Boucle Infinie (Bug Fix & Engine)
- **Exclusion formelle de l'épargne volontaire de l'assiette du matelas de précaution (`insightsEngine.ts`) :**
  - Introduction de la fonction `calculateEmergencyFundBaseline()` calculant l'autonomie financière strictement sur les charges incompressibles pures (charges fixes, variables de fonctionnement et mensualités d'emprunt).
  - Élimination de la boucle infinie (« le serpent qui se mord la queue ») où chaque virement vers un livret ou compte d'épargne gonflait artificiellement le total des charges et augmentait l'exigence du moteur de recommandation d'épargne.
  - Support de `chargesBreakdown` dans `InsightsContext` pour assainir et filtrer de manière déterministe tout flux de transfert d'épargne (`transfer`).
- **Harmonisation de la carte KPI « Charges obligatoires » (`Dashboard.tsx`) :**
  - Alignement de la formule de calcul de `totalObligatoires` avec son sous-titre UI « Fixes + Variables + Prêts » : suppression du terme `chargesMois.transfer` qui polluait le total des charges incompressibles.
  - Transmission propre de `chargesBreakdown: chargesMois` au contexte du conseiller financier (`insightsContext`).
- **Couverture de tests Vitest (589 tests au vert) :**
  - Ajout de tests ciblés dans `insightsEngine.test.ts` vérifiant l'exclusion absolue des flux d'épargne dans `calculateEmergencyFundBaseline()` et l'invariance stricte de l'autonomie calculée quel que soit l'effort d'épargne consenti.

---

## [1.3.7] - 2026-11-09

### Harmonisation Post-Contre-Audit (Docs, SQLite & Licence)
- **Harmonisation de la table de configuration SQLite (`PROJECT_KNOWLEDGE.md`) :**
  - Rectification de la désignation de la table `app_settings` pour correspondre exactement à son schéma physique en base SQLite (au lieu de la dénomination logique `settings`).
- **Alignement de la licence (`package.json`) :**
  - Mise à jour du champ `"license"` en `"MIT"` dans `package.json`, garantissant une cohérence parfaite à 100 % avec le fichier `LICENSE` et le `README.md`.

---

## [1.3.6] - 2026-11-09

### Base de Connaissance Vivante & Règles d'Or d'Ingénierie (Docs & Governance)
- **Création de la Base de Connaissance Vivante (`PROJECT_KNOWLEDGE.md`) :**
  - Fichier unique de référence documentant l'architecture globale (Frontend React 19, Backend natif Node.js sans Express, SQLite WAL).
  - Détail des 12 tables relationnelles et des flux critiques (Soft-Delete, Moteur Undo/Redo avec résilience et fallbacks, gestion de la récurrence anti-zombie, calculs financiers et règle d'or bancaire).
  - Documentation complète des gotchas / pièges à éviter (pas d'Express, isolation des origines localStorage, gestion du format des tags Git).
- **Règles d'or de gouvernance et de continuité (`AGENTS.md`, `.gemini/rules/versioning.md`) :**
  - Ajout des deux règles impératives imposant la lecture de `PROJECT_KNOWLEDGE.md` avant toute analyse ou modification de code, ainsi que sa mise à jour systématique à chaque commit ou release.

---

## [1.3.5] - 2026-11-09

### Fiabilisation Undo/Rollback sur Suppression de Charges & Restauration Payload (Fixed & Hardened)
- **Préservation de l'objet complet de la charge supprimée (`ServerDataContext.tsx`) :**
  - La fonction de suppression capture désormais l'objet complet de la transaction (`targetCopy`) dans la pile Undo plutôt que son simple identifiant.
  - La méthode `deleteTransaction` accepte aussi bien un identifiant chaîne qu'un objet `Transaction` complet pour éviter les désynchronisations de références.
- **Restauration bidirectionnelle & Fallback recréation (`ServerDataContext.tsx`, `server/app.ts`, `apiClient.ts`) :**
  - La commande `Undo` transmet l'objet complet en second paramètre à l'API de restauration (`POST /api/transactions/:id/restore`).
  - Côté serveur, si une charge a subi une purge physique préalable, l'API de restauration réinsère automatiquement et à l'identique la transaction avec son ID et ses attributs d'origine (`deleted_at: null`).
  - Fallback côté client : si l'API `restore` échoue avec une erreur HTTP, le client bascule automatiquement sur `apiClient.transactions.save` avec l'objet complet pour recréer l'opération sans bloquer.
- **Validation automatisée :**
  - Ajout du test ciblé n°11 dans `UndoRedoEngine.test.tsx` validant la restauration complète d'une charge existante supprimée.
  - Ajout du test d'intégration dans `softDeleteIntegration.test.ts` validant la recréation avec payload de secours lors d'un appel `/restore` sur une charge purgée physiquement.

---

## [1.3.4] - 2026-11-09

### Accès Réseau Local, Détection Dynamique d'Hôte & Sécurisation CORS (Fixed & Hardened)
- **Détection dynamique d'hôte et URL relatives (`apiClient.ts`) :**
  - Utilisation automatique de chemins relatifs (`/api/...`) lorsque l'application s'exécute sur la même origine, éliminant tout blocage lié aux IP en dur (`localhost` vs `192.168.0.59`).
  - Détection dynamique de l'hôte via `window.location.origin` et purge automatique d'éventuelles clés locales obsolètes pointant sur `localhost`.
- **CORS dynamique multi-appareils (`server/app.ts`) :**
  - Réflexion automatique de l'en-tête `Origin` du client avec `Access-Control-Allow-Credentials: true` et headers étendus (`Content-Type, Authorization, X-Requested-With, Accept, Origin`).
  - Prise en charge complète des requêtes preflight `OPTIONS` avec réponse 204 immédiate pour toutes les IP du réseau local.
- **Résilience d'authentification et gestion du 401 (`AuthContext.tsx`) :**
  - Émission et interception automatique de l'événement `auth:unauthorized` en cas de session expirée ou invalide, réaffichant proprement la modale de connexion plutôt que de bloquer l'application en mode "zombie".
  - Sécurisation du démarrage : ne force plus `isAuthenticated` à vrai en cas d'erreur réseau si aucun jeton valide n'existe.

---

## [1.3.3] - 2026-11-09

### Résilience Undo/Redo, Workflow de Suppression & Filtrage Mensuel (Fixed & Improved)
- **Moteur Undo/Redo résilient face aux erreurs 400 (`ServerDataContext.tsx`) :**
  - Gestion automatique des transactions introuvables en base (HTTP 400 sur `/restore`) : dépilage automatique des actions obsolètes sans bloquer l'utilisateur.
  - Sauvegarde et propagation du code HTTP (`err.status`) dans `apiClient.ts`.
  - Boutons Annuler / Rétablir de l'en-tête rendus réactifs et interactifs (`UndoRedoControls.tsx`) avec `stopPropagation` et `pointer-events: none` sécurisés sur les éléments enfants.
- **Suppression directe et élimination des charges zombies (`FixedExpenses.tsx`, `VariableExpenses.tsx`) :**
  - Suppression immédiate des charges sans bascule intempestive vers l'état "débité".
  - Nettoyage du filtre mensuel : les dépenses sans modèle ne sont plus projetées indûment sur les mois futurs.
  - Suppression définitive d'une récurrence purge complètement le modèle et toutes ses occurrences sur tous les mois et toutes les années.
  - Ajout d'un bouton de suppression rapide dans le bandeau des impayés antérieurs.
- **Rapports et arriérés sur les mois futurs (`Dashboard.tsx`) :**
  - Maintien rigoureux du calcul des impayés des mois antérieurs lors de la navigation dans les mois futurs.
- **Gestion des contrats et préavis d'engagement (`ChargesAnalysis.tsx`, `chargesAnalysisEngine.ts`) :**
  - Préavis rendu optionnel et initialisé à 0 par défaut pour les charges sans contrainte de résiliation.
  - Détection automatique des fenêtres de préavis et calcul précis de l'impact financier annuel post-promotionnel.

---

## [1.2.2] - 2026-11-07

### Sécurité, Robustesse Transactionnelle & Performance (Fixed & Optimized)
- **Neutralisation du double-amortissement lors de l'import (`migrationService.ts`) :**
  - Insertion directe et optimisée des transactions dans `importBackupData` pour respecter scrupuleusement le capital restant dû exporté dans le snapshot sans le déduire une seconde fois.
- **Blindage des transactions atomiques (`withTransaction`) :**
  - Encapsulation intégrale de `saveLoan` (création de prêt et palier initial de mensualité).
  - Encapsulation intégrale de `saveRecurrenceTemplate`, `deleteRecurrenceTemplate` et `generateMonthlyOccurrences` dans des transactions atomiques SQLite (`SAVEPOINT`).
- **Plafonnement au capital restant dû (`calculateAmortizedCapital`) :**
  - Limitation de la part amortie d'une échéance au capital restant dû réel du prêt (`Math.min(capitalPart, remaining)`), empêchant les amortissements fictifs supérieurs au solde lors de la dernière mensualité.
- **Protection anti-DoS sur les payloads HTTP (`readBody`) :**
  - Limitation stricte de la taille des requêtes entrantes (15 Mo max) avec rejet HTTP 413 (*Payload Too Large*) pour préserver la mémoire du serveur Node.
- **Indexation et Performance SQLite (`server/db.ts`) :**
  - Ajout des index de performance cruciaux : `idx_transactions_linked` (`linkedId`), `idx_transactions_dest_account` (`destinationAccountId`), `idx_transactions_payer` (`payerId`), `idx_transactions_account_date` (`accountId, date`), `idx_loans_account` (`accountId`), `idx_recurrence_account` (`accountId`), `idx_planned_expenses_category` (`categoryId`).
  - Suppression de l'index redondant sur clé primaire `idx_loan_capital_history_month`.
  - Configuration optimisée des PRAGMAs : `PRAGMA synchronous = NORMAL;`, `PRAGMA temp_store = MEMORY;`, `PRAGMA cache_size = -16000;`.
- **Intégrité des Catégories (`categoryService.ts`) :**
  - `deleteCategory` vérifie désormais `planned_expenses` et `recurrence_templates` en plus de `transactions` avant suppression, avec bascule automatique en archivage.
- **Résilience Frontend & UX (`ErrorBoundary.tsx` & `ServerDataContext.tsx`) :**
  - Refonte complète de `ErrorBoundary` : retrait de l'appel dev hardcodé (`localhost:5173`), écran de secours soigné en français avec boutons "Recharger" et "Tableau de bord".
  - Synchronisation réactive immédiate de `deleteTransaction` dans le contexte React pour détacher les transactions enfants en mémoire.

---

## [1.2.1] - 2026-11-07

### Sécurité & Intégrité des Données (Fixed & Hardened)
- **Sécurisation de la suppression de transactions (`deleteTransaction`) :**
  - Détachement automatique (`UPDATE transactions SET linkedId = NULL WHERE linkedId = ?`) des opérations filles (ex: remboursements santé rattachés) lors de la suppression unitaire d'une dépense de soin, empêchant l'apparition de `linkedId` orphelins.
- **Auto-Maintenance Industrielle des 12 Tables (`maintenanceService.ts`) :**
  - Détection et assainissement relationnel des vrais `linkedId` orphelins (`loan_payment` sans prêt associé, `health_reimbursement` sans dépense de soin associée).
  - Contrôle et détachement des `destinationAccountId` (virements) et `payerId` orphelins sur `transactions`.
  - Contrôle et détachement des `categoryId` orphelins sur `planned_expenses`.
  - Désactivation automatique et assainissement des modèles récurrents (`recurrence_templates`) rattachés à des comptes/payeurs supprimés ou arrivés à terme (`endDate < mois_courant`).
  - Purge des historiques de mensualités orphelins (`loan_payment_history`) et réajustement préventif des capitaux négatifs (`loans.remainingCapital < 0`).
  - Plafonnement de cohérence du capital amorti au montant de l'échéance (`amortizedCapital <= amount`).
  - Purge automatique des sessions expirées (`sessions.expires_at < datetime('now')`).
- **Routine Silencieuse au Démarrage (`initDatabase` / `runStartupMaintenance`) :**
  - Exécution systématique et idempotente de l'auto-maintenance à chaque initialisation de la base SQLite avec journalisation d'audit dans `technical.log`.

---

## [1.2.0] - 2026-11-07

### Ajouté (Added)
- **Conseiller Financier & Sentinelles Flash Insights** :
  - Création du moteur déterministe en mémoire `src/engine/insightsEngine.ts` garantissant un audit complet en moins de 2 ms, 100 % local et souverain (zéro appel API externe, confidentialité absolue).
  - Implémentation des 6 sentinelles financières pures :
    - `auditCrashTest` : Simulation intrajournalière jour par jour (débits avant crédits) et détection du solde creux jusqu'au prochain revenu majeur.
    - `auditIdleCash` : Détection des opportunités d'épargne basée **strictement** sur le solde prévisionnel net de fin de mois (fond de roulement de sécurité de 500 € déduit).
    - `auditDailyExpenseCadence` : Surveillance au prorata temporis du rythme des dépenses courantes par rapport à la moyenne des 3 derniers mois.
    - `auditSavingsOptimization` : Détection du dépassement des plafonds réglementés (Livret A à 22 950 €) et recommandation de réallocation.
    - `auditVariableChargesHealth` : Surveillance du dépassement de budget (> 15 %) sur les enveloppes variables.
    - `auditPendingHealthRefunds` : Détection des avances médicales en attente de remboursement depuis plus de 45 jours.
  - Composant visuel `DashboardInsightsWidget.tsx` intégré sur le Tableau de bord :
    - 4 niveaux de sévérité avec pastilles de couleur (`critical` rouge, `warning` ambre, `info` bleu, `success` émeraude).
    - Affichage priorisé Top 3 avec dépliage complet à la demande.
    - Masquage unitaire souverain conservé en `sessionStorage` avec bouton de réinitialisation.
    - Boutons d'action contextuelle vers les modules concernés (`/epargne`, `/sante`, `/emprunts`, `/depenses`, `/charges`).
- **Module Analyse Stratégique des Charges (`/analyse-charges`)** :
  - Création du moteur d'agrégation temporelle `src/engine/chargesAnalysisEngine.ts` (historique glissant 6 et 12 mois), strictement séparé de l'Analyse des Dépenses courantes.
  - Volet Charges Fixes : Calcul du Taux d'Effort Réel sur rentrées constatées (seuil d'alerte 33 %), détection automatique ligne par ligne des hausses de contrats (M vs M-1 vs moyenne 12 mois) et calcul immédiat de l'**impact financier annualisé** (+X €/an).
  - Volet Charges Variables : Confrontation Réalisé vs Budgété, règle de dérive chronique (> 15 % pendant 3 mois consécutifs) avec proposition de réévaluation, et repérage des pics saisonniers.
  - Interface dédiée `ChargesAnalysis.tsx` avec graphiques Recharts, sélecteurs temporels et tableau comparatif d'évolution.
  - Ajout de la route `/analyse-charges` et du lien dans la barre de navigation latérale de `App.tsx`.
- **Documentation & Expérience Utilisateur** :
  - Création du guide complet pas à pas `USER_GUIDE.md` à la racine du projet.
  - Réécriture et enrichissement intégral du `README.md` (architecture, qualité industrielle, règles bancaires).
  - Documentation exhaustive du script d'exploitation et de déploiement `gestion-personal-budget-pro.sh` (sauvegardes SQLite automatiques vérifiées par `integrity_check`, rebuilds Docker et healthchecks).
  - Enrichissement de la rubrique d'Aide intégrée dans l'application (`Settings.tsx` - section 8) avec guide de lecture du Conseiller, de l'Analyse des Charges et de la routine d'exploitation serveur.

### Modifié (Changed)
- Renforcement du test de micro-benchmark de performance dans `src/engine/insightsEngine.test.ts` avec phase d'échauffement JIT et moyenne sur 10 itérations, garantissant une exécution $< 2\text{ ms}$ sous contrainte multi-threads.
- Normalisation du typage dans `chargesAnalysisEngine.ts` pour supporter de manière hermétique les champs d'opérations (`label` et `description`).

### Tests & Qualité (Quality & Tests)
- Suite de tests Vitest enrichie : 533 tests automatisés répartis sur 53 suites de tests avec un taux de réussite de **100 %** et **0 régression**.
- Compilation TypeScript et Vite sans aucun avertissement.

---

## [1.1.4] - 2026-11-06

### Ajouté (Added)
- Composant universel de saisie financière `<AmountInput />` avec prise en charge native des séparateurs `.` et `,`, gestion optimisée du pavé numérique et étanchéité du focus.
- Verrou de sécurité contre les fermetures accidentelles par glisser-relâcher (`isMouseDownOnOverlayRef` / `drag-to-overlay`) sur l'ensemble des modales (`Components.tsx`) et tiroirs (`Savings.tsx`).
- Eradication intégrale des balises `<input type="number">` pour les montants financiers dans tout le code source.

### Modifié (Changed)
- Renforcement de la robustesse SQLite en mode WAL avec `busy_timeout = 5000` et synchronisation multi-clients.

---

## [1.1.3] - 2026-10-25

### Ajouté (Added)
- Mécanisme de sauvegarde quotidienne à chaud via `VACUUM INTO` avec rétention automatique sur 7 jours glissants.
- Procédure de copie préventive automatique avant toute opération de restauration de base de données.
- Module de gestion des emprunts et importation d'historique de capital en format CSV.
