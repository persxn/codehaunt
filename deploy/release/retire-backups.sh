#!/usr/bin/env bash
# After the event (audit R16-7, ADR-010): stop the 5-minute backups, and with --purge delete every dump on the DGX and
# on gpu-master. Dumps hold personal data and password hashes; purge them when the 30-day retention ends (WP-09).
# Usage: deploy/release/retire-backups.sh            stop and disable the timer only
#        deploy/release/retire-backups.sh --purge    also delete all dumps (asks first)
set -euo pipefail
LOCAL="${BACKUP_DIR:-$HOME/codehaunt-backups}"
REMOTE_HOST="${BACKUP_REMOTE:-root@gpu-master}"
REMOTE_DIR="/root/codehaunt-backups"

systemctl --user disable --now codehaunt-backup.timer
echo "backup timer stopped and disabled"
[[ "${1:-}" == "--purge" ]] || { echo "dumps kept in $LOCAL and $REMOTE_HOST:$REMOTE_DIR (run again with --purge after 30 days)"; exit 0; }

read -r -p "Delete ALL CodeHaunt dumps in $LOCAL and on $REMOTE_HOST? Type PURGE: " answer
[[ "$answer" == PURGE ]] || { echo "aborted"; exit 1; }
rm -f "$LOCAL"/codehaunt-*.dump "$LOCAL"/pre-restore-*.dump
rmdir "$LOCAL" 2>/dev/null || true
ssh "$REMOTE_HOST" "rm -rf $REMOTE_DIR"
echo "dumps deleted on the DGX and on $REMOTE_HOST"
