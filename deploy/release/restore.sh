#!/usr/bin/env bash
# Restore a backup (ADR-036). Default: into a scratch database, for the drill and for inspection; --live replaces the
# live database (stop web + worker first; the runbook says when).
# Usage: deploy/release/restore.sh <file.dump> [--live]
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
DUMP="${1:?usage: restore.sh <file.dump> [--live]}"
U="${POSTGRES_USER:-codehaunt}"
if [[ "${2:-}" == "--live" ]]; then
  DB="${POSTGRES_DB:-codehaunt}"
  read -r -p "Replace the LIVE database $DB from $DUMP? Type RESTORE: " answer
  [[ "$answer" == RESTORE ]] || { echo "aborted"; exit 1; }
else
  DB="codehaunt_restore_check"
  docker exec codehaunt-postgres-1 psql -U "$U" -d postgres -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB"
fi
started=$(date +%s)
docker exec -i codehaunt-postgres-1 pg_restore -U "$U" -d "$DB" --clean --if-exists --no-owner < "$DUMP"
echo "restored into $DB in $(( $(date +%s) - started )) s"
docker exec codehaunt-postgres-1 psql -U "$U" -d "$DB" -tAc "select 'events', count(*) from events union all select 'participants', count(*) from participants union all select 'submissions', count(*) from submissions"
[[ "$DB" == codehaunt_restore_check ]] && echo "drop it when done: docker exec codehaunt-postgres-1 psql -U $U -d postgres -c 'DROP DATABASE $DB'"
