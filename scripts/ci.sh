#!/usr/bin/env bash
set -euo pipefail

echo "=== npm ci ==="
npm ci

echo "=== check-readmes ==="
node scripts/check-readmes.mjs

echo "=== check-readmes.test.mjs ==="
node --test scripts/check-readmes.test.mjs

echo "=== typecheck ==="
export CJUDGE_RUNNER_IMAGE=codehaunt-runner:1
npm run typecheck

echo "=== test ==="
export CJUDGE_RUNNER_IMAGE=codehaunt-runner:1
# Concurrency tests need real Postgres (PGlite serialises connections): the compose one, via the owner URL.
if [ -f .env ]; then
  docker compose --profile db up -d --wait
  TEST_POSTGRES_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
  export TEST_POSTGRES_URL
else
  echo "no .env: Postgres concurrency tests will be skipped" >&2
fi
npm test
