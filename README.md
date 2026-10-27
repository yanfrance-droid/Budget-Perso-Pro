# Budget Perso Pro

**Budget Perso Pro** est une application de gestion de budget personnel permettant de suivre les revenus, les charges, les dépenses, les crédits, l'épargne et les remboursements de santé.

Elle permet de centraliser les opérations budgétaires, de consulter différents indicateurs financiers et d'anticiper l'évolution du solde bancaire.

## Sommaire

1. Présentation
2. Guide utilisateur
3. Comprendre les indicateurs financiers
4. Comprendre les statuts des opérations
5. Fonctionnalités
6. Sauvegardes et restauration
7. Architecture technique
8. Installation avec Docker
9. Administration et maintenance
10. Accès à distance
11. Questions fréquentes

---

## 1. Présentation

Budget Perso Pro est une application conçue pour faciliter le suivi et la gestion d'un budget personnel.

Elle regroupe notamment :

- Les comptes bancaires.
- Les revenus et les organismes verseurs.
- Les charges fixes et variables.
- Les dépenses courantes et les dépenses prévues.
- Les crédits et leurs remboursements.
- L'épargne et les transferts entre comptes.
- Les dépenses de santé et les remboursements associés.
- Les analyses et les graphiques budgétaires.

L'application fonctionne sur un serveur personnel et utilise une base de données SQLite pour conserver les informations.

### Technologies utilisées

- React et TypeScript pour l'interface.
- Vite pour la partie frontend.
- Node.js pour le serveur.
- SQLite pour le stockage des données.
- Docker pour le déploiement.

Le projet est disponible sur GitHub :

