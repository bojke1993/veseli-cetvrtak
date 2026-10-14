#!/bin/bash
# Starts MySQL (official image entrypoint, initializes /var/lib/mysql on first run)
# and then the Node app. Forwards SIGTERM to both; exits when either dies.
set -euo pipefail

: "${DB_PASSWORD:?DB_PASSWORD must be set}"
export MYSQL_DATABASE="${DB_NAME}"
export MYSQL_USER="${DB_USER}"
export MYSQL_PASSWORD="${DB_PASSWORD}"
if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  export MYSQL_RANDOM_ROOT_PASSWORD=yes
fi

docker-entrypoint.sh mysqld &
mysql_pid=$!

echo "[vc] Čekam MySQL..."
for i in $(seq 1 180); do
  if mysqladmin --protocol=tcp -h127.0.0.1 -P"${DB_PORT}" -u"${DB_USER}" -p"${DB_PASSWORD}" ping >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$mysql_pid" 2>/dev/null; then
    echo "[vc] MySQL se zaustavio pri pokretanju." >&2
    exit 1
  fi
  sleep 1
done

echo "[vc] MySQL spreman, pokrećem aplikaciju."
cd /app/server
node dist/index.js &
node_pid=$!

shutdown() {
  echo "[vc] Gašenje..."
  kill -TERM "$node_pid" 2>/dev/null || true
  wait "$node_pid" 2>/dev/null || true
  kill -TERM "$mysql_pid" 2>/dev/null || true
  wait "$mysql_pid" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# Exit (and let Docker restart the container) if either process dies.
wait -n "$node_pid" "$mysql_pid"
status=$?
echo "[vc] Proces je završen (kod $status), gasim kontejner." >&2
kill -TERM "$node_pid" "$mysql_pid" 2>/dev/null || true
wait || true
exit "$status"
