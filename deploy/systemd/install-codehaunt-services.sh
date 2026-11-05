#!/usr/bin/env bash
# [claude] Installs CodeHaunt on the DGX as systemd user services (ADR-048), so the whole stack comes back on boot:
#   <prefix>-stack.service   oneshot: waits for Docker, then `docker compose --profile <profile> up -d --no-build --wait`
#   <prefix>.target          wants the stack and every member unit that has an [Install] section; enabled at boot
#   members                  copied as-is (default: both csiuem tunnel connectors, the backup service + timer)
# Needs linger for the user (`loginctl enable-linger`), so user units start at boot without a login.
# Never builds images: it starts whatever `codehaunt-<svc>:dev` deploy.sh/rollback.sh left in place.
#
#   install-codehaunt-services.sh                     live DGX install, then starts the target
#   install-codehaunt-services.sh --no-start          install + enable only (takes effect at next boot)
#   --prefix P --project NAME --dir DIR --profile X --member FILE (repeatable)   used by smoke-test.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
prefix=codehaunt
project=codehaunt
dir=$repo
profile=core
start=1
members=()

while [ $# -gt 0 ]; do
  case $1 in
    --prefix) prefix=$2; shift 2 ;;
    --project) project=$2; shift 2 ;;
    --dir) dir=$2; shift 2 ;;
    --profile) profile=$2; shift 2 ;;
    --member) members+=("$2"); shift 2 ;;
    --no-start) start=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ $prefix =~ ^[a-z][a-z0-9-]{1,30}$ ]] || { echo "bad --prefix" >&2; exit 1; }
[[ $project =~ ^[a-z][a-z0-9_-]{1,40}$ ]] || { echo "bad --project" >&2; exit 1; }
[ -f "$dir/docker-compose.yml" ] || { echo "no docker-compose.yml in $dir" >&2; exit 1; }
if [ ${#members[@]} -eq 0 ]; then
  members=("$repo/deploy/tunnel/codehaunt-tunnel-csi.service" "$repo/deploy/tunnel/codehaunt-tunnel-csi-2.service"
           "$repo/deploy/release/codehaunt-backup.service" "$repo/deploy/release/codehaunt-backup.timer")
fi
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] ||
  echo "warning: linger is off for $USER; user units will not start at boot until someone logs in" >&2

unitdir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
mkdir -p "$unitdir"
docker=$(command -v docker)

wants="$prefix-stack.service"
for m in "${members[@]}"; do
  [ -f "$m" ] || { echo "missing member unit $m" >&2; exit 1; }
  name=$(basename "$m")
  [[ $name == "$prefix"-* ]] || { echo "member $name must start with $prefix-" >&2; exit 1; }
  install -m 644 "$m" "$unitdir/$name"
  grep -q '^\[Install\]' "$m" && wants="$wants $name"
done

cat > "$unitdir/$prefix-stack.service" <<EOF
[Unit]
Description=CodeHaunt — compose stack $project (profile $profile), started at boot (ADR-048)
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$dir
ExecStartPre=/bin/sh -c 'until $docker info >/dev/null 2>&1; do sleep 2; done'
ExecStart=$docker compose -p $project --profile $profile up -d --no-build --wait
TimeoutStartSec=600

[Install]
WantedBy=$prefix.target
EOF

cat > "$unitdir/$prefix.target" <<EOF
[Unit]
Description=CodeHaunt — everything this machine runs for it (ADR-048); remove with stop-codehaunt.sh
Wants=$wants

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "$prefix.target" "$prefix-stack.service" >/dev/null
for m in "${members[@]}"; do
  name=$(basename "$m")
  grep -q '^\[Install\]' "$m" && systemctl --user enable "$name" >/dev/null
done
if [ $start = 1 ]; then
  systemctl --user start "$prefix.target"
fi
echo "installed $prefix.target (wants: $wants); enabled at boot; started: $([ $start = 1 ] && echo yes || echo no)"
