#!/bin/sh
set -e

OPTIONS=/data/options.json
DATA_DB=/data/db
DATA_ENV=/data/env
DATA_FILES=/data/files
ENV_FILE="${DATA_ENV}/.env"

option() {
    [ -f "$OPTIONS" ] || return 0
    jq -r --arg k "$1" '.[$k] // empty' "$OPTIONS" 2>/dev/null
}

# docker-startup.sh sources this file with `set -a`, so values here override any
# exported variable. Options must be written into the file, not exported.
# ENC_HASH/JWT_SECRET are generated once by env:ensure and must survive restarts.
set_env() {
    key="$1"
    value="$2"
    if [ -f "$ENV_FILE" ]; then
        grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp" || true
        mv "${ENV_FILE}.tmp" "$ENV_FILE"
    fi
    [ -n "$value" ] && echo "${key}=\"${value}\"" >> "$ENV_FILE"
    return 0
}

# /db, /app/env and /app/Files are VOLUME mount points in the upstream image, so
# the directories themselves cannot be replaced (rm fails with EBUSY). Persist
# data by pointing the database at /data through environment variables and by
# linking files and subdirectories *inside* the mounts, never the mounts.
mkdir -p "$DATA_DB" "$DATA_ENV" "$DATA_FILES/photos" "$DATA_FILES/feedback"

if [ ! -e "$ENV_FILE" ] && [ -f /app/env/.env ] && [ ! -L /app/env/.env ]; then
    cp /app/env/.env "$ENV_FILE"
fi
if [ ! -L /app/env/.env ]; then
    rm -f /app/env/.env
    ln -s "$ENV_FILE" /app/env/.env
fi

for sub in photos feedback; do
    if [ ! -L "/app/Files/${sub}" ]; then
        rm -rf "/app/Files/${sub}"
        ln -s "${DATA_FILES}/${sub}" "/app/Files/${sub}"
    fi
done

# Vaccine documents are written to the Files root rather than a subdirectory,
# so each one is relocated to /data and linked back individually.
for f in /app/Files/*.enc; do
    [ -f "$f" ] || continue
    [ -L "$f" ] && continue
    mv "$f" "${DATA_FILES}/$(basename "$f")"
    ln -s "${DATA_FILES}/$(basename "$f")" "$f"
done

TIMEZONE=$(option timezone)
[ -z "$TIMEZONE" ] && TIMEZONE="${TZ:-UTC}"
set_env TZ "$TIMEZONE"

if [ "$(option enable_notifications)" = "true" ]; then
    set_env ENABLE_NOTIFICATIONS "true"
else
    set_env ENABLE_NOTIFICATIONS "false"
fi

if [ "$(option enable_log)" = "true" ]; then
    set_env ENABLE_LOG "true"
else
    set_env ENABLE_LOG "false"
fi

set_env APP_URL "$(option app_url)"

# docker-startup.sh re-applies these after sourcing the env file, so exporting
# them wins and keeps the databases on /data rather than the container layer.
export DATABASE_PROVIDER="sqlite"
export DATABASE_URL="file:${DATA_DB}/baby-tracker.db"
export LOG_DATABASE_URL="file:${DATA_DB}/baby-tracker-logs.db"

echo "Sprout Track: timezone=${TIMEZONE}, data=/data"

APP_INTERNAL_PORT=3001
APP_HTTP_PORT=3000
set_env PORT "$APP_INTERNAL_PORT"
export PORT="$APP_INTERNAL_PORT"

# Next.js resolves basePath at build time, so serving the app under the ingress
# prefix means rebuilding against it. The prefix is fixed for the life of the
# installation, so the result is cached and only rebuilt if the prefix changes.
INGRESS_BASE_PATH=""
if [ -n "$SUPERVISOR_TOKEN" ]; then
    INGRESS_BASE_PATH=$(
        curl -fsSL -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            http://supervisor/addons/self/info 2>/dev/null |
            jq -r '.data.ingress_entry // empty' 2>/dev/null
    )
fi

# The stamp lives with the build rather than in /data: rebuilding the add-on
# replaces /app/.next with the image's unprefixed build, and a stamp that
# outlived it would skip the rebuild and serve assets the browser cannot find.
STAMP="/app/.next/.ha-ingress-base-path"
if [ -n "$INGRESS_BASE_PATH" ] && [ "$(cat "$STAMP" 2>/dev/null)" != "$INGRESS_BASE_PATH" ]; then
    echo "Sprout Track: building for ingress (first start, a few minutes)"

    # Turbopack refuses to build when the project contains symlinks that leave
    # the project root, and reuses a cache built before those links existed.
    cp -f "$ENV_FILE" /app/.env 2>/dev/null || true
    mv /app/db /tmp/ha-db-link 2>/dev/null || true
    mv /app/Files /tmp/ha-files-link 2>/dev/null || true
    rm -rf /app/.next/cache

    if NEXT_BASE_PATH="$INGRESS_BASE_PATH" npm --prefix /app run build >/tmp/ingress-build.log 2>&1; then
        printf '%s' "$INGRESS_BASE_PATH" > "$STAMP"
        echo "Sprout Track: ingress build complete"
    else
        echo "Sprout Track: ingress build failed, see /tmp/ingress-build.log"
        tail -5 /tmp/ingress-build.log
        # The running build has no prefix, so the shim must not add one either.
        INGRESS_BASE_PATH=""
    fi

    mv /tmp/ha-db-link /app/db 2>/dev/null || true
    mv /tmp/ha-files-link /app/Files 2>/dev/null || true
fi

# Trust the build itself rather than the stamp: if the prefix is missing from
# the compiled output the browser would request assets that are not there, so
# fall back to serving unprefixed, which at least renders.
if [ -n "$INGRESS_BASE_PATH" ] && ! grep -rqs "hassio_ingress" /app/.next/static 2>/dev/null; then
    echo "Sprout Track: ingress prefix missing from build; serving without it"
    INGRESS_BASE_PATH=""
fi

HTTP_LISTEN_PORT="$APP_HTTP_PORT" APP_INTERNAL_PORT="$APP_INTERNAL_PORT" \
    INGRESS_BASE_PATH="$INGRESS_BASE_PATH" \
    node /usr/local/bin/tls-proxy.js &

INGRESS_PORT=8099 APP_INTERNAL_PORT="$APP_INTERNAL_PORT" \
    INGRESS_BASE_PATH="$INGRESS_BASE_PATH" \
    node /usr/local/bin/ingress-forward.js &

# next.config.ts reads NEXT_BASE_PATH when the server starts as well as when it
# builds. Without it here the server routes as if there were no prefix while the
# compiled assets carry one, so the client and server disagree about the path.
export NEXT_BASE_PATH="$INGRESS_BASE_PATH"
set_env NEXT_BASE_PATH "$INGRESS_BASE_PATH"

exec /usr/local/bin/docker-startup.sh npm start
