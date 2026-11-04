#!/usr/bin/env bash
# Pre-deploy check (WP-06): refuses a production .env that would ship insecure or half-configured.
# Usage: deploy/release/predeploy-check.sh [path/to/.env]   (default: the repo's .env). Exit 1 on any failure.
set -euo pipefail
ENV_FILE="${1:-$(dirname "$0")/../../.env}"
[[ -f "$ENV_FILE" ]] || { echo "FAIL: $ENV_FILE not found"; exit 1; }
set -a; . "$ENV_FILE"; set +a

fail=0
check() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; fail=1; fi; }

check "COOKIE_SECURE unset (session cookie must be Secure)" '[[ -z "${COOKIE_SECURE:-}" ]]'
check "SEB_CONFIG_KEY and PUBLIC_ORIGIN both set (participants SEB-only, ADR-013/029)" '[[ -n "${SEB_CONFIG_KEY:-}" && -n "${PUBLIC_ORIGIN:-}" ]]'
check "PUBLIC_ORIGIN is https with no path" '[[ "${PUBLIC_ORIGIN:-}" =~ ^https://[^/]+$ ]]'
check "GATEWAY_URL and GATEWAY_TOKEN set" '[[ -n "${GATEWAY_URL:-}" && -n "${GATEWAY_TOKEN:-}" ]]'
check "DATABASE_URL is CodeHaunt's own Postgres (not cjudge's :5432)" '[[ "${DATABASE_URL:-}" != *":5432/"* && "${DATABASE_URL:-}" != *cjudge* ]]'
check "DB role passwords set" '[[ -n "${POSTGRES_PASSWORD:-}" && -n "${WEB_DB_PASSWORD:-}" && -n "${WORKER_DB_PASSWORD:-}" ]]'
check "no seed password in a production .env" '[[ -z "${SEED_PASSWORD:-}" ]]'

exit "$fail"
