#!/usr/bin/env bash
# [claude] Smoke test for install-codehaunt-services.sh + stop-codehaunt.sh (ADR-048) on a throwaway copy:
# prefix `chsmoke`, compose project `chsmoke`, alpine:3.20 containers (no pulls), dummy tunnel/backup units.
# Never touches the live `codehaunt` units, containers or volumes (checked: live container IDs equal before/after).
# Boot is checked through what boot uses (enablement symlinks, target wants, unit start); the DGX is not rebooted.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
P=chsmoke
unitdir=${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user
work=$(mktemp -d)
pass=0
fail=0
ok() { echo "PASS $1"; pass=$((pass + 1)); }
no() { echo "FAIL $1"; fail=$((fail + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else no "$1"; fi; }
running() { [ "$(docker ps -q --filter "label=com.docker.compose.project=$P" | wc -l)" -eq "$1" ]; }

cleanup() {
  "$here/stop-codehaunt.sh" --prefix $P --project $P --yes --skip-cluster --skip-final-backup >/dev/null 2>&1 || true
  docker volume rm -f ${P}_data >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

live_before=$(docker ps -q --filter label=com.docker.compose.project=codehaunt | sort | tr '\n' ' ')
live_units_before=$(systemctl --user is-active codehaunt-tunnel-csi codehaunt-tunnel-csi-2 codehaunt-backup.timer | tr '\n' ' ')

# throwaway compose project: one service per profile in use, Docker restart policy as in the real stack
cat > "$work/docker-compose.yml" <<'EOF'
services:
  app:
    image: alpine:3.20
    profiles: [core]
    command: ["sh", "-c", "echo up > /data/marker; exec sleep infinity"]
    restart: unless-stopped
    init: true
    volumes: [data:/data]
  extra:
    image: alpine:3.20
    profiles: [judge]
    command: ["sleep", "infinity"]
    restart: unless-stopped
    init: true
volumes:
  data:
EOF
cat > "$work/$P-tunnel.service" <<'EOF'
[Unit]
Description=chsmoke dummy tunnel
[Service]
ExecStart=/bin/sleep infinity
Restart=always
[Install]
WantedBy=default.target
EOF
cat > "$work/$P-backup.service" <<EOF
[Unit]
Description=chsmoke dummy backup
[Service]
Type=oneshot
ExecStart=/bin/sh -c 'date > $work/backup-ran'
EOF
cat > "$work/$P-backup.timer" <<'EOF'
[Unit]
Description=chsmoke dummy backup timer
[Timer]
OnUnitActiveSec=1h
[Install]
WantedBy=timers.target
EOF

echo "== install"
"$here/install-codehaunt-services.sh" --prefix $P --project $P --dir "$work" --profile core \
  --member "$work/$P-tunnel.service" --member "$work/$P-backup.service" --member "$work/$P-backup.timer"
check "target enabled at boot (default.target.wants)" "[ -L '$unitdir/default.target.wants/$P.target' ]"
check "stack enabled via target" "[ -L '$unitdir/$P.target.wants/$P-stack.service' ]"
check "tunnel member enabled" "systemctl --user is-enabled $P-tunnel.service"
check "timer enabled" "systemctl --user is-enabled $P-backup.timer"
check "target active" "systemctl --user is-active $P.target"
check "stack active" "systemctl --user is-active $P-stack.service"
check "tunnel member active" "systemctl --user is-active $P-tunnel.service"
check "core container running, judge profile not" "running 1"

echo "== boot simulation (containers gone, units stopped, then the target starts as at boot)"
docker compose -p $P --profile core down >/dev/null 2>&1
systemctl --user stop $P.target $P-stack.service $P-tunnel.service $P-backup.timer
check "all down before 'boot'" "running 0 && ! systemctl --user is-active $P-tunnel.service"
systemctl --user start $P.target
check "after 'boot': stack active" "systemctl --user is-active $P-stack.service"
check "after 'boot': tunnel member active" "systemctl --user is-active $P-tunnel.service"
check "after 'boot': timer active" "systemctl --user is-active $P-backup.timer"
check "after 'boot': container running again" "running 1"

echo "== a judge-profile container too (stop must remove every profile)"
(cd "$work" && docker compose -p $P --profile judge up -d extra >/dev/null 2>&1)
check "two containers running" "running 2"

echo "== stop-codehaunt.sh"
set +e
"$here/stop-codehaunt.sh" --prefix $P --project $P --yes --skip-cluster
rc=$?
set -e
check "exit 0" "[ $rc -eq 0 ]"
check "final backup ran" "[ -s '$work/backup-ran' ]"
check "no unit files left" "! ls $unitdir/$P.target $unitdir/$P-* 2>/dev/null | grep -q ."
check "no enablement symlinks left" "! find $unitdir -name '$P*' | grep -q ."
check "no units loaded" "! systemctl --user list-units --all --no-legend '$P*' | grep -q ."
check "no containers left (nothing for Docker to restart)" "[ -z \"\$(docker ps -aq --filter label=com.docker.compose.project=$P)\" ]"
check "volume kept with its data" "docker run --rm -v ${P}_data:/d alpine:3.20 grep -q up /d/marker"
check "'boot' brings nothing back" "! systemctl --user start $P.target"

echo "== confirmation guard"
check "refuses without typed confirmation" "! echo no | '$here/stop-codehaunt.sh' --prefix $P --project $P --skip-cluster"
check "rejects a bad prefix" "! '$here/stop-codehaunt.sh' --prefix 'x' --yes --skip-cluster"

echo "== cluster unreachable → exit 2, DGX part still done"
set +e
"$here/stop-codehaunt.sh" --prefix $P --project $P --yes --skip-final-backup --cluster-host nobody@127.0.0.1 >/dev/null 2>&1
rc=$?
set -e
check "exit 2 when the cluster part fails" "[ $rc -eq 2 ]"

echo "== live stack untouched"
live_after=$(docker ps -q --filter label=com.docker.compose.project=codehaunt | sort | tr '\n' ' ')
check "live containers unchanged ($live_before)" "[ '$live_before' = '$live_after' ]"
check "live units unchanged ($live_units_before)" "[ '$live_units_before' = \"\$(systemctl --user is-active codehaunt-tunnel-csi codehaunt-tunnel-csi-2 codehaunt-backup.timer | tr '\n' ' ')\" ]"

echo "== $pass passed, $fail failed"
[ $fail -eq 0 ]
