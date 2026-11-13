# DB_DOCTOR_CHECKLIST.md — Spécification & Matrice Forensic du Moteur d'Intégrité

## 1. Principes Directeurs et Règles d'Or de Sécurité
1. **Zéro mutation silencieuse au démarrage :** Le démarrage de l'application (`initDatabase` / `runStartupMaintenance`) est 100 % non-destructif. Aucune transaction, aucun lien et aucun compte ne doit être altéré silencieusement.
2. **Découplage strict Diagnostic / Réparation :**
   - **DB Doctor (`dbDoctorService.ts`)** : 100 % lecture seule (`SELECT` stricts). Analyse et classe les anomalies sans écrire un seul octet.
   - **DB Healer (`dbHealerService.ts`)** : Réparation chirurgicale explicite. Nécessite obligatoirement un accord utilisateur préalable, une simulation à blanc (Dry-Run), et un backup SQLite transactionnel.
3. **Respect absolu du scellage historique :** Les transactions des mois passés (`date < currentMonth`) détachées de leur template (`templateId = NULL`) représentent des échéances historiques légitimes suite à résiliation. Elles ne doivent JAMAIS être re-liées ou modifiées de force.
4. **Interdiction formelle de réassignation aveugle :**
   - Interdiction de réassigner automatiquement une transaction ayant un `accountId` orphelin vers un compte par défaut. Cela masquerait une corruption comptable grave.
   - Interdiction de passer silencieusement `destinationAccountId = NULL` sur un virement interne sans confirmation utilisateur (déséquilibre de flux).

---

## 2. Matrice Forensic des 13 Anomalies Réelles de `budget.db`

| ID | Anomalie Métier | Détection SQL Forensic (Schéma Réel) | Gravité | Politique de Traitement Healer |
|---|---|---|---|---|
| **ANOM-01** | Orphelin `linkedId` introuvable (splits) | `t.deleted_at IS NULL AND t.linkedId IS NOT NULL AND t.type NOT IN ('loan_payment', 'health_reimbursement') AND t.linkedId NOT IN (SELECT id FROM transactions)` | Élevée | Nettoyage `linkedId = NULL` avec sauvegarde |
| **ANOM-02** | Remboursement santé orphelin | `t.deleted_at IS NULL AND t.type = 'health_reimbursement' AND t.linkedId IS NOT NULL AND t.linkedId NOT IN (SELECT id FROM transactions WHERE type = 'health_expense' AND deleted_at IS NULL)` | Modérée | Alerte utilisateur : dissociation proposée |
| **ANOM-03** | Mensualité de prêt orpheline | `t.deleted_at IS NULL AND t.type = 'loan_payment' AND t.linkedId IS NOT NULL AND t.linkedId NOT IN (SELECT id FROM loans)` | Critique | Alerte UI : proposition de rattachement ou conversion |
| **ANOM-04** | Virement interne sans compte destinataire | `t.deleted_at IS NULL AND t.type = 'transfer' AND (t.destinationAccountId IS NULL OR t.destinationAccountId NOT IN (SELECT id FROM accounts))` | Bloquante | **Zéro auto-réparation**. Arbitrage manuel requis |
| **ANOM-05** | Transaction sans compte valide | `t.deleted_at IS NULL AND t.accountId NOT IN (SELECT id FROM accounts)` | Bloquante | **Zéro auto-réassignation**. Signalement d'intégrité |
| **ANOM-06** | Transaction liée à une catégorie supprimée | `t.deleted_at IS NULL AND t.categoryId IS NOT NULL AND t.categoryId NOT IN (SELECT id FROM categories)` | Mineure | Dissociation sûre (`categoryId = NULL`) |
| **ANOM-07** | Transaction liée à un payeur supprimé | `t.deleted_at IS NULL AND t.payerId IS NOT NULL AND t.payerId NOT IN (SELECT id FROM income_payers)` | Mineure | Dissociation sûre (`payerId = NULL`) |
| **ANOM-08** | Transaction liée à un contrat supprimé | `t.deleted_at IS NULL AND t.templateId IS NOT NULL AND t.templateId NOT IN (SELECT id FROM recurrence_templates)` | Modérée | Détachement propre (`templateId = NULL`) |
| **ANOM-09** | Doublon actif de template dans le même mois | `SELECT substr(date, 1, 7) as m, templateId, COUNT(*) FROM transactions WHERE deleted_at IS NULL AND templateId IS NOT NULL GROUP BY m, templateId HAVING COUNT(*) > 1` | Conflit | Proposition de dédoublonnage explicite |
| **ANOM-10** | Dépense prévisionnelle avec catégorie invalide | `categoryId IS NOT NULL AND categoryId NOT IN (SELECT id FROM categories)` sur `planned_expenses` | Mineure | Nettoyage `categoryId = NULL` |
| **ANOM-11** | Palier d'historique de prêt orphelin | `loanId NOT IN (SELECT id FROM loans)` sur `loan_payment_history` | Modérée | Purge ou réaffectation |
| **ANOM-12** | Capital de prêt restant négatif ou anomalie d'amortissement | `loans.remainingCapital < 0` OU `amortizedCapital > amount` sur `transactions` | Critique | Audit financier, alerte visible |
| **ANOM-13** | Dépense active non pointée dans un mois passé clos | `t.deleted_at IS NULL AND substr(t.date, 1, 7) < strftime('%Y-%m', 'now') AND t.status = 'planned'` | Alerte temporelle | Alerte assistée (choix utilisateur : pointer ou purger) |

