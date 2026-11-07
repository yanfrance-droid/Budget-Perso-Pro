# Personal Budget Pro — Guide d'Utilisation Pratique

Bienvenue dans le manuel d'utilisation complet de **Personal Budget Pro**. Ce guide pas à pas est conçu pour vous accompagner dans votre gestion budgétaire quotidienne, de la première configuration jusqu'au pilotage patrimonial avancé.

---

## Sommaire

1. [Premiers pas & Paramétrage initial](#1-premiers-pas--paramétrage-initial)
2. [La Routine Quotidienne : Saisie & Pointage sans friction](#2-la-routine-quotidienne--saisie--pointage-sans-friction)
3. [Le Tableau de bord & Les Flash Insights](#3-le-tableau-de-bord--les-flash-insights)
4. [Solde Réel, Solde Prévisionnel & Reste à Vivre : Savoir les distinguer](#4-solde-réel-solde-prévisionnel--reste-à-vivre--savoir-les-distinguer)
5. [Pilotage des Charges & Module d'Analyse (/analyse-charges)](#5-pilotage-des-charges--module-danalyse-analyse-charges)
   - [5.1. Charges Fixes & Taux d'effort réel](#51-charges-fixes--taux-deffort-réel)
   - [5.2. Détection des hausses tarifaires et impact annuel](#52-détection-des-hausses-tarifaires-et-impact-annuel)
   - [5.3. Charges Variables : Enveloppes et dérives chroniques](#53-charges-variables--enveloppes-et-dérives-chroniques)
6. [Dépenses du Quotidien & Projets Futurs](#6-dépenses-du-quotidien--projets-futurs)
7. [Épargne, Virements Internes & Plafonds de Livrets](#7-épargne-virements-internes--plafonds-de-livrets)
8. [Santé & Remboursements en attente](#8-santé--remboursements-en-attente)
9. [Crédits & Amortissement réel](#9-crédits--amortissement-réel)
10. [Sauvegardes, Exportations & Sécurité](#10-sauvegardes-exportations--sécurité)

---

## 1. Premiers pas & Paramétrage initial

Dès l'ouverture de l'application, rendez-vous dans le menu **Paramètres** (accessible dans la barre latérale) pour configurer les bases de votre foyer :

### 1.1. Comptes Bancaires
- Créez vos **Comptes Courants** principaux (ex: *Compte Courant BNP*, *Compte Joint*).
- Créez vos **Comptes d'Épargne** (ex: *Livret A*, *LDDS*, *Assurance Vie*).
- Vous pouvez définir un compte par défaut qui sera présélectionné lors de chaque ajout d'opération.
- *Astuce :* Ne supprimez pas un ancien compte clôturé, passez-le simplement en statut "Fermé" pour conserver tout l'historique de vos bilans passés.

### 1.2. Organismes Verseurs
- Déclarez les tiers qui vous versent des revenus : employeur, caisse d'allocations familiales (CAF), caisse de retraite ou sécurité sociale. Cela permet d'ordonner et d'automatiser vos récurrences de revenus.

### 1.3. Catégories
- Des catégories par défaut vous sont proposées (Alimentation, Énergie, Santé, Transport, etc.). Vous pouvez en créer de nouvelles, personnaliser leurs couleurs ou archiver celles dont vous n'avez pas l'utilité.

---

## 2. La Routine Quotidienne : Saisie & Pointage sans friction

Personal Budget Pro a été optimisé pour exiger un effort de saisie minimal (moins de 2 minutes par jour) :

### Le Composant `<AmountInput />`
- Saisissez vos montants au clavier physique (pavé numérique) ou tactile mobile indifféremment avec un point `.` ou une virgule `,`.
- Le formatage des centimes est automatique sans perte de focus ni saut de curseur.
- Le copier-coller depuis vos relevés bancaires en ligne est nativement nettoyé et reconnu.

### Sécurité Anti-Fermeture Accidentelle
- Lors de la saisie d'un long formulaire dans une modale ou un panneau coulissant, si votre curseur de souris dérape hors de la fenêtre pendant un glisser-relâcher (`drag-to-overlay`), **le formulaire ne se fermera pas**. Vos données en cours de frappe restent protégées.

### Le Pointage des Opérations
Au fur et à mesure que les opérations apparaissent sur votre compte bancaire réel :
1. Cliquez sur le statut de l'opération (ex: `Prévu` ou `En attente`).
2. Passez-le en `Débité` (ou `Encaissé` pour un salaire).
3. Votre **Solde Réel** est immédiatement recalculé à la seconde près.

---

## 3. Le Tableau de bord & Les Flash Insights

Le Tableau de bord est votre cockpit central. En tête de page, le bloc **Flash Insights** analyse l'état complet de vos finances en moins de 2 ms à chaque chargement :

### 3.1. Code Couleur des Sentinelles
- 🔴 **Rouge (Critique) :** Action urgente requise.
  - *Exemple :* "Risque de découvert le 12 du mois : le solde atteindrait -145,00 € avant le virement de salaire."
- 🟡 **Ambre (Attention) :** Dérive constatée nécessitant de lever le pied.
  - *Exemple :* "Sur-cadence des dépenses courantes : 62 % du budget consommé alors que seulement 35 % du mois s'est écoulé."
- 🔵 **Bleu (Conseil) :** Recommandation d'optimisation ou de suivi administratif.
  - *Exemple :* "Plafond Livret A atteint : 23 450 € sur votre compte. Envisagez de réallouer l'excédent vers un LDDS ou une assurance-vie."
  - *Exemple :* "Frais de santé orphelins : 85,00 € avancés il y a plus de 45 jours sans trace de remboursement mutuelle."
- 🟢 **Émeraude (Optimal) :** Opportunité ou situation assainie.
  - *Exemple :* "Excédent disponible : votre solde prévisionnel net de fin de mois permet de placer 250,00 € en épargne sans aucun risque de trésorerie."

### 3.2. Ergonomie et Actions
- **Top 3 prioritaire :** Seuls les 3 conseils les plus urgents sont visibles par défaut pour ne pas surcharger l'esprit.
- **Déplier :** Cliquez sur *"Voir tous les conseils"* pour consulter la totalité des signaux d'alerte.
- **Masquage de session :** Cliquez sur la croix `(X)` d'un conseil pour le masquer pendant votre session de travail. Si vous souhaitez revoir les conseils masqués, cliquez sur *"Réinitialiser les conseils masqués"*.
- **Bouton d'action directe :** Cliquez sur le bouton figurant sur la carte (ex: *"Optimiser l'épargne"*, *"Voir les dépenses"*, *"Vérifier les remboursements"*) pour être directement redirigé vers l'écran adéquat.

---

## 4. Solde Réel, Solde Prévisionnel & Reste à Vivre : Savoir les distinguer

La confusion entre ces trois grandeurs est la cause n°1 des découverts bancaires. Voici comment les interpréter :

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUJOURD'HUI (LE 10 DU MOIS)                     │
├────────────────────────────────────────────────────────────────────────┤
│ Solde Bancaire Réel (sur votre appli bancaire) :              1 800 €  │
│ - Charges fixes restant à prélever d'ici le 31 :               -900 €  │
│ - Dépenses prévues et carte à débit différé :                  -400 €  │
│ ====================================================================== │
│ Solde Bancaire Prévisionnel (Atterrissage au 31) :              500 €  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Le Solde Réel (1 800 €) :** C'est l'argent physiquement disponible sur le compte à la banque. Ne faites jamais de virement d'épargne basé sur ce chiffre, sinon vous serez à découvert le 20 lorsque vos charges tomberont !
- **Le Solde Prévisionnel (500 €) :** C'est votre véritable boussole. Il vous indique avec certitude ce qu'il vous restera sur le compte au dernier jour du mois une fois que tout aura été payé.
- **Le Reste à Vivre (dans l'onglet Revenus) :** C'est votre enveloppe théorique mensuelle pour vivre (nourriture, loisirs, imprévus) une fois vos charges fixes, variables, crédits et épargne programmée déduits de vos rentrées.

---

## 5. Pilotage des Charges & Module d'Analyse (/analyse-charges)

Le module **Analyse des Charges** est le cœur stratégique de l'optimisation financière de votre foyer. Il se concentre sur les dépenses contractuelles et incompressibles.

### 5.1. Charges Fixes & Taux d'effort réel
- L'application calcule le **Taux d'Effort Fixe** en rapportant l'ensemble de vos abonnements, loyers, assurances et charges obligatoires aux **revenus réels constatés** du mois.
- Si ce ratio dépasse 33 %, un voyant d'alerte vous indique que vos charges fixes pèsent trop lourdement sur vos rentrées et limitent votre marge de manœuvre.

### 5.2. Détection des hausses tarifaires et impact annuel
- Les opérateurs télécoms, assureurs ou fournisseurs d'énergie augmentent régulièrement leurs tarifs discrètement de 2 à 5 € par mois.
- Le moteur compare automatiquement vos prélèvements du mois M par rapport à M-1 et à l'historique sur 12 mois.
- Lorsqu'une hausse est détectée, le module affiche l'augmentation unitaire ainsi que son **impact financier annualisé** :
  > *Exemple :* "Forfait Internet Fibre : +4,00 € par rapport au mois dernier. **Impact sur 12 mois : +48,00 € / an**."
- Vous savez ainsi immédiatement quels contrats renégocier ou résilier en priorité.

### 5.3. Charges Variables : Enveloppes et dérives chroniques
- Les charges variables correspondent aux dépenses nécessaires dont le montant fluctue (carburant, électricité, eau, entretien auto).
- **Règle des 3 mois consécutifs :** Si vous dépassez votre enveloppe prévue de plus de 15 % pendant trois mois d'affilée, le moteur considère qu'il ne s'agit plus d'un accident, mais d'une sous-estimation de vos besoins. Il vous suggère alors automatiquement d'ajuster le montant prévu dans vos paramètres à la moyenne réelle constatée.

---

## 6. Dépenses du Quotidien & Projets Futurs

### Dépenses Courantes (Alimentation, sorties, habillement)
- Enregistrez vos dépenses par carte ou espèces.
- Le moteur compare le rythme de vos dépenses par rapport aux jours écoulés du mois : si vous avez déjà dépensé 70 % de votre budget le 10 du mois, vous recevez une alerte de modération.

### Projets & Prévisions
- Vous projetez des vacances à 1 200 € ou des travaux à 3 000 € ?
- Créez une dépense prévisionnelle dans l'onglet **Projets** avec un niveau d'urgence :
  1. *Indispensable* (ex: remplacement machine à laver en panne).
  2. *Souhaitable* (ex: révision voiture avant l'été).
  3. *Optionnel* (ex: nouvel écran TV).
- Cela vous permet de prioriser vos projets sans mettre en danger votre trésorerie courante.

---

## 7. Épargne, Virements Internes & Plafonds de Livrets

### Étanchéité des Virements Internes
Dans Personal Budget Pro, un virement entre votre compte courant et votre Livret A n'est pas une "dépense" : c'est un **enrichissement net**. De même, rapatrier 200 € de votre livret vers votre compte courant pour faire face à un imprévu n'est pas un "revenu" : c'est une **mobilisation de trésorerie**.
- Les virements internes n'altèrent jamais artificiellement vos bilans de revenus ou de dépenses réelles.

### Sentinelle de Plafonnement
- Lorsque votre Livret A ou votre LDDS approche de son plafond réglementaire, le système vous avertit. L'argent dormant au-delà du plafond ou sur un compte courant ne rapporte rien et subit l'inflation : le conseiller vous guide pour orienter l'excédent vers des supports d'épargne alternatifs.

---

## 8. Santé & Remboursements en attente

Le module Santé vous assure qu'aucune avance de frais médicaux ne tombe dans l'oubli :
1. Enregistrez la consultation ou le soin payé.
2. Indiquez la part remboursée par la Sécurité Sociale (CPAM) et la part Mutuelle dès réception.
3. Si un remboursement tarde au-delà de 45 jours, la sentinelle **Flash Insights** vous signale l'anomalie afin que vous puissiez relancer votre organisme de mutuelle.

---

## 9. Crédits & Amortissement réel

Suivez avec une précision mathématique le désendettement de votre foyer :
- Saisissez vos emprunts (immobiliers ou consommation) avec leur capital initial, taux d'intérêt, assurance et date de fin.
- Consultez le **Tableau d'amortissement réel** mois par mois (part du capital remboursé vs part des intérêts et assurance).
- Visualisez le **Capital restant dû** consolidé sur l'ensemble de vos prêts.

---

## 10. Sauvegardes, Exportations & Sécurité

Vos données financières sont précieuses et confidentielles. Voici comment les préserver :

### 10.1. Sauvegardes Automatiques à Chaud
- Chaque jour, le serveur exécute un `VACUUM INTO` créant une copie fidèle de votre base `budget.db` dans `data/backups/auto/`.
- Les 7 derniers jours glissants sont conservés automatiquement.

### 10.2. Export Excel Certifié
- Depuis l'onglet Paramètres, cliquez sur **Exporter en Excel**.
- Vous obtenez un fichier `.xlsx` multi-onglets complet pour vos archives ou pour analyse dans votre tableur favori.

### 10.3. Restauration en un Clic
- En cas de changement de serveur ou de réinstallation, chargez simplement votre fichier de sauvegarde `.db` via l'interface. Une copie de sécurité préventive est créée automatiquement avant toute application.

### 10.4. Routine d'Administration & Script Shell d'Exploitation (`gestion-personal-budget-pro.sh`)
Pour les utilisateurs hébergeant l'application sur un serveur personnel (Proxmox, conteneur LXC ou machine Linux dédiée), un script shell interactif d'administration est fourni à la racine : `gestion-personal-budget-pro.sh`.

- **Mise à jour sans risque en un clic :**
  En lançant le script (`sudo ./gestion-personal-budget-pro.sh`), l'option `2. Mise à jour` effectue automatiquement :
  1. Une sauvegarde physique instantanée de votre base SQLite dans `data/backups/`.
  2. Un contrôle strict d'intégrité (`PRAGMA integrity_check`) sur la copie de sauvegarde avant toute modification.
  3. La récupération sécurisée des dernières versions sur Git (`fetch --tags` et `pull --ff-only`).
  4. La recompilation propre du conteneur Docker en production.
  5. Une vérification active de l'état de santé (`healthy`) de l'application avant de finaliser l'opération.
- **Sanctuarisation des données :** Vos répertoires `data/` (données et sauvegardes), `logs/` et vos réglages `.env` sont sanctuarisés et préservés systématiquement lors de toute opération de mise à jour ou de réinstallation.

---

*Pour toute question technique supplémentaire ou contribution au projet, consultez le fichier `README.md` ou contactez le dépôt officiel.*
