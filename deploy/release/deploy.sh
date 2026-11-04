#!/usr/bin/env bash
# Deploy a release tag to the DGX compose stack (WP-06). Needs client approval each time (CLAUDE.md rules).
# Usage: deploy/release/deploy.sh <tag>   e.g. v0.9.0-event
#  1. HEAD must be exactly <tag> with a clean tree; the pre-deploy check must pass.
#  2. The images running now are kept as codehaunt-<svc>:previous (the rollback target) and :<previous tag> if known.
#  3. Build, keep the new images as :<tag>, start with --wait, check /healthz.
set -euo pipefail
TAG="${1:?usage: deploy.sh <tag>}"
cd "$(dirname "$0")/../.."
SERVICES=(migrate web worker docker-proxy)

[[ "$(git describe --exact-match --tags HEAD 2>/dev/null)" == "$TAG" ]] || { echo "HEAD is not tag $TAG"; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean"; exit 1; }
# Re-deploying the running tag would make :previous the running release, so rollback would go back to itself (R16-7).
[[ "$(cat deploy/release/.current 2>/dev/null)" != "$TAG" ]] || { echo "$TAG is already deployed; tag a new release"; exit 1; }
deploy/release/predeploy-check.sh

for s in "${SERVICES[@]}"; do
  docker image inspect "codehaunt-$s:dev" >/dev/null 2>&1 && docker tag "codehaunt-$s:dev" "codehaunt-$s:previous"
done
[[ -f deploy/release/.current ]] && cp deploy/release/.current deploy/release/.previous

docker compose --profile core build
for s in "${SERVICES[@]}"; do docker tag "codehaunt-$s:dev" "codehaunt-$s:$TAG"; done
docker compose --profile core up -d --wait
echo "$TAG" > deploy/release/.current
curl -fsS "http://127.0.0.1:${WEB_PORT:-3100}/healthz" && echo && echo "deployed $TAG"
