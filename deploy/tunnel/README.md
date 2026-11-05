# deploy/tunnel
Cloudflare Tunnel that publishes the DGX web service (`127.0.0.1:3100`) as `codehaunt.csiuem.site` (ADR-045), the
only public address since ADR-047 (`codehaunt.jojocode.in` taken down 2026-11-06).

## Contents
| Path | What it does |
|---|---|
| `csiuem-setup.sh` | one-shot, idempotent Cloudflare setup in the CSI account for `codehaunt.csiuem.site` (ADR-045): remotely managed tunnel `codehaunt-csi`, proxied CNAME, SEB WAF rule, login rate limit, Always HTTPS + TLS 1.2; reads `~/.config/codehaunt-csiuem.env` (600), writes `~/.cloudflared-codehaunt/csiuem.token` (600) |
| `codehaunt-tunnel-csi.service`, `codehaunt-tunnel-csi-2.service` | systemd **user** units (user `uem`, linger on): two connectors of tunnel `codehaunt-csi` (token file, no local config), so a crashed or stuck connector never takes the site down (ADR-036) |

## Facts
- Tunnel `codehaunt-csi` = `e25771fb-f6a3-4c08-9929-b964d4a6069e`, in the CSI chapter's own Cloudflare account
  (remotely managed: ingress lives in the dashboard). Both `codehaunt-tunnel-csi*` units enabled.
- Token: `~/.cloudflared-codehaunt/csiuem.token` (mode 600), never in git. The professor's API token in
  `~/.config/codehaunt-csiuem.env` expires 2026-11-13.
- SEB enforced in the app (`SEB_CONFIG_KEY` + `PUBLIC_ORIGIN`, one origin) and at Cloudflare (WAF rule on
  `/contest*`, `/api/contest*`); login rate limit at Cloudflare. No Cloudflare Access (ADR-036).
- Kept apart from JojoCode: `~/.cloudflared/` belongs to the `cjudge` tunnel; `jojoai` and `junction` have their own.
- Retired (ADR-047): tunnel `codehaunt` (`2f3d5e18-…`, deleted), its units, local config and the landing preview.

## Setup from scratch
1. Put the professor's values in `~/.config/codehaunt-csiuem.env` (`chmod 600`): `CSI_CF_TOKEN=`, `CSI_ACCOUNT_ID=`,
   `CSI_ZONE_ID=`.
2. `deploy/tunnel/csiuem-setup.sh` (needs the zone `Active`).
3. Copy both `codehaunt-tunnel-csi*.service` to `~/.config/systemd/user/`, `daemon-reload`, `enable --now` both.
4. `.env`: `PUBLIC_ORIGIN=https://codehaunt.csiuem.site`, `SEB_CONFIG_KEY=<key>`;
   `docker compose --profile core up -d web` (env only, no rebuild).

## Affects / depends on
- Depends on: the compose `web` service on 127.0.0.1:3100; `~/.local/bin/cloudflared`.
- Used by: everyone outside the DGX (participants, admins, projector).

## Entry points & how to test
```sh
systemctl --user status codehaunt-tunnel-csi codehaunt-tunnel-csi-2
curl -sI https://codehaunt.csiuem.site/login     # 200; /contest without SEB → 403
# On the college network the Fortinet DNS filter may block csiuem.site; test from outside with
# curl --doh-url https://1.1.1.1/dns-query …
```

## Gotchas
- Never add hostnames to another tunnel or edit `~/.cloudflared/`; never restart `cjudge-*` units.
- Do not delete `~/.cloudflared-codehaunt/`: it holds `csiuem.token`, which both live units read.
