# src

Source code for the web frontend.

## Contents
| Path | What it does |
|---|---|
| `app/` | Next.js route hierarchy (pages, API routes, health checks) |
| `middleware.ts` | deny-by-default gate on every request (Node runtime): session lookup, 401/403, cross-origin POST refusal |
| `lib/` | server helpers: config validation, error envelope and request IDs, session lookup |

## Affects / depends on
- Depends on `@codehaunt/auth` for session middleware, and `@codehaunt/db` for Prisma client usage in API routes.
- Changing anything in `app/` may require updates to the route policy (auth) and corresponding tests.

## Entry points & how to test
- Development server imports this folder via Next.js; run `npm run dev -w @codehaunt/web`.
- Unit/integration tests live in `apps/web/test/`.

## Gotchas
- `middleware.ts` is deny‑by‑default; ensure new routes are listed in `ROUTE_POLICY`.
