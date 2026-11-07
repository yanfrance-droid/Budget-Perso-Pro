# Journal des Modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/), et ce projet adhère à [Semantic Versioning (SemVer)](https://semver.org/spec/v2.0.0.html).

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
