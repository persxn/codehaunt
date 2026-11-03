# deploy/tunnel
Cloudflare Tunnel that publishes the DGX web service (`127.0.0.1:3100`) as `codehaunt.jojocode.in` (ADR-003).

## Contents
| Path | What it does |
|---|---|
| `codehaunt-tunnel.service` | systemd **user** unit (user `uem`, linger on); copy to `~/.config/systemd/user/` |
| `config.yml` | ingress for the tunnel; live copy at `~/.cloudflared-codehaunt/config.yml` (`~` written out in full there) |

## Facts
- Tunnel `codehaunt`, UUID `2f3d5e18-83a2-47c6-8e27-12b11f04fa7b`; CNAME `codehaunt.jojocode.in` → this tunnel (2026-11-03).
- Credentials: `~/.cloudflared-codehaunt/2f3d5e18-….json` (mode 600). Never in git. `cert.pem` stays in `~/.cloudflared/`.
- Kept apart from JojoCode: `~/.cloudflared/config.yml` is the `cjudge` tunnel; `jojoai` and `junction` have their own.
- State: unit installed, **stopped and disabled** until WP-06 gating is in place (SEB check, WAF, Access on `/admin`,
  login rate limit) and the practice DB's dev admin is wiped (WP-08).

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
- Any `cloudflared tunnel …` admin command without `--config <empty file>` picks up cjudge's `~/.cloudflared/config.yml`
  (e.g. `route dns` would point the hostname at the wrong tunnel). Always pass the empty config and the UUID.
- Never add hostnames to another tunnel or edit `~/.cloudflared/`; never restart `cjudge-*` units.

## Teardown (do not run casually)
1. `systemctl --user disable --now codehaunt-tunnel`; remove the unit file; `daemon-reload`.
2. As `uem`: `cloudflared --config /tmp/empty.yml tunnel delete -f 2f3d5e18-83a2-47c6-8e27-12b11f04fa7b`.
3. Delete the `codehaunt.jojocode.in` CNAME in the Cloudflare dashboard (cloudflared cannot delete DNS).
4. `rm -r ~/.cloudflared-codehaunt`.
