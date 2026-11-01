#!/bin/bash
set -Eeuo pipefail

APP_DIR="/opt/personal-budget-pro-git"
CONTAINER="budget-perso-pro"
SERVICE="budget-perso-pro"
BACKUP_DIR="$APP_DIR/data"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/budget-before-update-$TIMESTAMP.db"

cd "$APP_DIR"

echo
echo "========================================"
echo " Mise à jour de PersonalBudgetPro"
echo "========================================"

echo
echo "[1/6] Vérification du conteneur actuel..."
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "ERREUR : conteneur $CONTAINER introuvable."
    exit 1
fi

echo
echo "[2/6] Sauvegarde de la base SQLite..."
mkdir -p "$BACKUP_DIR"
docker exec "$CONTAINER" sqlite3 /app/data/budget.db ".backup '/app/data/budget-before-update-$TIMESTAMP.db'"
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERREUR : la sauvegarde n'a pas été créée correctement."
    exit 1
fi
echo "Sauvegarde créée : $BACKUP_FILE"

echo
echo "[3/6] Récupération du code depuis GitHub..."
git fetch origin --tags
git pull --ff-only origin main

echo
echo "[4/6] Construction de l'image Docker..."
docker compose build "$SERVICE"

echo
echo "[5/6] Redémarrage de l'application..."
docker compose up -d --force-recreate "$SERVICE"

echo
echo "[6/6] Vérification de l'état de santé..."
for i in $(seq 1 30); do
    STATUS="$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "inconnu")"
    if [ "$STATUS" = "healthy" ]; then
        echo
        echo "SUCCÈS : PersonalBudgetPro est opérationnel."
        docker exec "$CONTAINER" node -p "require('/app/package.json').version"
        echo
        echo "Nettoyage du cache de construction Docker..."
        docker builder prune -a -f || echo "ATTENTION : le nettoyage du cache a rencontré une erreur."
        echo "Nettoyage terminé."
        exit 0
    fi
    echo "État actuel : $STATUS ($i/30)"
    sleep 5
done

echo
echo "ATTENTION : l'application n'est pas devenue healthy."
echo "Voici les derniers logs du conteneur :"
docker logs --tail 80 "$CONTAINER"
exit 1
