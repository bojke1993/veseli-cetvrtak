#!/usr/bin/env bash
# Local run on Windows (Git Bash) without Docker: MySQL from .localdb/mysql with data in
# .localdb/data (persists between runs) + the built app on http://localhost:8080.
# Usage: ./scripts/local.sh            (Ctrl+C stops the app and MySQL)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LDB="$ROOT/.localdb"
MYSQL="$LDB/mysql"
DATA="$LDB/data"
DB_PORT="${DB_PORT:-3307}"
APP_PORT="${PORT:-8080}"
win() { cygpath -m "$1"; }

[ -x "$MYSQL/bin/mysqld.exe" ] || { echo "Nedostaje $MYSQL/bin/mysqld.exe (vidi README, 'Lokalno pokretanje')."; exit 1; }

if [ ! -d "$DATA/mysql" ]; then
  echo "==> Prvo pokretanje: inicijalizujem MySQL bazu u .localdb/data"
  mkdir -p "$DATA"
  "$MYSQL/bin/mysqld.exe" --no-defaults --initialize-insecure --basedir="$(win "$MYSQL")" --datadir="$(win "$DATA")" --console
  FIRST_RUN=1
fi

echo "==> Pokrećem MySQL na portu $DB_PORT"
"$MYSQL/bin/mysqld.exe" --no-defaults --basedir="$(win "$MYSQL")" --datadir="$(win "$DATA")" \
  --port="$DB_PORT" --bind-address=127.0.0.1 --mysqlx=OFF --default-time-zone=+00:00 \
  --innodb-buffer-pool-size=128M --character-set-server=utf8mb4 --console > "$LDB/mysqld.log" 2>&1 &
MYSQLD_PID=$!

stop_mysql() {
  echo "==> Gasim MySQL"
  "$MYSQL/bin/mysqladmin.exe" --protocol=tcp -h127.0.0.1 -P"$DB_PORT" -uroot shutdown 2>/dev/null || kill "$MYSQLD_PID" 2>/dev/null || true
}
trap stop_mysql EXIT

for _ in $(seq 1 60); do
  "$MYSQL/bin/mysqladmin.exe" --protocol=tcp -h127.0.0.1 -P"$DB_PORT" -uroot ping >/dev/null 2>&1 && break
  kill -0 "$MYSQLD_PID" 2>/dev/null || { echo "MySQL se nije pokrenuo, vidi .localdb/mysqld.log"; exit 1; }
  sleep 1
done

"$MYSQL/bin/mysql.exe" --protocol=tcp -h127.0.0.1 -P"$DB_PORT" -uroot -e \
  "CREATE DATABASE IF NOT EXISTS veseli_cetvrtak CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER IF NOT EXISTS 'vc'@'127.0.0.1' IDENTIFIED BY 'vc';
   GRANT ALL ON veseli_cetvrtak.* TO 'vc'@'127.0.0.1';"

if [ ! -f "$ROOT/server/dist/index.js" ] || [ ! -f "$ROOT/web/dist/index.html" ]; then
  echo "==> Build aplikacije"
  (cd "$ROOT" && npm run build)
fi

echo "==> Aplikacija: http://localhost:$APP_PORT"
cd "$ROOT/server"
PORT="$APP_PORT" HOST=127.0.0.1 DB_HOST=127.0.0.1 DB_PORT="$DB_PORT" DB_USER=vc DB_PASSWORD=vc \
  DB_NAME=veseli_cetvrtak PUBLIC_DIR="$(win "$ROOT/web/dist")" INITIAL_PASSWORD="${INITIAL_PASSWORD:-}" \
  node dist/index.js
