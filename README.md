# Personal Budget Pro (v1.2.0)

**Personal Budget Pro** est une application web auto-hébergée de haute précision pour la gestion, l'anticipation budgétaire et le pilotage patrimonial personnel.

Conçue selon les standards d'intégrité les plus rigoureux, elle garantit une **souveraineté totale des données** (zéro cloud externe, zéro télémétrie, zéro dépendance opaque), une **fiabilité mathématique absolue** (gestion stricte des arrondis au centime IEEE 754) et une **résilience système éprouvée** (moteur SQLite WAL multi-accès, sauvegardes automatiques à chaud et suite de 533 tests automatisés).

---

## Sommaire

1. [Présentation générale](#1-présentation-générale)
2. [Nouveautés majeures v1.2.0 : Pilotage & Anticipation](#2-nouveautés-majeures-v120--pilotage--anticipation)
   - [2.1. Conseiller Financier & Sentinelles Flash Insights](#21-conseiller-financier--sentinelles-flash-insights)
   - [2.2. Analyse Stratégique des Charges (Fixes & Variables)](#22-analyse-stratégique-des-charges-fixes--variables)
3. [Guide utilisateur au quotidien](#3-guide-utilisateur-au-quotidien)
4. [Comprendre les indicateurs financiers & la règle d'or bancaire](#4-comprendre-les-indicateurs-financiers--la-règle-dor-bancaire)
5. [Statuts des opérations & cycle de vie](#5-statuts-des-opérations--cycle-de-vie)
6. [Architecture logicielle & Qualité industrielle](#6-architecture-logicielle--qualité-industrielle)
7. [Sauvegardes, intégrité & résilience SQLite](#7-sauvegardes-intégrité--résilience-sqlite)
8. [Déploiement avec Docker & Proxmox](#8-déploiement-avec-docker--proxmox)
9. [Exploitation & Déploiement Automatisé (Script Shell)](#9-exploitation--déploiement-automatisé-script-shell)
10. [Administration, maintenance & diagnostics](#10-administration-maintenance--diagnostics)
11. [Sécurité & Accès à distance](#11-sécurité--accès-à-distance)
12. [Foire Aux Questions (FAQ)](#12-foire-aux-questions-faq)

---

## 1. Présentation générale

Personal Budget Pro regroupe l'intégralité du cycle financier du foyer :
- **Comptes bancaires & Trésorerie :** comptes courants, livrets d'épargne réglementés, cartes à débit différé et comptes d'attente.
- **Revenus & Organismes :** salaires, pensions, allocations, primes, associés à des tiers verseurs et récurrences automatiques.
- **Charges fixes :** loyers, abonnements, assurances, impôts et contrats incompressibles.
- **Charges variables :** enveloppes budgétaires identifiées (carburant, énergie, entretien véhicule).
- **Dépenses courantes :** alimentation, loisirs, tickets du quotidien et sorties avec suivi d'enveloppe.
- **Projets & Prévisions :** planification d'achats futurs avec ordonnancement par criticité.
- **Santé & Reste à charge :** suivi du circuit de remboursement (CPAM / Mutuelle) et détection des restes à charge orphelins.
- **Crédits & Désendettement :** amortissement réel, coût global, historique de capital restant dû sur 10 ans et simulations.
- **Épargne & Virements internes :** étanchéité parfaite entre constitution d'épargne (enrichissement) et mobilisation de trésorerie interne.

### Stack Technologique

- **Frontend :** React 19, TypeScript strict, Vite, Lucide Icons, Recharts.
- **Backend :** Node.js 24 (Alpine), Express, TypeScript.
- **Stockage :** SQLite 3 natif (`node:sqlite`) configuré en mode WAL haute performance.
- **Conteneurisation :** Docker multi-stage build optimisé (< 150 Mo).
- **Assurance Qualité :** 533 tests unitaires et d'intégration Vitest (100 % de réussite).

---

## 2. Nouveautés majeures v1.2.0 : Pilotage & Anticipation

La version **1.2.0** marque un tournant stratégique dans l'application en intégrant deux modules majeurs d'aide à la décision financière, conçus sans aucun compromis sur la confidentialité :

### 2.1. Conseiller Financier & Sentinelles Flash Insights

Situé en haut du Tableau de bord, le widget **Flash Insights** (`DashboardInsightsWidget.tsx`) est piloté par un moteur heuristique pur en mémoire (`src/engine/insightsEngine.ts`). Il exécute un audit algorithmique complet en **moins de 2 millisecondes**, sans aucune latence perceptible ni dépendance externe.

```
                    ┌──────────────────────────────────────────────┐
                    │      Moteur Déterministe en Mémoire           │
                    │         (insightsEngine.ts < 2 ms)           │
                    └──────────────────────┬───────────────────────┘
                                           │
         ┌───────────────────┬─────────────┴───────┬───────────────────┐
         ▼                   ▼                     ▼                   ▼
   [🚨 CRITICAL]        [⚠️ WARNING]           [ℹ️ INFO]           [✨ SUCCESS]
  - Crash-Test Découvert - Sur-cadence Dépenses - Plafonnement Livret - Opportunité Épargne
  - Reste à Vivre < 0    - Dérive Charges Var.  - Santé non remboursé - Trésorerie Optimale
```

#### Les 6 Sentinelles Actives :
1. **Crash-Test Anti-Découvert (`auditCrashTest`) [CRITICAL / WARNING] :** Simule jour par jour la trajectoire du solde réel jusqu'au prochain revenu majeur. Applique une règle prudentielle stricte (débits appliqués avant les crédits le même jour) pour détecter tout creux sous le seuil d'alerte (0 € ou seuil personnalisé).
2. **Opportunité d'Épargne (`auditIdleCash`) [SUCCESS] :** Calcule l'excédent disponible basé **strictement sur le solde prévisionnel net de fin de mois** (après déduction d'un fond de roulement de sécurité de 500 €). *Interdiction absolue de recommander de l'épargne sur un solde réel de début de mois qui doit financer les charges à venir.*
3. **Rythme des Dépenses Courantes (`auditDailyExpenseCadence`) [WARNING] :** Compare au prorata temporis le rythme des dépenses du quotidien par rapport à la moyenne constatée sur les 3 derniers mois. Détecte les sur-cadences avant la fin du mois.
4. **Vigilance Plafonds Livrets (`auditSavingsOptimization`) [INFO] :** Surveille les livrets réglementés (ex: Livret A plafonné à 22 950 €) et suggère la réallocation des excédents vers d'autres supports non plafonnés.
5. **Dérive des Charges Variables (`auditVariableChargesHealth`) [WARNING] :** Détecte toute enveloppe variable dont les débits réels dépassent de plus de 15 % le budget alloué.
6. **Reste à Charge Santé Orphelin (`auditPendingHealthRefunds`) [INFO] :** Identifie les avances de frais médicaux en attente de remboursement depuis plus de 45 jours.

#### Ergonomie du Widget :
- **Hiérarchie visuelle :** Affichage par défaut des 3 insights les plus urgents (pastilles couleur normalisées).
- **Dépliage à la demande :** Bouton discret pour afficher la totalité des conseils actifs.
- **Masquage unitaire souverain :** Possibilité de masquer une carte pour la session en cours via la croix `(X)`. L'état est conservé dans le `sessionStorage` du navigateur. Un bouton de réinitialisation permet de réafficher instantanément les cartes masquées.
- **Boutons d'action directe :** Chaque insight dispose d'un bouton de redirection contextuelle vers le module concerné (`/epargne`, `/sante`, `/emprunts`, `/depenses`, `/charges`).

---

### 2.2. Analyse Stratégique des Charges (Fixes & Variables)

Accessible via la route dédiée `/analyse-charges`, ce module offre une vision analytique pluriannuelle (6 à 12 mois) strictement séparée de l'Analyse des Dépenses (qui reste dédiée aux tickets quotidiens `daily`).

#### Volet Charges Fixes (Contrats incompressibles) :
- **Taux d'Effort Réel :** Calculé rigoureusement sur les **rentrées réelles constatées** (`Total Charges Fixes / Revenus Encaissés`). Une alerte visuelle se déclenche si le taux franchit le seuil prudentiel de 33 %.
- **Détecteur de Hausses Tarifaires :** Compare ligne par ligne (via `templateId` ou libellé normalisé) le montant prélevé au mois M par rapport à M-1 et à la moyenne historique 12 mois.
- **Impact Financier Annualisé :** Toute hausse détectée (ex: +3,00 €/mois sur un forfait internet ou une assurance) affiche immédiatement son surcoût cumulé sur l'année (+36,00 €/an), permettant d'arbitrer les renégociations de contrats.

#### Volet Charges Variables (Enveloppes périodiques) :
- **Comparaison Réalisé vs Budgété :** Confrontation directe entre les pointages réels et l'enveloppe budgétée.
- **Règle de Dérive Chronique :** Si une charge dépasse son budget de plus de 15 % pendant 3 mois consécutifs, le moteur signale un sous-calibrage structurel et propose un nouveau montant d'enveloppe basé sur la moyenne réelle constatée.
- **Pics Saisonniers :** Mise en évidence des variations atypiques (énergie en hiver, entretiens annuels de véhicules).

---

## 3. Guide utilisateur au quotidien

### 3.1. Gestion de Trésorerie
L'application fonctionne selon un principe de double lecture indispensable à une saine gestion :
- **Solde Réel :** La photographie exacte de ce qui est présent sur vos comptes en banque à l'instant T (uniquement les opérations effectivement pointées/débitées).
- **Solde Prévisionnel :** L'atterrissage anticipé à la fin du mois, calculé en retranchant du solde réel l'intégralité des charges et dépenses prévues non encore débitées, ainsi que les débits différés en cours.

### 3.2. Saisie des Opérations
- **Saisie universelle :** Grâce au composant `<AmountInput />`, la saisie des montants prend en charge le point `.` et la virgule `,` de manière transparente sur tous les claviers (pavé numérique physique ou virtuel mobile), avec préservation stricte du focus.
- **Paupière de sécurité des modales :** Toutes les fenêtres modales et tiroirs latéraux sont équipés d'un verrouillage contre les fermetures accidentelles par glisser-déposer (`drag-to-overlay`).

---

## 4. Comprendre les indicateurs financiers & la règle d'or bancaire

### 4.1. Le Reste à Vivre
L'application dispose d'un **indicateur unique de Reste à Vivre**, situé dans la rubrique Revenus :
$$\text{Reste à Vivre} = \text{Revenus} - \text{Charges Fixes} - \text{Charges Variables} - \text{Crédits} - \text{Épargne}$$

### 4.2. La Règle d'Or Bancaire du Moteur
Une distinction mathématique absolue est opérée entre la détection du risque de découvert et la recommandation d'épargne :
1. **Anti-découvert intrajournalier :** Doit s'exécuter sur le **Solde Réel instantané** avec simulation jour par jour. Pourquoi ? Parce qu'un chèque ou un prélèvement imprévu rejeté par la banque se produit dans le présent physique, avant même la fin du mois.
2. **Opportunité d'épargne :** Doit s'exécuter **STRICTEMENT sur le Solde Prévisionnel net de fin de mois**. Pourquoi ? Recommander de placer 1 000 € sur un livret au 5 du mois sous prétexte que le solde réel est de 2 500 € provoquerait un découvert quelques jours plus tard lorsque le loyer et les factures d'énergie se présenteraient.

---

## 5. Statuts des opérations & cycle de vie

Chaque flux financier passe par des statuts immuables garantissant l'exactitude des calculs :
- **Revenus :** `Encaissé` (crédité en banque), `En attente` (virement émis non reçu), `Prévu` (anticipation mensuelle), `Désactivé` (neutralisé des calculs).
- **Charges & Dépenses :** `Débité` (passé en banque), `En attente` (paiement engagé), `Prévu` (en attente de présentation), `Désactivé`.
- **Épargne & Virements :** `Effectué`, `En attente`, `Prévu`, `Annulé`.

---

## 6. Architecture logicielle & Qualité industrielle

### 6.1. Moteurs Purs et Déterministes
L'intelligence financière de Personal Budget Pro est scindée en moteurs purs indépendants du DOM :
- `src/engine/calculations.ts` : Moteur de base (soldes, amortissements, proratisations).
- `src/engine/insightsEngine.ts` : Moteur du Conseiller Financier (6 sentinelles, micro-benchmark < 2 ms).
- `src/engine/chargesAnalysisEngine.ts` : Moteur d'agrégation temporelle 6/12 mois des charges.

### 6.2. Suite de Tests Vitest (533 tests - 100 % passants)
Chaque brique logicielle fait l'objet d'une couverture de tests rigoureuse :
- Tests de non-régression sur les calculs d'arrondis IEEE 754.
- Tests d'herméticité des virements internes d'épargne.
- Tests d'isolation des sentinelles et simulation des cas limites intrajournaliers.
- Tests de composants React (accessibilité, navigation, interactions et raccourcis).

---

## 7. Sauvegardes, intégrité & résilience SQLite

Le stockage repose sur le moteur SQLite embarqué avec des optimisations serveur de niveau production :
- **Mode WAL (`PRAGMA journal_mode = WAL`) :** Autorise la lecture simultanée pendant les écritures, éliminant tout blocage multi-utilisateurs.
- **Verrouillage résilient (`PRAGMA busy_timeout = 5000`) :** File d'attente automatique de 5 secondes en cas d'accès concurrentiel lourd.
- **Sauvegarde à chaud sans interruption (`VACUUM INTO`) :** Création quotidienne d'un instantané physique de la base dans `data/backups/auto/` avec politique de rétention tournante sur **7 jours glissants**.
- **Copie de sécurité pré-restauration :** Toute restauration manuelle génère automatiquement une copie de sauvegarde de l'état actuel avant écrasement.

---

## 8. Déploiement avec Docker & Proxmox

### 8.1. Prérequis
- Docker Engine & Docker Compose.
- Port hôte `3001` disponible.

### 8.2. Démarrage Rapide

```bash
# 1. Cloner le dépôt
git clone https://github.com/yanfrance-droid/Budget-Perso-Pro.git
cd Budget-Perso-Pro

# 2. Démarrer le conteneur
docker compose up -d --build

# 3. Vérifier le bon fonctionnement
docker compose ps
docker compose logs --tail=50
```

L'application est immédiatement accessible sur `http://localhost:3001` (ou `http://IP-DU-SERVEUR:3001`).

### 8.3. Persistance des Données
Deux volumes hôtes doivent être conservés lors de vos sauvegardes système :
- `./data:/app/data` : Contient la base active `budget.db` et le sous-dossier de sauvegardes `/backups`.
- `./logs:/app/logs` : Contient les journaux système d'audit et d'activité.

---

## 9. Exploitation & Déploiement Automatisé (Script Shell)

L'administration et la maintenance en production (notamment sur serveurs physiques dédiés, Proxmox VE ou conteneurs LXC Debian/Ubuntu) sont grandement simplifiées et fiabilisées par le script shell interactif fourni à la racine : [`gestion-personal-budget-pro.sh`](file:///c:/Users/Yann/.gemini/antigravity-ide/scratch/personal-budget-pro/gestion-personal-budget-pro.sh).

Écrit en Bash strict (`set -Eeuo pipefail`), il orchestre l'ensemble du cycle de déploiement et d'exploitation sans risque d'erreur humaine.

### 9.1. Fonctionnalités Principales du Script

1. **Nouvelle Installation (`new_install`) :**
   - Clonage automatisé du dépôt dans `/opt/personal-budget-pro-git`.
   - Initialisation automatique du fichier `.env` depuis `.env.example`.
   - Création sécurisée des volumes persistants `data/` et `logs/`.
   - Lancement du build Docker Compose en production.
   - Diagnostic de santé avec attente active de l'état `healthy` de l'application.

2. **Mise à Jour Sécurisée Sans Risque (`update_install`) :**
   - Vérification de l'intégrité de l'installation et contrôle de propreté Git (`check_git_clean` pour empêcher toute perte ou écrasement de modifications locales).
   - **Sauvegarde SQLite automatique préventive :** Exécute un instantané physique à chaud (`.backup`) horodaté dans `data/backups/budget-before-script-YYYYMMDD-HHMMSS.db`.
   - **Certification matérielle de la sauvegarde :** Contrôle systématique de la taille du fichier et exécution immédiate de `PRAGMA integrity_check` avant d'autoriser la moindre modification.
   - Récupération des tags Git (`git fetch --tags --force`) et synchronisation de la branche `main` (`git pull --ff-only`).
   - Reconstruction du conteneur (`docker compose build` puis `up -d --force-recreate`).
   - Attente de la validation du healthcheck et purge automatique du cache de build (`docker builder prune -a -f`).

3. **Réinstallation Complète avec Préservation des Données (`reinstall_install`) :**
   - Remplacement complet de l'arborescence du code après confirmation explicite par saisie du mot-clé `REINSTALLER`.
   - Migration et sanctuarisation intégrale des données réelles (`data/`), des sauvegardes, des journaux (`logs/`) et de la configuration (`.env`).
   - Conservation préalable de l'ancienne version dans une archive de secours horodatée `/opt/personal-budget-pro-git.old-YYYYMMDD-HHMMSS`.

### 9.2. Commandes d'Exécution & Permissions

```bash
# 1. Rendre le script exécutable
chmod +x gestion-personal-budget-pro.sh

# 2. Lancer le menu d'administration (exige les privilèges root)
sudo ./gestion-personal-budget-pro.sh
```

### 9.3. Configuration & Environnement d'Exploitation
Le script s'appuie sur des variables d'environnement adaptées à un hébergement souverain standard :
- `APP_DIR` : `/opt/personal-budget-pro-git` (répertoire d'installation cible).
- `REPO_URL` : `https://github.com/yanfrance-droid/Budget-Perso-Pro.git`.
- `PROJECT` : `personal-budget-pro-git` (nom du projet Docker Compose).
- `CONTAINER` / `SERVICE` : `budget-perso-pro`.
- `BRANCH` : `main`.

---

## 10. Administration, maintenance & diagnostics

Depuis l'onglet **Paramètres** (authentifié), plusieurs outils de maintenance industrielle sont disponibles :
- **Contrôle d'intégrité (`PRAGMA integrity_check`) :** Analyse physique complète des pages et des index B-Tree de SQLite.
- **Compactage de la base (`VACUUM`) :** Récupération de l'espace disque non alloué et purge du journal WAL.
- **Export Excel certifié :** Téléchargement d'un classeur multi-onglets structuré (soldes, charges, crédits, historique).
- **Restauration instantanée :** Restauration guidée avec contrôle d'intégrité préalable.

---

## 11. Sécurité & Accès à distance

- **Aucune dépendance cloud :** Toutes les données restent stockées sur votre matériel personnel.
- **Recommandation d'accès distant :** Pour accéder à votre budget en déplacement (smartphone, tablette), privilégiez un tunnel VPN chiffré souverain tel que **WireGuard** ou **Tailscale**. Évitez d'exposer directement le port HTTP sur l'Internet public sans proxy inverse chiffré (Traefik, Nginx Proxy Manager) et authentification forte.

---

## 12. Foire Aux Questions (FAQ)

#### Pourquoi le Flash Insights me dit qu'une dépense dépasse la cadence alors que mon solde est positif ?
Le moteur de cadence compare vos dépenses courantes du quotidien au prorata des jours écoulés dans le mois par rapport à vos habitudes réelles (moyenne des 3 mois précédents). Avoir un solde temporairement positif ne prévient pas un dépassement en fin de mois si vous consommez votre budget deux fois plus vite que prévu.

#### Comment est calculé l'impact annuel d'une hausse de charge ?
Si votre facture d'électricité ou d'assurance augmente de 5,00 € entre le mois précédent et le mois en cours, le moteur multiplie immédiatement cet écart par 12 mois (+60,00 €/an). Cela permet de matérialiser instantanément le poids réel d'une micro-augmentation contractuelle sur votre budget annuel.

#### Pourquoi le module "Analyse des Charges" est-il distinct de "Analyse des Dépenses" ?
Une gestion budgétaire rigoureuse impose de ne pas mélanger des flux de nature différente :
- Les **Dépenses** sont discrétionnaires et quotidiennes (supermarché, sorties, shopping).
- Les **Charges** sont contractuelles (fixes) ou indispensables (variables comme l'énergie). Leurs leviers d'optimisation sont totalement différents (arbitrage de mode de vie vs résiliation/renégociation de contrat).

---

**Personal Budget Pro** — Conçu et développé avec passion pour la souveraineté financière par **Yann DONNE**.