[Budget Perso Pro — dépôt GitHub](https://github.com/yanfrance-droid/Budget-Perso-Pro)

---

## 2. Guide utilisateur

### 2.1. Tableau de bord

Le tableau de bord donne une vue synthétique de la situation budgétaire.

Il permet de consulter les principaux indicateurs et de suivre l'évolution des opérations enregistrées dans l'application.

Les montants affichés dépendent notamment des statuts des opérations et de la période sélectionnée.

### 2.2. Comptes bancaires et organismes verseurs

Les comptes bancaires permettent d'associer les opérations au compte concerné.

Les comptes peuvent être ajoutés, modifiés, fermés ou réactivés selon les besoins. La suppression dépend notamment de l'existence d'opérations ou de crédits associés.

La fermeture d'un compte permet de conserver son historique sans continuer à l'utiliser pour de nouvelles opérations.

Les organismes verseurs permettent d'identifier la provenance des revenus. Ils peuvent être gérés depuis les paramètres.

### 2.3. Revenus

Cette rubrique permet d'enregistrer les revenus ponctuels et récurrents.

Chaque revenu peut être associé à un compte créditeur et, lorsque cela est nécessaire, à un organisme verseur.

Les revenus peuvent être suivis selon leur état : encaissés, en attente, prévus ou désactivés.

### 2.4. Charges fixes et charges variables

Les charges fixes correspondent aux dépenses régulières, par exemple un loyer ou un abonnement.

Les charges variables correspondent aux dépenses dont le montant ou la fréquence peuvent varier.

Ces opérations peuvent être associées au compte bancaire concerné et suivies selon leur statut.

### 2.5. Dépenses courantes

Cette rubrique permet d'enregistrer les dépenses du quotidien afin de conserver une vision plus complète des sorties d'argent.

Les dépenses peuvent être associées à un compte et à une catégorie.

### 2.6. Dépenses prévues et projets

Les dépenses prévues permettent de répertorier des achats ou des projets à venir.

Elles peuvent être organisées par priorité afin de faciliter leur suivi et leur planification.

### 2.7. Analyses et graphiques

Les analyses permettent de consulter les données budgétaires sous différentes formes graphiques.

Elles servent notamment à mieux comprendre la répartition des dépenses et l'évolution des opérations.

Les résultats dépendent des données enregistrées, des filtres et des périodes sélectionnées.

### 2.8. Santé et remboursements

Cette rubrique permet de suivre les dépenses de santé et les remboursements associés.

Elle aide à distinguer les dépenses engagées des remboursements reçus ou encore attendus.

### 2.9. Crédits

La gestion des crédits permet de suivre les prêts et leurs remboursements.

Les informations enregistrées permettent de suivre les échéances et les éléments disponibles concernant le capital restant dû.

### 2.10. Épargne et trésorerie

Cette rubrique permet de suivre les opérations d'épargne et les transferts entre comptes.

Elle contribue au suivi de la trésorerie et à la compréhension des mouvements financiers entre les comptes.

### 2.11. Paramètres

Les paramètres regroupent les éléments de configuration et d'administration disponibles dans l'application.

Ils permettent notamment de gérer les comptes, les catégories et les organismes verseurs, ainsi que les fonctions de sauvegarde, de restauration et de maintenance.

---

## 3. Comprendre les indicateurs financiers

### 3.1. Le reste à vivre

L'application possède **un seul indicateur de reste à vivre**, situé dans l'onglet **Revenus**.

Il permet d'estimer ce qu'il reste des revenus après déduction des principales charges budgétaires.

Le calcul repose sur les éléments suivants :

- Les revenus.
- Les charges fixes.
- Les charges variables.
- Les remboursements de crédit.
- L'épargne.

**Principe de calcul :**

Reste à vivre = Revenus − Charges fixes − Charges variables − Crédits − Épargne

Le **reste à vivre brut** correspond à la valeur théorique des revenus avant la déduction de ces charges. Il ne constitue pas un deuxième indicateur de reste à vivre.

Cet indicateur est différent du **solde bancaire prévisionnel**, qui part du solde réel du compte bancaire à un instant donné et estime ce qu'il devrait réellement rester après prise en compte des opérations futures concernées.

### 3.2. Le solde bancaire prévisionnel

Le solde bancaire prévisionnel représente une estimation de ce qu'il devrait réellement rester sur le compte bancaire.

Contrairement au reste à vivre, il part du solde bancaire réel à un instant donné et tient compte des opérations futures concernées.

Selon la situation, le calcul peut notamment prendre en compte les charges à venir et les montants restant à débiter sur les cartes à débit différé.

Il s'agit d'une estimation fondée sur les informations enregistrées dans l'application. Ce n'est pas une synchronisation automatique avec la banque.

### 3.3. Les différents soldes

Les soldes peuvent correspondre à des périmètres d'opérations différents.

- **Solde réel :** tient compte des opérations enregistrées comme effectivement réalisées.
- **Solde disponible :** tient compte des opérations réalisées et des opérations en attente.
- **Solde prévisionnel :** tient compte des opérations actives, y compris celles prévues, à l'exclusion des opérations désactivées.

Les résultats peuvent donc différer sans que cela signifie nécessairement qu'une erreur s'est produite.

---

## 4. Comprendre les statuts des opérations

Les statuts permettent de distinguer les opérations déjà réalisées de celles qui sont encore en attente ou prévues.

### 4.1. Revenus

- **Encaissé :** le revenu a été reçu.
- **En attente :** le revenu est en attente de réception.
- **Prévu :** le revenu est anticipé.
- **Désactivé :** le revenu n'est plus pris en compte dans les calculs actifs.

### 4.2. Charges et dépenses

- **Débité :** la dépense a été effectuée.
- **En attente :** la dépense est en attente de débit.
- **Prévu :** la dépense est anticipée.
- **Désactivé :** la dépense n'est plus prise en compte dans les calculs actifs.

### 4.3. Épargne

- **Effectué :** l'opération d'épargne a été réalisée.
- **En attente :** l'opération est en attente.
- **Prévu :** l'opération est anticipée.
- **Annulé :** l'opération a été annulée.

### 4.4. Remboursements de santé

Le suivi des remboursements permet de distinguer les sommes déjà reçues de celles qui restent attendues.

Le montant effectivement remboursé doit être distingué du remboursement encore prévisionnel.

### 4.5. Comptes, catégories et organismes verseurs

La fermeture d'un compte permet de conserver son historique tout en empêchant son utilisation pour de nouvelles opérations.

Les catégories et les organismes verseurs peuvent être archivés. La possibilité de supprimer un élément dépend notamment des opérations qui y sont associées.

### 4.6. Priorité des dépenses prévues

Les dépenses prévues peuvent être organisées selon trois niveaux de priorité :

- Urgent.
- Moyennement urgent.
- Pas urgent.

### 4.7. Pourquoi les montants peuvent-ils différer ?

Les indicateurs ne reposent pas nécessairement sur les mêmes opérations.

Un montant peut donc varier selon qu'il inclut uniquement les opérations réalisées, les opérations en attente ou les opérations prévues.

Il est important de vérifier les statuts et la période sélectionnée avant de comparer deux chiffres.

---

## 5. Fonctionnalités

L'application regroupe les fonctionnalités suivantes :

- Gestion des comptes bancaires.
- Gestion des organismes verseurs et des catégories.
- Enregistrement des revenus ponctuels et récurrents.
- Gestion des charges fixes et variables.
- Suivi des dépenses courantes.
- Planification des dépenses et des projets.
- Consultation des analyses et graphiques.
- Suivi des dépenses de santé et des remboursements.
- Gestion des crédits et des remboursements.
- Suivi de l'épargne et des transferts.
- Configuration des paramètres de l'application.
- Export des données budgétaires au format Excel.
- Sauvegarde et restauration de la base SQLite.
- Fonctions de maintenance et de diagnostic.

Les fonctionnalités effectivement disponibles dépendent de la version installée.

---

## 6. Sauvegardes et restauration

L'application propose plusieurs mécanismes qui répondent à des besoins différents.

### 6.1. Export Excel

L'export Excel permet d'obtenir un fichier `.xlsx` contenant des données budgétaires pour consultation ou traitement dans un tableur.

Cet export est utile pour analyser ou conserver certaines informations, mais il ne remplace pas une sauvegarde complète de la base de données.

### 6.2. Sauvegarde de la base de données

La sauvegarde de la base SQLite produit un fichier de base de données, généralement au format `.db`.

Elle sert à conserver une copie des données de l'application en vue d'une éventuelle restauration.

### 6.3. Restauration d'une base de données

La restauration permet de remplacer la base de données utilisée par l'application à partir d'un fichier de sauvegarde compatible.

Une copie de sécurité de la base existante est prévue avant le remplacement afin de permettre un retour en arrière en cas de problème.

Il est recommandé de conserver également une sauvegarde indépendante du serveur.

### 6.4. Sauvegardes automatiques et copies de sécurité

Les sauvegardes automatiques, lorsqu'elles sont configurées et actives, doivent être distinguées des copies de sécurité créées avant certaines opérations sensibles.

La fréquence exacte des sauvegardes automatiques, leur durée de conservation et leur emplacement doivent être confirmés sur la version déployée avant d'être documentés comme des garanties.

**Important :** avant une restauration, une réinitialisation ou une opération de maintenance importante, vérifiez que vous disposez d'une sauvegarde exploitable.

---

## 7. Architecture technique

L'application repose sur une architecture composée de plusieurs éléments.

### Interface utilisateur

L'interface est développée avec React et TypeScript. Vite est utilisé pour la construction du frontend.

### Serveur

Le serveur Node.js traite les requêtes de l'application et accède aux données stockées.

### Base de données

SQLite conserve les données budgétaires. Le mode WAL est utilisé pour la gestion des accès à la base.

### Conteneurisation

Docker permet de construire et d'exécuter l'application dans un conteneur.

Les données et les journaux sont conservés dans des répertoires montés depuis l'hôte, selon la configuration Docker utilisée.

---

## 8. Installation avec Docker

Cette section décrit une installation à partir du dépôt GitHub.

### 8.1. Prérequis

- Un système compatible avec Docker.
- Docker Engine.
- Le plugin Docker Compose.
- Un accès au dépôt GitHub.
- Un port disponible pour l'application.

### 8.2. Récupérer le projet

```bash
git clone https://github.com/yanfrance-droid/Budget-Perso-Pro.git
cd Budget-Perso-Pro
```

### 8.3. Construire et démarrer l'application

```bash
docker compose up -d --build
```

### 8.4. Vérifier le conteneur

```bash
docker compose ps
docker compose logs --tail=100
```

### 8.5. Accéder à l'application

Depuis un navigateur accessible sur le réseau du serveur, ouvrir :

```text
http://IP-DU-SERVEUR:3001
```

Remplacez `IP-DU-SERVEUR` par l'adresse IP réelle de la machine qui héberge Docker.

### 8.6. Emplacement des données

La configuration Docker prévoit les volumes suivants :

- `./data:/app/data` pour les données de l'application.
- `./logs:/app/logs` pour les journaux.

Le chemin par défaut de la base de données dans le conteneur est :

```text
/app/data/budget.db
```

La configuration peut être adaptée selon les besoins de l'installation.

### 8.7. Mettre à jour l'application

Avant une mise à jour, réalisez une sauvegarde de la base de données et vérifiez qu'elle peut être conservée indépendamment du conteneur.

Après récupération des modifications du dépôt, la reconstruction peut être effectuée avec :

```bash
docker compose up -d --build
```

La procédure exacte dépend de la manière dont le projet a été installé et des modifications apportées à la configuration.

**Attention :** ne supprimez pas les volumes ou les répertoires de données lors d'une mise à jour sans avoir vérifié leur contenu et réalisé une sauvegarde.

---

## 9. Administration et maintenance

L'application comprend des fonctions de maintenance et de diagnostic accessibles depuis les paramètres.

Selon les fonctions disponibles dans la version installée, elles peuvent notamment servir à :

- Vérifier l'intégrité de la base de données.
- Contrôler certaines incohérences de données.
- Effectuer des opérations d'optimisation.
- Consulter des informations de diagnostic.
- Réinitialiser les données budgétaires.

### Réinitialisation

La réinitialisation est une opération sensible : elle supprime des données budgétaires.

Avant de l'utiliser :

1. Vérifiez les données concernées par la réinitialisation.
2. Réalisez une sauvegarde indépendante.
3. Assurez-vous de comprendre les éléments qui seront conservés et ceux qui seront supprimés.

Ne confondez pas la réinitialisation des données avec la suppression du conteneur Docker ou du répertoire de stockage.

### Journaux Docker

Pour consulter les derniers journaux du service :

```bash
docker compose logs --tail=100
```

Pour suivre les journaux en temps réel :

```bash
docker compose logs -f
```

Pour quitter le suivi des journaux, utilisez `Ctrl+C`. Cela arrête l'affichage des journaux, pas nécessairement l'application.

---

## 10. Accès à distance

L'accès à l'application depuis l'extérieur du réseau local doit être configuré avec attention.

Un VPN tel que Tailscale ou WireGuard peut permettre d'accéder à un serveur privé sans exposer directement l'application sur Internet.

Avant toute exposition publique, il convient de vérifier notamment :

- L'authentification et la gestion des sessions.
- La configuration réseau et le pare-feu.
- La sécurité des échanges.
- La protection des sauvegardes.
- La mise à jour régulière du système et de l'application.

Ne considérez pas le fait qu'une application fonctionne sur un réseau local comme une preuve suffisante de sa sécurité pour un accès public.

---

## 11. Questions fréquentes

### L'application se synchronise-t-elle automatiquement avec ma banque ?

Non. Le solde bancaire prévisionnel est calculé à partir des informations enregistrées dans l'application. Il ne signifie pas qu'une connexion bancaire automatique est active.

### Quelle est la différence entre le reste à vivre et le solde bancaire prévisionnel ?

Le reste à vivre est un indicateur budgétaire calculé à partir des revenus, des charges fixes, des charges variables, des crédits et de l'épargne.

Le solde bancaire prévisionnel part du solde réel du compte à un instant donné et estime ce qu'il devrait réellement rester après prise en compte des opérations futures concernées.

### L'export Excel remplace-t-il une sauvegarde ?

Non. L'export Excel sert à consulter ou traiter les données dans un tableur. La sauvegarde de la base SQLite répond au besoin de conserver une copie de la base de données pour une restauration.

### Où sont stockées les données ?

Avec la configuration Docker décrite dans ce document, les données sont conservées dans le répertoire `data` monté sur `/app/data` dans le conteneur. Le chemin réel dépend de l'emplacement du projet et de la configuration utilisée.

### Puis-je supprimer le conteneur sans perdre mes données ?

Les données conservées dans un volume ou un répertoire monté séparément peuvent survivre à la suppression du conteneur. Cela dépend toutefois de la commande utilisée et de la configuration Docker. Vérifiez toujours les volumes et les sauvegardes avant une suppression.

### Que faire avant une restauration ?

Vérifiez que le fichier est une sauvegarde compatible et conservez une copie indépendante de la base actuelle avant de lancer la restauration.

---

Fait par Yann DONNE