#!/usr/bin/env bash
# [claude] Stops CodeHaunt for good (ADR-048): nothing of it runs again, not even after a reboot.
#   1. a final database backup (runs <prefix>-backup.service once, if installed)
#   2. every <prefix>-* systemd user unit and <prefix>.target: disabled, stopped, unit file deleted
#   3. the compose project: `docker compose -p <project> down` (containers and networks removed, so Docker's own
#      restart policy has nothing left to restart); volumes are KEPT (database = results; ADR-010 retention)
#   4. the k3s cluster: deployments + statefulsets in namespace codehaunt deleted over SSH to gpu-master (PVCs with
#      the model weights, Secrets and backups are KEPT)
# Keeps: the database volume, ~/codehaunt-backups, the copy on gpu-master, the Cloudflare tunnel object and DNS.
# Re-install: deploy/systemd/install-codehaunt-services.sh (DGX) and kubectl apply (deploy/gpu-cluster/README.md).
#
#   stop-codehaunt.sh                  asks for a typed confirmation
#   stop-codehaunt.sh --yes            no prompt
#   --skip-cluster  --skip-final-backup  --prefix P --project NAME --cluster-host H   (smoke-test.sh uses these)
# Exit: 0 all done; 2 the DGX part is done but the cluster part failed or was unreachable (re-run with the same args).
set -uo pipefail

prefix=codehaunt
project=codehaunt
cluster=1
backup=1
yes=0
host=root@gpu-master

while [ $# -gt 0 ]; do
  case $1 in
    --yes) yes=1; shift ;;
    --skip-cluster) cluster=0; shift ;;
    --skip-final-backup) backup=0; shift ;;
    --prefix) prefix=$2; shift 2 ;;
    --project) project=$2; shift 2 ;;
    --cluster-host) host=$2; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done
[[ $prefix =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "bad --prefix" >&2; exit 1; }
[[ $project =~ ^[a-z][a-z0-9_-]{1,40}$ ]] || { echo "bad --project" >&2; exit 1; }

unitdir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
mapfile -t units < <(cd "$unitdir" 2>/dev/null && ls -1 -- "$prefix".target "$prefix"-*.service "$prefix"-*.timer 2>/dev/null | sort -u)

echo "This stops CodeHaunt ($prefix / compose project $project) permanently:"
echo "  units: ${units[*]:-(none installed)}"
echo "  containers: $(docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.Names}}' | tr '\n' ' ')"
[ $cluster = 1 ] && echo "  cluster: deployments + statefulsets in namespace codehaunt via $host"
echo "  kept: database volume, backups, model weights, Cloudflare tunnel + DNS"
if [ $yes = 0 ]; then
  read -r -p "Type STOP CODEHAUNT to continue: " answer
  [ "$answer" = "STOP CODEHAUNT" ] || { echo "aborted, nothing changed"; exit 1; }
fi

# 1. final backup while the database still runs
if [ $backup = 1 ] && [ -f "$unitdir/$prefix-backup.service" ]; then
  if systemctl --user start "$prefix-backup.service"; then echo "final backup: ok"
  else echo "warning: final backup failed (continuing; older backups are kept)" >&2; fi
fi

# 2. units: timers first so nothing fires mid-teardown, then the target, then the rest
ordered=()
for u in "${units[@]}"; do [[ $u == *.timer ]] && ordered+=("$u"); done
for u in "${units[@]}"; do [[ $u == *.target ]] && ordered+=("$u"); done
for u in "${units[@]}"; do [[ $u == *.service ]] && ordered+=("$u"); done
for u in "${ordered[@]}"; do
  systemctl --user disable --now "$u" >/dev/null 2>&1 || systemctl --user stop "$u" >/dev/null 2>&1 || true
  rm -f -- "$unitdir/$u"
  find "$unitdir" -path "*.wants/$u" -delete 2>/dev/null || true
done
systemctl --user daemon-reload
systemctl --user reset-failed >/dev/null 2>&1 || true
echo "units removed: ${#ordered[@]}"

# 3. containers (volumes kept)
docker compose -p "$project" down --remove-orphans >/dev/null 2>&1 || true
left=$(docker ps -a -q --filter "label=com.docker.compose.project=$project")
if [ -n "$left" ]; then
  echo "error: containers of $project still exist: $left" >&2
  exit 1
fi
echo "containers removed; volumes kept: $(docker volume ls -q --filter "label=com.docker.compose.project=$project" | tr '\n' ' ')"

# 4. cluster
rc=0
if [ $cluster = 1 ]; then
  if timeout 120 ssh -o BatchMode=yes -o ConnectTimeout=15 "$host" \
       'kubectl -n codehaunt delete deployment,statefulset --all --wait=true && kubectl -n codehaunt get pods --no-headers 2>/dev/null | wc -l'; then
    echo "cluster: workloads deleted (PVCs, Secrets kept)"
  else
    echo "warning: cluster part failed or $host unreachable (Tailscale SSH sign-in?). Re-run this script." >&2
    rc=2
  fi
fi

# verify
still=$(cd "$unitdir" 2>/dev/null && ls -1 -- "$prefix".target "$prefix"-*.service "$prefix"-*.timer 2>/dev/null)
[ -z "$still" ] || { echo "error: unit files left: $still" >&2; exit 1; }
echo "CodeHaunt stopped; nothing of it starts at boot."
exit $rc
