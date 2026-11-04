#!/usr/bin/env bash
# Database backup (ADR-036): a custom-format pg_dump of CodeHaunt's Postgres every run (timer: every 5 min during the
# event), kept on the DGX and copied to gpu-master. Dumps hold personal data and password hashes: mode 600, root-only
# folder on gpu-master (never the NFS share), deleted with the 30-day retention (ADR-010).
# Usage: deploy/release/backup.sh   (exit 1 if the local dump failed; a failed copy only warns)
set -uo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
LOCAL="${BACKUP_DIR:-$HOME/codehaunt-backups}"
REMOTE_HOST="${BACKUP_REMOTE:-root@gpu-master}"
REMOTE_DIR="/root/codehaunt-backups"
KEEP=72   # 6 hours at one dump per 5 minutes
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$LOCAL/codehaunt-$stamp.dump"

umask 077
mkdir -p "$LOCAL"
if ! docker exec codehaunt-postgres-1 pg_dump -U "${POSTGRES_USER:-codehaunt}" -d "${POSTGRES_DB:-codehaunt}" -Fc > "$file.part"; then
  rm -f "$file.part"; echo "backup: FAILED to dump the database" >&2; exit 1
fi
mv "$file.part" "$file"
ls -1t "$LOCAL"/codehaunt-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup: $file ($(stat -c %s "$file") bytes)"

# Off-box copy. Tailscale SSH may ask for a fresh sign-in after its check period: never hang the timer on it.
if timeout 60 ssh -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE_HOST" \
     "umask 077 && mkdir -p $REMOTE_DIR && cat > $REMOTE_DIR/codehaunt-$stamp.dump && ls -1t $REMOTE_DIR/codehaunt-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f" < "$file"; then
  echo "backup: copied to $REMOTE_HOST:$REMOTE_DIR"
else
  echo "backup: WARNING copy to $REMOTE_HOST failed (Tailscale SSH sign-in expired? run: ssh $REMOTE_HOST true)" >&2
fi