---

## 3. Checklist Opérationnelle des Phases d'Implémentation

### Phase 0 : Safe Boot & Neutralisation des réparations silencieuses
- [x] Retrait de l'import et de l'appel à `repairOrphans(db)` dans `server/db.ts` (`runStartupMaintenance`).
- [x] Maintien de la signature `{ repaired: 0, purged }` dans `runStartupMaintenance(db)` pour rétrocompatibilité.
- [x] Retrait de l'appel automatique à `rehabilitateOrphanRecurrentTransactions(db)` dans `runMigrations`.
- [x] Conservation de l'export de `rehabilitateOrphanRecurrentTransactions` dans `server/db.ts` pour ses tests unitaires.
- [x] Adaptation du test `3d` dans `server/services/maintenanceService.test.ts` (vérifier que le boot ne mute rien).
- [x] Vérification que 68 suites de tests / 649 tests sont 100 % au vert (`npm test`).

### Phase 1 : Spécification & Sauvegarde de Référence
- [x] Création du fichier `DB_DOCTOR_CHECKLIST.md` à la racine du projet.
- [x] Création de la copie de sauvegarde de référence `data/backups/budget_v1.5.0_reference.db`.
- [x] Vérification Git : confirmer que `git status` ignore strictement la base de backup.

### Phase 2 : Moteur de Diagnostic en Lecture Seule (`dbDoctorService.ts`)
- [x] Création de `server/services/dbDoctorService.ts` avec la fonction pure `runDoctorAudit(db: DatabaseSync): DoctorReport`.
- [x] Implémentation des 13 règles de détection SQL forensic (`ANOM-01` à `ANOM-13`).
- [x] Exposition de l'endpoint API sécurisé `GET /api/maintenance/doctor`.
- [x] Suite de tests unitaires dédiée `server/services/dbDoctorService.test.ts`.

### Phase 3 : Moteur de Réparation Sécurisée (`dbHealerService.ts`)
- [x] Création de `server/services/dbHealerService.ts` avec modes `dryRun: true` et `dryRun: false`.
- [x] Sauvegarde SQLite atomique avant toute écriture.
- [x] Génération d'un rapport d'audit diff avant/après horodaté.
- [x] Exposition des endpoints `POST /api/maintenance/doctor/dry-run` et `POST /api/maintenance/healer`.
- [x] Suite de tests unitaires dédiée `server/services/dbHealerService.test.ts`.

### Phase 4 : Interface Utilisateur UI (Maintenance & Diagnostic)
- [x] Intégration dans `src/pages/Settings.tsx` (rubrique Maintenance).
- [x] Affichage de la carte d'état de santé globale issue du DB Doctor.
- [x] Modal de prévisualisation Dry-Run avant toute action de réparation.
- [x] Bouton d'action explicite sécurisé avec confirmation.

### Phase 5 : Recette Finale, Non-Régression & Release
- [x] Exécution de l'intégralité des tests Vitest (68 suites initiales + nouvelles suites Doctor/Healer).
- [x] Build de production `npm run build` sans avertissement TypeScript.
- [x] Audit d'intégrité finale sur la base réelle `data/budget.db` (496 transactions).
