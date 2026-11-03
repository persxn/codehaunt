# src

Source code for the web frontend.

## Contents
| Path | What it does |
|---|---|
| `app/` | Next.js route hierarchy (pages, API routes, health checks) |
| `components/` | shared UI components (ghost mark, buttons, fields, verdict badge, meters, banner) on the design tokens |
| `middleware.ts` | deny-by-default gate on every request (Node runtime): session lookup, 401/403, cross-origin POST refusal, SEB gate for participants (`sebGate`, 403 `seb_required`; ADR-013), per-request nonce CSP |
| `lib/` | server helpers: config validation, error envelope and request IDs, session lookup, the route wrapper, service instances |
| `server/` | services behind the API routes (participant flow, prompt/gateway, check-in, event editor, staff); framework-free |

## Affects / depends on
- Depends on `@codehaunt/auth` for session middleware, and `@codehaunt/db` for Prisma client usage in API routes.
- Changing anything in `app/` may require updates to the route policy (auth) and corresponding tests.

## Entry points & how to test
- Development server imports this folder via Next.js; run `npm run dev -w @codehaunt/web`.
- Unit/integration tests live in `apps/web/test/`.

## Gotchas
- `middleware.ts` is deny‑by‑default; ensure new routes are listed in `ROUTE_POLICY`.
