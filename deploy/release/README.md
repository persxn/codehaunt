# release
Deploying a tagged release to the DGX compose stack, rolling back, and the pre-deploy check (WP-06).

## Contents
| Path | What it does |
|---|---|
| `predeploy-check.sh` | refuses a production `.env` with `COOKIE_SECURE` set, half SEB config, a non-https `PUBLIC_ORIGIN`, a missing gateway token, cjudge's database or a seed password |
| `deploy.sh` | `deploy.sh <tag>`: HEAD must be the tag and clean; runs the check; keeps the running images as `codehaunt-<svc>:previous`; builds; tags the new images `:<tag>`; `up --wait`; `/healthz` |
| `backup.sh` | ADR-036: custom-format `pg_dump` to `~/codehaunt-backups` (mode 600, last 72) and a copy to `root@gpu-master:/root/codehaunt-backups` (root-only, never the NFS share); a failed copy only warns (Tailscale SSH sign-in may expire) |
| `restore.sh` | restores a dump into `codehaunt_restore_check` (drill / inspection) or, with `--live` and a typed confirmation, the live database |
| `codehaunt-backup.service` | user unit running `backup.sh` once |
| `codehaunt-backup.timer` | runs it every 5 minutes (enabled on the DGX 2026-11-04) |
| `rollback.sh` | `rollback.sh [tag]`: re-points `codehaunt-<svc>:dev` at `:previous` (or `:<tag>`), `up --no-build --wait`, `/healthz`, prints the time taken |

## Affects / depends on
- Runs `docker compose --profile core` from the repo root (`docker-compose.yml`, images `codehaunt-<svc>:dev`).
- Every deploy or rollback on the DGX needs the client's approval first (control repo rules).

## Entry points & how to test
`deploy/release/predeploy-check.sh .env` (read-only). The timed rollback drill (< 10 min) is a WP-06 acceptance check,
run with the client's go-ahead, then repeated in WP-08.

## Gotchas
- Dumps hold personal data and password hashes: delete them with the 30-day retention (ADR-010).
- Restore drill (2026-11-04): newest dump restored into the check database in 1 s.
- Rollback relies on forward-only, additive migrations: never drop or rename a column in the same release that stops
  using it (expand, then contract a release later). The one-shot `migrate` of the older images finds the newer
  migrations already applied; confirm in the drill that it exits 0.
- The first deploy keeps whatever `:dev` images run then (today `6e9100d`) as `:previous`.
