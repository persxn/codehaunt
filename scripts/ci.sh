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
npm test
