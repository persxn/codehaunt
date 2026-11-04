# deploy/tunnel
Cloudflare Tunnel that publishes the DGX web service (`127.0.0.1:3100`) as `codehaunt.jojocode.in` (ADR-003).

## Contents
| Path | What it does |
|---|---|
| `codehaunt-tunnel.service` | systemd **user** unit (user `uem`, linger on); copy to `~/.config/systemd/user/` |
| `config.yml` | full-launch ingress (everything → web on 3100); live copy `~/.cloudflared-codehaunt/config.full.yml` |
| `config-preview.yml` | retired at the full launch (2026-11-04), live copy kept as `~/.cloudflared-codehaunt/config.preview.backup.yml`: landing-page-only ingress; only `/`, `/_next/static/…`, `/icon.png`, `/opengraph-image.jpg` reach the preview server, everything else is 404 at the edge; live copy `~/.cloudflared-codehaunt/config.yml` |
| `codehaunt-tunnel-2.service` | user unit: a second connector of the same tunnel on the DGX (ADR-036), so a crashed or stuck connector never takes the site down (drill: stop one, 20/20 requests still served) |
| `codehaunt-preview.service` | user unit: `next start` on 127.0.0.1:3200 from `apps/web/.next-preview` (env `~/.config/codehaunt-preview.env`, mode 600) |

## Facts
- Tunnel `codehaunt`, UUID `2f3d5e18-83a2-47c6-8e27-12b11f04fa7b`; CNAME `codehaunt.jojocode.in` → this tunnel (2026-11-03).
- Credentials: `~/.cloudflared-codehaunt/2f3d5e18-….json` (mode 600). Never in git. `cert.pem` stays in `~/.cloudflared/`.
- Kept apart from JojoCode: `~/.cloudflared/config.yml` is the `cjudge` tunnel; `jojoai` and `junction` have their own.
- State (2026-11-04): **full launch**. `~/.cloudflared-codehaunt/config.yml` = `config.full.yml` (everything →
  127.0.0.1:3100); `codehaunt-tunnel` + `codehaunt-tunnel-2` enabled (two connectors); `codehaunt-preview` disabled.
  SEB enforced in the app (`SEB_CONFIG_KEY` + `PUBLIC_ORIGIN`) and at Cloudflare (WAF rule on `/contest*`,
  `/api/contest*`); login rate limit at Cloudflare. No Cloudflare Access (ADR-036).
- Back to the preview: copy `config.preview.backup.yml` over `config.yml`, `systemctl --user enable --now codehaunt-preview`,
  restart both tunnel units.
- Updating the preview: `NEXT_DIST_DIR=.next-preview` build in `apps/web` (env from `~/.config/codehaunt-preview.env`),
  restore `apps/web/tsconfig.json` + `next-env.d.ts` (the build rewrites them), `systemctl --user restart codehaunt-preview`.

## Affects / depends on
- Depends on: the compose `web` service on 127.0.0.1:3100; `~/.local/bin/cloudflared`.
- Used by: everyone outside the DGX (participants, admins, projector).

## Entry points & how to test
```sh
systemctl --user start codehaunt-tunnel        # enable --now for the event
curl -sI https://codehaunt.jojocode.in/login   # HTTP/2 200, server: cloudflare (502 while stopped)
echo '{}' > /tmp/empty.yml
cloudflared --config /tmp/empty.yml tunnel info 2f3d5e18-83a2-47c6-8e27-12b11f04fa7b   # shows a connector
```

## Gotchas
- The preview's path regex allows only segments starting with a letter or digit (no `..`); test any change with
  `cloudflared --config <file> tunnel ingress rule https://codehaunt.jojocode.in/<path>` before restarting.
- Any `cloudflared tunnel …` admin command without `--config <empty file>` picks up cjudge's `~/.cloudflared/config.yml`
  (e.g. `route dns` would point the hostname at the wrong tunnel). Always pass the empty config and the UUID.
- Never add hostnames to another tunnel or edit `~/.cloudflared/`; never restart `cjudge-*` units.

## Teardown (do not run casually)
1. `systemctl --user disable --now codehaunt-tunnel codehaunt-preview`; remove both unit files; `daemon-reload`.
2. As `uem`: `cloudflared --config /tmp/empty.yml tunnel delete -f 2f3d5e18-83a2-47c6-8e27-12b11f04fa7b`.
3. Delete the `codehaunt.jojocode.in` CNAME in the Cloudflare dashboard (cloudflared cannot delete DNS).
4. `rm -r ~/.cloudflared-codehaunt ~/.config/codehaunt-preview.env`.
