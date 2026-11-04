# release
Deploying a tagged release to the DGX compose stack, rolling back, and the pre-deploy check (WP-06).

## Contents
| Path | What it does |
|---|---|
| `predeploy-check.sh` | refuses a production `.env` with `COOKIE_SECURE` set, half SEB config, a non-https `PUBLIC_ORIGIN`, a missing gateway token, cjudge's database or a seed password |
| `deploy.sh` | `deploy.sh <tag>`: HEAD must be the tag and clean; runs the check; keeps the running images as `codehaunt-<svc>:previous`; builds; tags the new images `:<tag>`; `up --wait`; `/healthz` |
| `rollback.sh` | `rollback.sh [tag]`: re-points `codehaunt-<svc>:dev` at `:previous` (or `:<tag>`), `up --no-build --wait`, `/healthz`, prints the time taken |

## Affects / depends on
- Runs `docker compose --profile core` from the repo root (`docker-compose.yml`, images `codehaunt-<svc>:dev`).
- Every deploy or rollback on the DGX needs the client's approval first (control repo rules).

## Entry points & how to test
`deploy/release/predeploy-check.sh .env` (read-only). The timed rollback drill (< 10 min) is a WP-06 acceptance check,
run with the client's go-ahead, then repeated in WP-08.

## Gotchas
- Rollback relies on forward-only, additive migrations: never drop or rename a column in the same release that stops
  using it (expand, then contract a release later). The one-shot `migrate` of the older images finds the newer
  migrations already applied; confirm in the drill that it exits 0.
- The first deploy keeps whatever `:dev` images run then (today `6e9100d`) as `:previous`.
