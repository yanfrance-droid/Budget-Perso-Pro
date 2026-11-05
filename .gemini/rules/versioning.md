# Règles de versioning automatique

À chaque intervention ou modification de code sur ce projet :
1. Incrémenter systématiquement la version dans `package.json` (SemVer : patch ou minor).
2. Toujours s'assurer que le tag Git correspondant (ex: `vX.Y.Z`) est prêt et qu'aucun tag déjà publié n'est réutilisé afin d'éviter tout blocage lors de l'exécution de `gestion-personal-budget-pro.sh`.
