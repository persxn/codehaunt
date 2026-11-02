# test

Integration tests for the web application routes.

## Contents
| Path | What it does |
|---|---|
| `routes.test.ts` | walks every page/route under `src/app` and asserts it is 401 without a session unless allowlisted as public |

## Affects / depends on
- Depends on the running API server (started by test harness) and the DB (via migrations).
- Relies on `@codehaunt/auth` policy definitions.

## Entry points & how to test
- Run `npm test -w @codehaunt/web`.
- Tests spin up the app in a test environment, hit `/healthz`, `/readyz`, `/api/auth/*` etc.

## Gotchas
- Middleware deny‑by‑default means any new route must be added to `ROUTE_POLICY` or tests will fail.
