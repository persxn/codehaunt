# deploy/systemd
Runs CodeHaunt on the DGX as systemd **user** services (user `uem`, linger on), so all of it comes back after a reboot,
and takes all of it down for good with one script (ADR-048).

## Contents
| Path | What it does |
|---|---|
| `install-codehaunt-services.sh` | `[claude]` writes `codehaunt-stack.service` (oneshot: waits for Docker, `docker compose -p codehaunt --profile core up -d --no-build --wait`) and `codehaunt.target` (wants the stack, both `codehaunt-tunnel-csi*` connectors and the backup timer), copies those member units from `deploy/tunnel/` and `deploy/release/`, enables everything at boot, starts the target (`--no-start` to skip). Never builds images |
| `stop-codehaunt.sh` | `[claude]` permanent stop: typed confirmation (`STOP CODEHAUNT`, or `--yes`); final backup; every `codehaunt-*` user unit + `codehaunt.target` disabled, stopped and deleted; `docker compose -p codehaunt down` (all profiles, volumes **kept**); cluster deployments + statefulsets in namespace `codehaunt` deleted over SSH to `root@gpu-master` (PVCs, Secrets kept). Exit 2 = DGX done, cluster unreachable: re-run |
| `smoke-test.sh` | `[claude]` 27 checks of both scripts on a throwaway copy (prefix/project `chsmoke`, alpine:3.20, dummy units): install, enablement, boot simulation, stop, data kept, nothing restarts, confirmation guard, cluster-failure exit 2, live stack untouched |

## Affects / depends on
- Depends on: `docker-compose.yml` (images `codehaunt-<svc>:dev` from `deploy/release/deploy.sh`), the unit files in
  `deploy/tunnel/` and `deploy/release/`, linger for `uem`, Docker enabled at boot (system unit).
- The k3s side is not systemd: k3s itself restarts the cluster workloads; `stop-codehaunt.sh` deletes them.
- Keeps on purpose: Postgres volume, `~/codehaunt-backups` + gpu-master copy (ADR-010 retention, `retire-backups.sh`),
  Cloudflare tunnel object + DNS, model weights.

## Entry points & how to test
```sh
deploy/systemd/smoke-test.sh                       # 27 passed, 0 failed; never touches the live stack
systemctl --user status codehaunt.target codehaunt-stack
deploy/systemd/install-codehaunt-services.sh       # after any change to a member unit
deploy/systemd/stop-codehaunt.sh                   # the end: asks for STOP CODEHAUNT
```

## Gotchas
- `systemctl --user stop codehaunt-stack` does not stop containers (no ExecStop, so a user-manager restart never takes
  the site down); use `stop-codehaunt.sh` or `docker compose`.
- Docker's `restart: unless-stopped` also restarts containers at boot; the unit is the guarantee if they were stopped.
  `stop-codehaunt.sh` removes the containers, so neither can bring them back.
- Not during the event: `stop-codehaunt.sh` ends the contest. Run it only after results are final and exported.
- Never run the smoke test with prefix `codehaunt`: `stop-codehaunt.sh` removes every unit with the prefix.
