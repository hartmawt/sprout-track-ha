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

mkdir -p "$DATA_DB" "$DATA_ENV" "$DATA_FILES"

if [ ! -f "$ENV_FILE" ] && [ -f /app/env/.env ] && [ ! -L /app/env ]; then
    cp /app/env/.env "$ENV_FILE"
fi

# Redirect the image's volume paths onto /data, which Home Assistant persists
# and includes in backups.
if [ ! -L /app/env ]; then
    rm -rf /app/env
    ln -s "$DATA_ENV" /app/env
fi
if [ ! -L /db ]; then
    rm -rf /db
    ln -s "$DATA_DB" /db
fi
if [ ! -L /app/Files ]; then
    rm -rf /app/Files
    ln -s "$DATA_FILES" /app/Files
fi

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

echo "Sprout Track: timezone=${TIMEZONE}, data=/data"

exec /usr/local/bin/docker-startup.sh npm start
