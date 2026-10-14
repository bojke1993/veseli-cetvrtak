#!/usr/bin/env bash
# Run daily from the VM host crontab: copies the newest backup off the VM (REQ-37.2).
# Requires rclone configured with a remote named "offsite" (e.g. Oracle Object Storage free tier, 20 GB).
set -euo pipefail
latest="$(ls -1t /opt/vc/backups/vc-*.sql.gz 2>/dev/null | head -1 || true)"
[ -n "$latest" ] || { echo "Nema backup fajla"; exit 1; }
rclone copy "$latest" offsite:vc-backups/
rclone delete --min-age 30d offsite:vc-backups/
