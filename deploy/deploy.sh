#!/usr/bin/env bash
# Deploys the app to the VM: copies sources, builds the single image on the VM and (re)starts the container.
# Usage: VC_HOST=ubuntu@1.2.3.4 ./deploy/deploy.sh
set -euo pipefail

: "${VC_HOST:?Set VC_HOST, e.g. ubuntu@1.2.3.4}"
REMOTE_DIR="${VC_REMOTE_DIR:-/opt/vc/src}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Kopiram izvorni kod na $VC_HOST:$REMOTE_DIR"
tar -C "$ROOT" -czf - \
  --exclude=node_modules --exclude=dist --exclude=.git --exclude=server/public \
  --exclude='*.log' --exclude=.env \
  . | ssh "$VC_HOST" "sudo mkdir -p '$REMOTE_DIR' && sudo chown \$(id -u):\$(id -g) '$REMOTE_DIR' && rm -rf '$REMOTE_DIR'/* && tar -C '$REMOTE_DIR' -xzf -"

echo "==> Build image-a i restart kontejnera"
ssh "$VC_HOST" REMOTE_DIR="$REMOTE_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
test -f /opt/vc/vc.env || { echo "Nedostaje /opt/vc/vc.env (vidi deploy/README.md)"; exit 1; }
sudo docker build -t veseli-cetvrtak:latest .
sudo docker rm -f vc 2>/dev/null || true
sudo docker run -d --name vc \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v vc-mysql:/var/lib/mysql \
  -v /opt/vc/backups:/backups \
  --env-file /opt/vc/vc.env \
  veseli-cetvrtak:latest
echo "Čekam health check..."
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then echo "OK"; exit 0; fi
  sleep 5
done
echo "Aplikacija se nije podigla; logovi:"; sudo docker logs --tail 100 vc; exit 1
REMOTE
echo "==> Gotovo."
