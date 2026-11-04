#!/usr/bin/env bash
# Restore a backup (ADR-036). Default: into a scratch database, for the drill and for inspection; --live replaces the
# live database. --live refuses while web or worker run (stop them first: docker compose stop web worker), and dumps
# the live database to $BACKUP_DIR/pre-restore-<time>.dump before touching it (audit R16-7).
# Usage: deploy/release/restore.sh <file.dump> [--live]
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
DUMP="${1:?usage: restore.sh <file.dump> [--live]}"
U="${POSTGRES_USER:-codehaunt}"
if [[ "${2:-}" == "--live" ]]; then
  DB="${POSTGRES_DB:-codehaunt}"
  running=$(docker compose --profile core ps --status running --services 2>/dev/null | grep -xE 'web|worker' || true)
  [[ -z "$running" ]] || { echo "refused: stop these first: docker compose stop" $running; exit 1; }
  [[ -s "$DUMP" ]] || { echo "refused: $DUMP is missing or empty"; exit 1; }
  read -r -p "Replace the LIVE database $DB from $DUMP? Type RESTORE: " answer
  [[ "$answer" == RESTORE ]] || { echo "aborted"; exit 1; }
  umask 077
  safety="${BACKUP_DIR:-$HOME/codehaunt-backups}/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
  mkdir -p "$(dirname "$safety")"
  docker exec codehaunt-postgres-1 pg_dump -U "$U" -d "$DB" -Fc > "$safety" || { rm -f "$safety"; echo "refused: could not dump the live database first"; exit 1; }
  echo "live database saved first to $safety"
  umask 022
else
  DB="codehaunt_restore_check"
  docker exec codehaunt-postgres-1 psql -U "$U" -d postgres -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
fi
started=$(date +%s)
docker exec -i codehaunt-postgres-1 pg_restore -U "$U" -d "$DB" --clean --if-exists --no-owner < "$DUMP"
echo "restored into $DB in $(( $(date +%s) - started )) s"
docker exec codehaunt-postgres-1 psql -U "$U" -d "$DB" -tAc "select 'events', count(*) from events union all select 'participants', count(*) from participants union all select 'submissions', count(*) from submissions"
[[ "$DB" == codehaunt_restore_check ]] && echo "drop it when done: docker exec codehaunt-postgres-1 psql -U $U -d postgres -c 'DROP DATABASE $DB'"
