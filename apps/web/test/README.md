# test

Tests for the web app's access control. No server and no database: they call the policy and the middleware directly.

## Contents
| Path | What it does |
|---|---|
| `routes.test.ts` | walks every page/route under `src/app` and asserts the policy gives 401 without a session unless public |
| `middleware.test.ts` | the real `middleware()` on real `NextRequest`s: 401s, public pass-through, path tricks, cross-site POST 403 |
| `config.test.ts` | startup config: an empty `COOKIE_SECURE` is accepted and cookies stay Secure in production |
| `support/` | Node resolve hook so plain Node can load Next's `next/server` (`support/README.md`) |

## Affects / depends on
- Depends on `@codehaunt/auth` (policy) and `src/middleware.ts`.

## Entry points & how to test
- `npm test -w @codehaunt/web` (loads `support/next-resolve.mjs` via `--import`).

## Gotchas
- A new route must get a `ROUTE_POLICY` row, or these tests (and the route) deny it.
