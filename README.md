# Personal Budget Pro (v1.3.9)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Node.js-v24_Alpine-green.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/SQLite-node:sqlite_WAL-blueviolet.svg)](https://sqlite.org/)
[![Tests](https://img.shields.io/badge/Tests-599%20passing-brightgreen.svg)](package.json)
[![RAM Footprint](https://img.shields.io/badge/RAM-%3C_60_Mo-success.svg)](#architecture-logicielle--efficience)

**Personal Budget Pro** est une application web auto-hébergée (*self-hosted*), ultra-légère (< 60 Mo de RAM au repos) et de haute précision pour la gestion budgétaire, l'anticipation de trésorerie (*cash-flow*) et le pilotage patrimonial personnel.

Conçue dans une philosophie *Local-First* souveraine et sans dépendance externe (zéro cloud tiers, zéro abonnement, zéro télémétrie), elle allie la vélocité native de Node.js 24 (`node:sqlite` en mode WAL) à la réactivité de React 19 et la rigueur mathématique du centime d'euro.

---

## Sommaire

1. [Spécificités Métier Uniques](#1-spécificités-métier-uniques)
2. [Stack Technique & Efficience](#2-stack-technique--efficience)
3. [Démarrage Rapide (Docker Compose)](#3-démarrage-rapide-docker-compose)
4. [Pilotage & Anticipation : Les Moteurs](#4-pilotage--anticipation-les-moteurs)
   - [Conseiller Financier Flash Insights & Crash-Test](#41-conseiller-financier-flash-insights--crash-test)
   - [Analyse Stratégique des Charges & Détection d'Inflation](#42-analyse-stratégique-des-charges--détection-dinflation)
5. [Guide d'Utilisation & Règle d'Or Bancaire](#5-guide-dutilisation--règle-dor-bancaire)
6. [Exploitation & Déploiement Automatisé (Script Shell)](#6-exploitation--déploiement-automatisé-script-shell)
7. [Sauvegardes & Résilience SQLite](#7-sauvegardes--résilience-sqlite)
8. [Sécurité & Confidentialité](#8-sécurité--confidentialité)
9. [Disclaimer & Licence](#9-disclaimer--licence)

---

## 1. Spécificités Métier Uniques

Contrairement aux solutions généralistes anglo-saxonnes (YNAB, Actual Budget), Personal Budget Pro intègre nativement les mécanismes indispensables à la vie financière réelle d'un foyer :

* **Trésorerie Réelle vs Solde Prévisionnel (Cash-Flow) :**  
  Double lecture permanente : le solde physique en banque à l'instant T versus l'atterrissage net de fin de mois après déduction du reste à payer engagé et des cartes à débit différé.
* **Moteur d'Amortissement de Crédits à Paliers :**  
  Décomposition actuarielle stricte de chaque mensualité (Capital amorti + Intérêts + Assurance). Prise en charge des prêts modulables et des historiques de changements de mensualités (`loan_payment_history`), avec courbe de désendettement patrimonial sur plusieurs années.
* **Module Santé & Reste à Charge (Sécu + Mutuelle) :**  
  Modélisation du cycle de vie des soins à trois temps : avance de frais (`health_expense`), pointage des remboursements décorrélés Sécurité Sociale et Mutuelle via rapprochement d'identifiants (`linkedId`), et calcul automatique du reste à charge net.
* **Wishlist & Dépenses Prévisionnelles Isolées :**  
  Planification d'achats ou de projets futurs avec degré d'urgence et date cible, sans polluer le livre des comptes actifs.
* **Mode Discret (Floutage de confidentialité) :**  
  Bascule instantanée pour masquer les montants sensibles lors d'une consultation sur écran partagé ou en lieu public.

---

## 2. Stack Technique & Efficience

* **Backend :** Node.js 24 Alpine, architecture native `node:sqlite` (zéro ORM lourd, requêtes SQL préparées instantanées).
* **Base de données :** SQLite 3 en mode **WAL** (`Write-Ahead Logging`, `PRAGMA synchronous = NORMAL`, cache 16 Mo).
* **Frontend :** React 19, TypeScript strict, Vite, Tailwind CSS, Lucide Icons, Recharts.
* **Conteneurisation :** Image Docker optimisée multi-stage (< 150 Mo).
* **Empreinte système :** Moins de 60 Mo de RAM au repos, consommation CPU négligeable (< 0.1 % sur conteneur LXC Proxmox).
* **Assurance Qualité :** 61 fichiers de tests, 587 tests automatisés Vitest (100 % passants).

---

## 3. Démarrage Rapide (Docker Compose)

### Prérequis
* Docker & Docker Compose installés.
* Port `3001` disponible.

### Déploiement en 30 secondes

```bash
# 1. Cloner le dépôt
git clone https://github.com/yanfrance-droid/Budget-Perso-Pro.git
cd Budget-Perso-Pro

# 2. Configurer les variables d'environnement
cp .env.example .env

# 3. Lancer le conteneur en arrière-plan
docker compose up -d --build

# 4. Vérifier l'état de santé
docker compose ps
docker compose logs --tail=50
```

L'application est immédiatement opérationnelle sur `http://localhost:3001` (ou `http://IP_DE_VOTRE_SERVEUR:3001`).  
Au premier lancement, créez votre compte administrateur local sécurisé (mot de passe haché par `scrypt` et clé de secours).

### Persistance des données
Deux volumes locaux assurent la pérennité totale de votre instance :
* `./data:/app/data` : Contient la base de données SQLite `budget.db` et les sauvegardes automatiques.
* `./logs:/app/logs` : Contient les journaux techniques tournants.

---

## 4. Pilotage & Anticipation : Les Moteurs

### 4.1. Conseiller Financier Flash Insights & Crash-Test

Situé en haut du Tableau de bord, le widget **Flash Insights** est piloté par un moteur heuristique en mémoire (`src/engine/insightsEngine.ts`), sans latence ni appel externe (< 2 ms d'exécution) :

1. **Crash-Test Anti-Découvert :** Simule jour par jour la trajectoire de votre solde réel jusqu'au prochain revenu majeur. Applique une règle prudentielle stricte (débits imputés avant les crédits du même jour) pour détecter tout creux sous le seuil d'alerte.
2. **Opportunité d'Épargne :** Calcule l'excédent disponible basé **strictement sur le solde prévisionnel net de fin de mois** (après déduction d'un fond de roulement de sécurité).
3. **Cadence des Dépenses Courantes :** Surveille le rythme des tickets quotidiens par rapport à la moyenne constatée des 3 mois précédents pour prévenir les fins de mois difficiles.
4. **Surveillance des Plafonds :** Alerte en cas de plafonnement de livrets d'épargne réglementés (Livret A, LDDS).
5. **Dérive des Charges Variables :** Signale les postes de dépenses dépassant de plus de 15 % leur budget prévisionnel.
6. **Reste à Charge Santé Orphelin :** Relance les actes médicaux en attente de remboursement depuis plus de 45 jours.

### 4.2. Analyse Stratégique des Charges & Détection d'Inflation

Le module `/analyse-charges` offre une analyse pluriannuelle (6 à 12 mois glissants) :
* **Taux d'Effort Réel :** Ratio `Charges Fixes / Revenus Encaissés Réels` avec alerte si > 33 %.
* **Détecteur de Hausses Tarifaires :** Compare chaque contrat (télécom, énergie, assurance) par rapport à M-1 et à l'historique annuel.
* **Impact Financier Annualisé :** Matérialise immédiatement le coût annuel cumulé de toute hausse contractuelle (ex: +3,00 €/mois = +36,00 €/an).

---

## 5. Guide d'Utilisation & Règle d'Or Bancaire

### La Règle d'Or Bancaire de Personal Budget Pro
Une étanchéité mathématique stricte est observée par le système :
* **L'Anti-découvert** s'évalue sur le **Solde Réel instantané** avec simulation journalière, car un incident bancaire se produit physiquement dans le présent.
* **L'Opportunité d'épargne** s'évalue **exclusivement sur le Solde Prévisionnel net de fin de mois**. Placer de l'argent sur un livret au 5 du mois parce que le solde courant est haut conduirait à un découvert dès la présentation des prélèvements de loyer ou d'énergie.

---

## 6. Exploitation & Déploiement Automatisé (Script Shell)

Pour les environnements serveurs physiques ou conteneurs Proxmox VE (LXC Debian/Ubuntu), un script shell interactif en Bash strict est fourni à la racine : [`gestion-personal-budget-pro.sh`](gestion-personal-budget-pro.sh).

```bash
# Rendre le script exécutable
chmod +x gestion-personal-budget-pro.sh

# Lancer le menu d'administration (privilèges root)
sudo ./gestion-personal-budget-pro.sh
```

**Actions automatisées :**
* **Nouvelle installation :** Clonage Git, initialisation de l'environnement, création des volumes, build Docker et attente du healthcheck.
* **Mise à jour sécurisée :** Sauvegarde SQLite physique à chaud (`.backup`) avec vérification préalable `PRAGMA integrity_check`, synchronisation Git `pull --ff-only`, reconstruction du conteneur et purge du cache de build.
* **Réinstallation sécurisée :** Remplacement complet du code avec sanctuarisation absolue des données (`data/`) et de la configuration (`.env`).

---

## 7. Sauvegardes & Résilience SQLite

* **Mode WAL :** Permet des lectures simultanées sans verrouillage bloquant.
* **Sauvegarde à chaud native :** Commande `VACUUM INTO` sans coupure de service.
* **Auto-maintenance intégrée :** Contrôle d'intégrité B-Tree (`PRAGMA integrity_check`), détection et réparation des clés orphelines, purge automatique des sauvegardes avec politique de rétention 7 jours glissants.
* **Export universel :** Génération de classeurs multi-onglets Excel (`.xlsx`) et exports bruts de la base SQLite (`.db`).

---

## 8. Sécurité & Confidentialité

* **Zéro Cloud :** 100 % de vos données financières demeurent sur votre propre infrastructure.
* **Authentification Forte :** Mots de passe salés et hachés via `scrypt` (résistant aux attaques par GPU/ASIC), couplés à une clé de secours déterministe (`BUDGET-XXXX-XXXX-XXXX`).
* **Recommandation d'accès distant :** Pour un accès nomade (smartphone/tablette), préférez un tunnel VPN souverain (**WireGuard**, **Tailscale**) ou un reverse proxy sécurisé (Traefik, Nginx Proxy Manager) avec certificat SSL/TLS.

---

## 9. Disclaimer & Licence

### Projet "As-Is" (Sans support garanti)
Ce projet est développé et mis à disposition gratuitement **"en l'état" (*As-Is*)**, dans l'esprit du partage open-source et pour la communauté homelab / auto-hébergement.  
L'auteur ne fournit aucune garantie de support technique individuel, de disponibilité ou d'adéquation à un usage financier ou comptable professionnel. Vous êtes seul responsable de la gestion, de la sauvegarde et de la sécurité de vos données.

### Licence
Distribué sous licence libre **MIT**. Consultez le fichier [`LICENSE`](LICENSE) pour plus d'informations.

---

*Développé avec passion pour l'autonomie et la souveraineté financière par **Yann DONNE**.*
