# Règles de gouvernance, de documentation et de versioning automatique

## Règles d'Or pour tout Agent IA ou Développeur (Impératif)
1. « Règle d'or : Tu dois impérativement lire et intégrer `PROJECT_KNOWLEDGE.md` avant d'analyser le code ou d'écrire la moindre modification. »
2. « Règle d'or : À chaque modification de code, commit ou release, tu dois mettre à jour ce fichier (`PROJECT_KNOWLEDGE.md`) en conséquence pour qu'il reste 100% à jour. »

## Règles de versioning automatique
À chaque intervention ou modification de code sur ce projet :
1. Incrémenter systématiquement la version dans `package.json` (SemVer : patch ou minor).
2. Toujours s'assurer que le tag Git correspondant (ex: `vX.Y.Z`) est prêt et qu'aucun tag déjà publié n'est réutilisé afin d'éviter tout blocage lors de l'exécution de `gestion-personal-budget-pro.sh`.
