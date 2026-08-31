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

exec /usr/local/bin/docker-startup.sh npm start
