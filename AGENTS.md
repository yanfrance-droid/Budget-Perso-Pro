# Règles d'exploitation, de gouvernance et de versioning - Personal Budget Pro

## Règles d'Or pour tout Agent IA ou Développeur (Impératif)
1. **Consultation préalable obligatoire :**
   - « Règle d'or : Tu dois impérativement lire et intégrer `PROJECT_KNOWLEDGE.md` avant d'analyser le code ou d'écrire la moindre modification. »
2. **Maintenance continue de la connaissance :**
   - « Règle d'or : À chaque modification de code, commit ou release, tu dois mettre à jour ce fichier (`PROJECT_KNOWLEDGE.md`) en conséquence pour qu'il reste 100% à jour. »

## Règle absolue de versioning (SemVer & Git Tags)
À chaque modification de code sur ce projet (correction de bug, amélioration, nouvelle fonctionnalité ou préparation d'un commit/push Git) :
1. **Incrémentation systématique de la version :**
   - Mettre à jour le champ `"version"` dans `package.json` selon la norme SemVer :
     - Incrément **PATCH** (ex: `1.1.2` -> `1.1.3`) pour les corrections de bugs ou ajustements mineurs.
     - Incrément **MINOR** (ex: `1.1.2` -> `1.2.0`) pour les nouvelles fonctionnalités ou modifications notables.
2. **Cohérence avec les tags Git et le script de déploiement :**
   - Le script de déploiement `gestion-personal-budget-pro.sh` repose sur les tags Git distants (`fetch origin --tags`).
   - Ne JAMAIS réutiliser un numéro de version ou un tag Git existant pour éviter les conflits `[rejected] (would clobber existing tag)`.
   - Toujours associer le nouveau commit au tag Git correspondant (ex: tag `v1.1.2` pour la version `1.1.2`).
