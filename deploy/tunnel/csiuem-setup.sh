#!/usr/bin/env bash
# One-shot Cloudflare setup for codehaunt.csiuem.site in the CSI account (ADR-045). Idempotent: safe to re-run.
# Reads CSI_CF_TOKEN, CSI_ACCOUNT_ID, CSI_ZONE_ID from ~/.config/codehaunt-csiuem.env (mode 600; never on a command line).
# Creates or reuses: remotely managed tunnel "codehaunt-csi" (ingress → 127.0.0.1:3100), proxied CNAME, the SEB WAF
# rule, the login rate limit, Always Use HTTPS + TLS 1.2 minimum. Writes the tunnel token to
# ~/.cloudflared-codehaunt/csiuem.token (mode 600). Starting the connectors is a separate, manual step (README).
set -euo pipefail
HOST=codehaunt.csiuem.site
NAME=codehaunt-csi
ENV_FILE="$HOME/.config/codehaunt-csiuem.env"
TOKEN_FILE="$HOME/.cloudflared-codehaunt/csiuem.token"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE"; exit 1; }
[[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || { echo "$ENV_FILE must be mode 600"; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${CSI_CF_TOKEN:?}" "${CSI_ACCOUNT_ID:?}" "${CSI_ZONE_ID:?}"
API=https://api.cloudflare.com/client/v4
A="accounts/$CSI_ACCOUNT_ID"; Z="zones/$CSI_ZONE_ID"

# cf METHOD PATH [JSON] → prints .result as JSON; exits on API failure. Token goes through a header file, not argv.
HDR=$(mktemp); trap 'rm -f "$HDR"' EXIT; chmod 600 "$HDR"
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$CSI_CF_TOKEN" > "$HDR"
cf() {
  local out; out=$(curl -sS -X "$1" -H @"$HDR" "$API/$2" ${3:+--data "$3"})
  python3 -c 'import json,sys
d=json.loads(sys.argv[1])
if not d.get("success"): sys.exit("API error on '"$1 $2"': "+json.dumps(d.get("errors")))
print(json.dumps(d.get("result")))' "$out"
}
jq_() { python3 -c "import json,sys; r=json.load(sys.stdin); print($1)"; }

echo "== token and zone"
cf GET "user/tokens/verify" >/dev/null && echo "token valid"
[[ "$(cf GET "$Z" | jq_ 'r["name"]+" "+r["status"]')" == "csiuem.site active" ]] || { echo "zone csiuem.site not active yet (nameservers?)"; exit 1; }
echo "zone active"

echo "== tunnel"
TID=$(cf GET "$A/cfd_tunnel?name=$NAME&is_deleted=false" | jq_ 'r[0]["id"] if r else ""')
if [[ -z "$TID" ]]; then
  TID=$(cf POST "$A/cfd_tunnel" "{\"name\":\"$NAME\",\"config_src\":\"cloudflare\"}" | jq_ 'r["id"]')
  echo "created $TID"
else echo "reusing $TID"; fi
cf PUT "$A/cfd_tunnel/$TID/configurations" \
  "{\"config\":{\"ingress\":[{\"hostname\":\"$HOST\",\"service\":\"http://127.0.0.1:3100\"},{\"service\":\"http_status:404\"}]}}" >/dev/null
echo "ingress: $HOST → 127.0.0.1:3100"
mkdir -p "$(dirname "$TOKEN_FILE")"; umask 077
cf GET "$A/cfd_tunnel/$TID/token" | jq_ 'r' > "$TOKEN_FILE"; chmod 600 "$TOKEN_FILE"
echo "tunnel token → $TOKEN_FILE"

echo "== DNS"
REC=$(cf GET "$Z/dns_records?name=$HOST" | jq_ 'r[0]["id"]+" "+r[0]["type"]+" "+r[0]["content"] if r else ""')
BODY="{\"type\":\"CNAME\",\"name\":\"$HOST\",\"content\":\"$TID.cfargotunnel.com\",\"proxied\":true,\"comment\":\"CodeHaunt tunnel (ADR-045)\"}"
if [[ -z "$REC" ]]; then cf POST "$Z/dns_records" "$BODY" >/dev/null; echo "CNAME created"
else cf PUT "$Z/dns_records/${REC%% *}" "$BODY" >/dev/null; echo "CNAME updated (was: ${REC#* })"; fi

# Phase entrypoints are replaced whole: refuse if they hold rules that are not ours.
put_phase() {
  local phase=$1 rule=$2 existing
  existing=$(cf GET "$Z/rulesets/phases/$phase/entrypoint" 2>/dev/null || echo null)
  if [[ "$existing" != null ]] && ! jq_ 'all(x.get("description","").startswith("CodeHaunt") for x in (r or {}).get("rules",[]))' <<<"$existing" | grep -q True; then
    echo "$phase holds rules that are not CodeHaunt's; add ours by hand"; exit 1
  fi
  cf PUT "$Z/rulesets/phases/$phase/entrypoint" "{\"rules\":[$rule]}" >/dev/null; echo "$phase set"
}
echo "== security rules (same as jojocode.in, scoped to $HOST)"
put_phase http_request_firewall_custom "{\"description\":\"CodeHaunt: participant portal only from Safe Exam Browser (ADR-013/029)\",\"action\":\"block\",\"expression\":\"(http.host eq \\\"$HOST\\\" and (starts_with(http.request.uri.path, \\\"/contest\\\") or starts_with(http.request.uri.path, \\\"/api/contest\\\")) and not any(lower(http.request.headers.names[*])[*] eq \\\"x-safeexambrowser-configkeyhash\\\"))\"}"
put_phase http_ratelimit "{\"description\":\"CodeHaunt: login/password flood cap per IP (ADR-020); 60 per 10 s tolerates a venue NAT\",\"action\":\"block\",\"expression\":\"(http.host eq \\\"$HOST\\\" and (http.request.uri.path eq \\\"/api/auth/login\\\" or http.request.uri.path eq \\\"/api/account/password\\\"))\",\"ratelimit\":{\"characteristics\":[\"ip.src\",\"cf.colo.id\"],\"period\":10,\"requests_per_period\":60,\"mitigation_timeout\":10}}"

echo "== zone settings"
cf PATCH "$Z/settings/always_use_https" '{"value":"on"}' >/dev/null && echo "always_use_https on"
cf PATCH "$Z/settings/min_tls_version" '{"value":"1.2"}' >/dev/null && echo "min TLS 1.2"
echo "done. Next: start the connectors (deploy/tunnel/README.md, 'csiuem.site')."
