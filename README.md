# 💰 PersonalBudgetPro

> **Application souveraine, autonome et hautement résiliente de gestion budgétaire et de patrimoine personnel.**  
> **Conception, Architecture & Développement :** Yann Donne  
> **Dépôt officiel :** https://github.com/yanfrance-droid/Budget-Perso-Pro
> **Stack technologique :** React 19 • Vite • TypeScript • SQLite natif (`node:sqlite`) • Docker • Proxmox VE  

---

## 📑 Sommaire
1. [🌟 Philosophie et Vision de Souveraineté](#-philosophie-et-vision-de-souveraineté)
2. [👤 Guide Utilisateur (Volet Grand Public)](#-guide-utilisateur-volet-grand-public)
   - [1. Tableau de bord & Reste à vivre](#1-tableau-de-bord--reste-à-vivre)
   - [2. Gestion des Comptes & Organismes](#2-gestion-des-comptes--organismes)
   - [3. Revenus & Salaires](#3-revenus--salaires)
   - [4. Charges Fixes & Variables (Pointage)](#4-charges-fixes--variables-pointage)
   - [5. Dépenses Courantes (Quotidien)](#5-dépenses-courantes-quotidien)
   - [6. Dépenses Prévisionnelles & Projets](#6-dépenses-prévisionnelles--projets)
   - [7. Analyse des Dépenses & Diagrammes](#7-analyse-des-dépenses--diagrammes)
   - [8. Pôle Santé & Remboursements](#8-pôle-santé--remboursements)
   - [9. Crédits & Historique d'Amortissement](#9-crédits--historique-damortissement)
   - [10. Épargne & Trésorerie](#10-épargne--trésorerie)
   - [11. Apparence, Thèmes & Mode Discret](#11-apparence-thèmes--mode-discret)
3. [🛠️ Guide d'Administration Technique (Volet Technicien)](#️-guide-dadministration-technique-volet-technicien)
   - [1. Architecture logicielle](#1-architecture-logicielle)
   - [2. Déploiement Docker sur Proxmox / LXC](#2-déploiement-docker-sur-proxmox--lxc)
   - [3. Accès distant sécurisé (Tailscale / VPN)](#3-accès-distant-sécurisé-tailscale--vpn)
   - [4. Moteur SQLite & Mode WAL (Write-Ahead Logging)](#4-moteur-sqlite--mode-wal-write-ahead-logging)
   - [5. Sauvegardes Automatiques Quotidiennes (7 jours)](#5-sauvegardes-automatiques-quotidiennes-7-jours)
   - [6. Instantanés de sécurité & Restauration à chaud](#6-instantanés-de-sécurité--restauration-à-chaud)
   - [7. Optimisation physique (VACUUM & Truncate WAL)](#7-optimisation-physique-vacuum--truncate-wal)
   - [8. Purge des Sauvegardes & Remise à Zéro Sécurisée](#8-purge-des-sauvegardes--remise-à-zéro-sécurisée)
   - [9. Journalisation technique & Métriques Proxmox](#9-journalisation-technique--métriques-proxmox)
4. [❓ Foire Aux Questions (FAQ)](#-foire-aux-questions-faq)

---

## 🌟 Philosophie et Vision de Souveraineté

La plupart des solutions budgétaires actuelles vous imposent de confier vos identifiants bancaires et votre historique financier à des plateformes cloud tierces opaques, ou se limitent à des tableurs Excel rigides et inadaptés aux écrans mobiles.

Créé et architecturé par **Yann Donne**, **PersonalBudgetPro** repose sur une conviction inébranlable :
- **Protection intégrale de votre vie privée** : vos données bancaires et personnelles ne quittent jamais votre serveur. Zéro traqueur, zéro publicité, aucun partage avec des entités commerciales.
- **Accès universel et instantané** : synchronisation fluide en temps réel entre votre ordinateur portable, votre station fixe et votre smartphone (iPhone / Android) connecté à votre réseau personnel (VPN / Tailscale).
- **Exactitude financière** : séparation stricte des flux économiques réels (dépenses / revenus) et des mouvements de trésorerie interne (virements vers l'épargne), préservant la fidélité de vos indicateurs patrimoniaux.

---

## 👤 Guide Utilisateur (Volet Grand Public)

### 1. Tableau de bord & Reste à vivre
Le tableau de bord est le poste de commandement de vos finances :
- **Solde réel global** : consolidation automatique des soldes pointés de tous vos comptes bancaires.
- **Reste à vivre réel** : somme disponible pour le reste du mois calculée ainsi :
  $$\text{Reste à vivre} = \text{Revenus du mois} - \text{Charges fixes \& variables pointées ou prévues} - \text{Dépenses courantes}$$
- **Reste à vivre théorique** : vision budgétaire idéale basée sur vos récurrences habituelles.
- **Graphique de l'épargne** : courbe dynamique montrant l'évolution globale de votre patrimoine financier.
- **Graphique des capitaux restants dus** : double courbe fluide (Immobilier vs Consommation) retraçant le désendettement exact jusqu'au mois en cours (sans projection fictive vers le futur).

### 2. Gestion des Comptes & Organismes
- Créez vos comptes bancaires (Courant, Épargne, Espèces).
- Définissez vos organismes verseurs (Employeur, Caisse de retraite, CAF, CPAM) pour une catégorisation limpide de vos rentrées d'argent.

### 3. Revenus & Salaires
- Saisissez salaires, primes, allocations ou remboursements.
- Activez la récurrence automatique pour renouveler automatiquement vos revenus chaque début de mois.

### 4. Charges Fixes & Variables (Pointage)
- **Charges fixes** : loyer, assurances, abonnements télécoms, électricité.
- **Charges variables** : factures d'eau, carburant, impôts.
- Cochez la case **Pointé** dès que l'opération apparaît sur votre relevé bancaire.

### 5. Dépenses Courantes (Quotidien)
- Enregistrez vos achats du quotidien (courses alimentaires, loisirs, carburant) en quelques clics depuis votre mobile.
- Les soldes de vos comptes sont recalculés à la milliseconde près.

### 6. Dépenses Prévisionnelles & Projets
- Anticipez vos futurs gros investissements (vacances d'été, travaux, véhicule).
- Classez-les par priorité (*Indispensable*, *Souhaitable*, *Optionnel*) et affectez-leur une date cible.

### 7. Analyse des Dépenses & Diagrammes
- Diagramme en anneau interactif ventilant vos charges par poste.
- Dépliage hiérarchique pour inspecter les sous-catégories et réduire les dépenses superflues.

### 8. Pôle Santé & Remboursements
- Isolez rigoureusement les consultations médicales, pharmacie, optique et dentaire.
- Rapprochez vos dépenses des remboursements de la Sécurité Sociale et de votre Mutuelle pour afficher votre **reste à charge réel**.

### 9. Crédits & Historique d'Amortissement
- Renseignez le capital initial, les mensualités, les taux et les dates d'échéance de vos crédits.
- **Import CSV d'historique** : chargez jusqu'à 10 ans d'historique réel d'amortissement grâce au modèle téléchargeable directement dans l'application.

### 10. Épargne & Trésorerie
- Suivez l'évolution de vos livrets (Livret A, LDDS, LEP, Assurance-Vie).
- Les versements sont comptabilisés comme de l'épargne valorisée, et non comme une perte de pouvoir d'achat.

### 11. Apparence, Thèmes & Mode Discret
- **Thèmes visuels** : Clair, Sombre ou Automatique (selon le système de votre appareil).
- **Mode Discret (Confidentialité)** : un clic sur l'œil floute instantanément tous les montants en euros à l'écran. Idéal si vous consultez vos finances dans le train, les transports ou au bureau.

---

## 🛠️ Guide d'Administration Technique (Volet Technicien)

### 1. Architecture logicielle
PersonalBudgetPro a été développé avec une exigence de sobriété et d'absence de dette technique :
- **Serveur applicatif unique** : Node.js natif (`server/index.ts` et `server/app.ts`) servant l'API REST JSON et les assets statiques compilés (`dist/`).
- **Base de données** : SQLite 3 exploité avec le moteur haute performance C++ natif de Node.js (`node:sqlite` / `DatabaseSync`).
- **Aucune dépendance externe lourde** : ni ORM complexe, ni framework backend verbeux.

---

### 2. Déploiement Docker sur Proxmox / LXC

#### A. Clonage du dépôt Git
Connectez-vous à votre machine ou conteneur Proxmox et clonez le dépôt :
```bash
git clone https://github.com/yanfrance-droid/Budget-Perso-Pro.git
cd Budget-Perso-Pro
```

#### B. Structure du Dockerfile

Le Dockerfile fourni à la racine du dépôt est la référence officielle pour construire l'application. Il utilise Node.js 24, compile le frontend React et configure le serveur Node.js avec SQLite et Chromium. Il est recommandé d'utiliser directement ce fichier plutôt que de recopier un exemple de Dockerfile dans cette documentation.

#### C. Lancement avec Docker Compose

Le fichier `docker-compose.yml` fourni à la racine du dépôt contient la configuration du conteneur : construction de l'image, ports, volumes persistants pour les données et les journaux, paramètres du serveur, contrôle de santé et rotation des journaux Docker.

Pour installer l'application, placez-vous dans le répertoire du projet et exécutez :

```bash
docker compose up -d --build
```

Cette commande construit l'image Docker et démarre le conteneur. Sur une installation existante, vérifiez que vos données sont sauvegardées avant de reconstruire l'application.

L'application est accessible à l'adresse suivante, en remplaçant `IP-DE-VOTRE-SERVEUR` par l'adresse IP de votre serveur :

`http://IP-DE-VOTRE-SERVEUR:3001`

---

### 3. Accès distant sécurisé (Tailscale / VPN)
Pour accéder à PersonalBudgetPro depuis votre iPhone ou PC portable à l'extérieur :
1. Installez **Tailscale** (ou un serveur **WireGuard**) sur votre hôte Proxmox.
2. Rejoignez votre tailnet personnel.
3. Renseignez l'adresse IP Tailscale de votre serveur dans le navigateur ou enregistrez l'application en PWA sur votre écran d'accueil iPhone.

---

### 4. Moteur SQLite & Mode WAL (Write-Ahead Logging)

Le backend utilise SQLite pour stocker les données de l'application. Le mode WAL (*Write-Ahead Logging*) facilite la coexistence des opérations de lecture et d'écriture.

Les paramètres SQLite configurés par le backend sont les suivants :

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

- **Concurrence** : le mode WAL permet aux lectures et aux écritures de coexister dans la plupart des situations, tout en limitant les blocages.
- **Intégrité des données** : SQLite assure la cohérence transactionnelle. Le mode WAL contribue à la gestion des écritures, mais ne dispense pas de sauvegardes régulières ni de précautions contre les pannes matérielles.
---

### 5. Sauvegardes Automatiques Quotidiennes (7 jours)
Chaque nuit, le serveur déclenche automatiquement un instantané physique à chaud :
- Exécution de la commande SQLite : `VACUUM INTO 'data/backups/auto/budget_auto_YYYY-MM-DD.db'`.
- **Politique de rétention** : rotation glissante sur **7 jours**. Les sauvegardes plus anciennes sont automatiquement purgées pour préserver votre espace disque.

---

### 6. Instantanés de sécurité & Restauration à chaud
- **Copie de sécurité préventive** : toute tentative de restauration ou de remise à zéro crée d'abord un instantané de sécurité `data/backups/budget_safety_restore_*.db`.
- **Restauration en 1 clic** : dans l'onglet *Paramètres > Sauvegardes & Restauration*, choisissez un instantané dans la liste déroulante et validez. Le remplacement est réalisé à chaud avec vérification d'intégrité B-Tree (`PRAGMA integrity_check`).

---

### 7. Optimisation physique (VACUUM & Truncate WAL)
Dans l'onglet *Paramètres > Serveur & Synchro*, le bouton **« Optimiser & Compacter (VACUUM) »** :
1. Vole et tronque le journal WAL vers la base principale (`PRAGMA wal_checkpoint(TRUNCATE)`).
2. Optimise les statistiques des requêtes (`PRAGMA optimize`).
3. Reconstruit physiquement les fichiers de données pour libérer les pages vides.

---

### 8. Purge des Sauvegardes & Remise à Zéro Sécurisée
- **Purger les sauvegardes** : supprime tous les fichiers d'instantanés (`.db` et `.json`) conservés dans `data/backups/` via la route protégée `DELETE /api/maintenance/backups`. **La base active `budget.db` reste strictement intacte.**
- **Hard Reset Sécurisé** : pour remettre l'application à zéro sans effacer votre mot de passe ni votre compte administrateur, tapez le mot clé **`REINITIALISER`** dans la zone de danger.

---

### 9. Journalisation technique & Métriques Proxmox
L'onglet *Serveur & Synchro* intègre un monitoring en temps réel :
- **Uptime** du service.
- **Adresse IP** locale du serveur et port `:3001`.
- **Utilisation CPU** instantanée avec détection du nombre de cœurs et charge système (`load average`).
- **Consommation de Mémoire Vive (RAM)** avec jauge dynamique.
- **Espace disque disponible** sur le volume Proxmox.
- **Journal technique (`server.log`)** avec rotation automatique à 5 Mo et téléchargement direct.

---

## ❓ Foire Aux Questions (FAQ)

**Q : Puis-je exporter l'intégralité de mon budget pour l'analyser dans Excel ou LibreOffice ?**  
*R : Oui. L'onglet Sauvegardes & Restauration intègre un export Excel (.xlsx) haute fidélité générant 10 feuilles complètes avec formules, totaux consolidés et diagrammes intégrés.*

**Q : Que faire si j'oublie le mot de passe administrateur ?**  
*R : Lors de votre première configuration, une **Clé de secours (Recovery Key)** de 32 caractères vous a été attribuée. Utilisez le lien « Mot de passe oublié » sur l'écran de connexion pour redéfinir instantanément vos accès.*

**Q : Comment effectuer une sauvegarde complète externe ?**  
*R : Cliquez sur « Télécharger la copie (.db) » dans les Paramètres, ou sauvegardez simplement le volume `./data/` de votre hôte Proxmox.*

---

*Fait avec passion et exigence par Yann Donne pour la liberté et la souveraineté financière de chacun.*
