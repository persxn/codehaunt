#!/usr/bin/env bash
# Roll the DGX compose stack back to an earlier release's images, without building (WP-06; target < 10 minutes).
# Usage: deploy/release/rollback.sh [tag]   (default: the images saved as :previous by the last deploy)
# Migrations are forward-only and additive (expand/contract), so older code runs on the newer schema.
set -euo pipefail
cd "$(dirname "$0")/../.."
FROM="${1:-previous}"
SERVICES=(migrate web worker docker-proxy)
started=$(date +%s)

for s in "${SERVICES[@]}"; do
  docker image inspect "codehaunt-$s:$FROM" >/dev/null || { echo "no image codehaunt-$s:$FROM"; exit 1; }
done
for s in "${SERVICES[@]}"; do docker tag "codehaunt-$s:$FROM" "codehaunt-$s:dev"; done
docker compose --profile core up -d --no-build --wait
curl -fsS "http://127.0.0.1:${WEB_PORT:-3100}/healthz" && echo
[[ "$FROM" == previous && -f deploy/release/.previous ]] && cp deploy/release/.previous deploy/release/.current
[[ "$FROM" != previous ]] && echo "$FROM" > deploy/release/.current
echo "rolled back to $FROM in $(( $(date +%s) - started )) s"
