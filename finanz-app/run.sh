#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Finanz App..."

export DATA_PATH="/config/finanz-app"
mkdir -p "${DATA_PATH}"

cd /app/backend
exec node server.js
