#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/personal-budget-pro-git"
REPO_URL="https://github.com/yanfrance-droid/Budget-Perso-Pro.git"
PROJECT="personal-budget-pro-git"
SERVICE="budget-perso-pro"
CONTAINER="budget-perso-pro"
BRANCH="main"
TEMP_DIR=""

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf -- "$TEMP_DIR"
    fi
}
trap cleanup EXIT

pause() {
    echo
    read -r -p "Appuie sur Entrée pour revenir au menu..."
}

require_root() {
    [[ "$EUID" -eq 0 ]] || {
        echo "Erreur : lance ce script en root."
        exit 1
    }
}

check_tools() {
    for tool in git docker; do
        command -v "$tool" >/dev/null 2>&1 || {
            echo "Outil manquant : $tool"
            return 1
        }
    done
    docker compose version >/dev/null 2>&1 || return 1
    docker info >/dev/null 2>&1 || return 1
}

compose() {
    docker compose -p "$PROJECT" "$@"
}

verify_existing_install() {
    [[ -d "$APP_DIR/.git" && -f "$APP_DIR/docker-compose.yml" ]] || {
        echo "Installation Git ou fichier Compose introuvable."
        return 1
    }

    local remote project service directory
    remote="$(git -C "$APP_DIR" remote get-url origin)" || return 1
    [[ "$remote" == "$REPO_URL" ]] || {
        echo "Dépôt Git inattendu : $remote"
        return 1
    }

    docker inspect "$CONTAINER" >/dev/null 2>&1 || {
        echo "Conteneur attendu introuvable."
        return 1
    }

    project="$(docker inspect "$CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project"}}')" || return 1
    service="$(docker inspect "$CONTAINER" --format '{{index .Config.Labels "com.docker.compose.service"}}')" || return 1
    directory="$(docker inspect "$CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')" || return 1

    [[ "$project" == "$PROJECT" && "$service" == "$SERVICE" && "$directory" == "$APP_DIR" ]] || {
        echo "Identité Docker différente de celle attendue. Annulation."
        return 1
    }

    echo "Installation vérifiée."
}

backup_database() {
    local timestamp backup integrity running
    timestamp="$(date +%Y%m%d-%H%M%S)"
    backup="budget-before-script-${timestamp}.db"

    running="$(docker inspect "$CONTAINER" --format '{{.State.Running}}')" || return 1
    [[ "$running" == "true" ]] || {
        echo "Conteneur arrêté : sauvegarde impossible."
        return 1
    }

    mkdir -p "$APP_DIR/data/backups" || return 1

    echo "Création de la sauvegarde SQLite..."
    docker exec "$CONTAINER" sqlite3 /app/data/budget.db \
        ".backup '/app/data/backups/${backup}'" || return 1

    docker exec "$CONTAINER" test -s "/app/data/backups/${backup}" || return 1

    integrity="$(docker exec "$CONTAINER" sqlite3 \
        "/app/data/backups/${backup}" "PRAGMA integrity_check;")" || return 1

    [[ "$integrity" == "ok" ]] || {
        echo "Sauvegarde invalide : $integrity"
        return 1
    }

    echo "Sauvegarde vérifiée : $APP_DIR/data/backups/$backup"
}

wait_for_health() {
    echo "Attente de l'état healthy..."
    for i in $(seq 1 60); do
        local state
        state="$(docker inspect "$CONTAINER" \
            --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            2>/dev/null)" || state="inconnu"

        [[ "$state" == "healthy" ]] && {
            echo "Application opérationnelle."
            return 0
        }

        if [[ "$state" == "unhealthy" || "$state" == "exited" ]]; then
            docker logs --tail 60 "$CONTAINER" || true
            return 1
        fi
        sleep 5
    done

    echo "Délai d'attente dépassé."
    docker logs --tail 60 "$CONTAINER" || true
    return 1
}

check_git_clean() {
    local status
    status="$(git -C "$APP_DIR" status --porcelain)" || return 1

    if [[ -n "$status" ]]; then
        while IFS= read -r line; do
            case "$line" in
                "?? data/"*|"?? logs/"*) ;;
                *)
                    echo "Modification Git locale détectée : $line"
                    echo "Opération annulée pour protéger tes fichiers."
                    return 1
                    ;;
            esac
        done <<< "$status"
    fi
}

