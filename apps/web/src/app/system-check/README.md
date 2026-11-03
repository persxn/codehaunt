# system-check
Public page (`/system-check`, no sign-in) shared with participants before the event (ADR-007): Safe Exam Browser
detection, connection latency to this server, screen size, device clock.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | card layout with the ghost mark and the check |
| `system-check.tsx` | runs the checks in the browser: 10 sequential `/healthz` requests (median/worst), user-agent SEB check, screen size |
| `system-check.module.css` | styles (tokens only) |

## Affects / depends on
- Public in `packages/auth/src/policy.ts` (`/system-check`); calls only `/healthz`.

## Entry points & how to test
Open `/system-check` and press "Run check". Route access: `apps/web/test/routes.test.ts`.

## Gotchas
- It sends nothing anywhere but this server. The real SEB Config Key verification is server-side (WP-06); this page only detects the browser.