new_install() {
    echo "===== NOUVELLE INSTALLATION ====="

    [[ ! -e "$APP_DIR" ]] || {
        echo "Le dossier existe déjà : $APP_DIR"
        return 1
    }

    if docker inspect "$CONTAINER" >/dev/null 2>&1; then
        echo "Le conteneur existe déjà. Annulation."
        return 1
    fi

    echo "Dépôt privé : Git pourra demander ton identifiant et ton token GitHub."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR" || return 1

    if [[ ! -f "$APP_DIR/.env" && -f "$APP_DIR/.env.example" ]]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env" || return 1
    fi

    mkdir -p "$APP_DIR/data" "$APP_DIR/logs" || return 1

    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --build "$SERVICE" || return 1

    wait_for_health || return 1
    echo "Nouvelle installation terminée."
}

update_install() {
    echo "===== MISE À JOUR ====="

    verify_existing_install || return 1
    check_git_clean || return 1
    backup_database || return 1

    git -C "$APP_DIR" fetch --tags --force || return 1
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH" || return 1

    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" build "$SERVICE" || return 1

    compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --force-recreate "$SERVICE" || return 1

    wait_for_health || return 1

    echo "Nettoyage du cache Docker..."
    docker builder prune -a -f || echo "Avertissement : nettoyage du cache échoué."
    echo "Mise à jour terminée."
}

reinstall_install() {
    echo "===== RÉINSTALLATION ====="
    echo "Le code sera remplacé. Données, sauvegardes, logs et .env seront conservés."

    read -r -p "Tape exactement REINSTALLER pour confirmer : " confirmation
    [[ "$confirmation" == "REINSTALLER" ]] || {
        echo "Réinstallation annulée."
        return 0
    }

    verify_existing_install || return 1
    check_git_clean || return 1
    backup_database || return 1

    TEMP_DIR="$(mktemp -d /opt/pbp-reinstall.XXXXXX)" || return 1
    local new_repo="$TEMP_DIR/new-repo"
    local old_repo="${APP_DIR}.old-$(date +%Y%m%d-%H%M%S)"

    git clone --branch "$BRANCH" "$REPO_URL" "$new_repo" || return 1

    mkdir -p "$new_repo/data" "$new_repo/logs" || return 1

    cp -a "$APP_DIR/data/." "$new_repo/data/" || return 1
    cp -a "$APP_DIR/logs/." "$new_repo/logs/" || return 1

    if [[ -f "$APP_DIR/.env" ]]; then
        cp -a "$APP_DIR/.env" "$new_repo/.env" || return 1
    fi

    mv "$APP_DIR" "$old_repo" || return 1

    if ! mv "$new_repo" "$APP_DIR"; then
        echo "Échec du remplacement. Restauration de l'ancien dossier."
        mv "$old_repo" "$APP_DIR" || true
        return 1
    fi

    if ! compose -f "$APP_DIR/docker-compose.yml" \
        --project-directory "$APP_DIR" up -d --build --force-recreate "$SERVICE"; then
        echo "Échec du démarrage. Ancien code conservé : $old_repo"
        return 1
    fi

    if ! wait_for_health; then
        echo "Application non saine. Ancien code conservé : $old_repo"
        return 1
    fi

    echo "Réinstallation terminée."
    echo "Ancien dossier conservé : $old_repo"

    docker builder prune -a -f || echo "Avertissement : nettoyage du cache échoué."
}

main_menu() {
    while true; do
        echo
        echo "=========================================="
        echo "   GESTION DE PERSONAL BUDGET PRO"
        echo "=========================================="
        echo "1. Nouvelle installation"
        echo "2. Mise à jour"
        echo "3. Réinstallation"
        echo "4. Quitter"
        echo

        read -r -p "Choix : " choice

        case "$choice" in
            1) if new_install; then :; else echo "Installation interrompue."; fi; pause ;;
            2) if update_install; then :; else echo "Mise à jour interrompue."; fi; pause ;;
            3) if reinstall_install; then :; else echo "Réinstallation interrompue."; fi; pause ;;
            4) echo "Au revoir."; exit 0 ;;
            *) echo "Choix invalide."; pause ;;
        esac
    done
}

require_root
check_tools
main_menu
