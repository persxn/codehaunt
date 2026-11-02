# test

Tests for the web app: access control (policy, middleware, CSP) without a server or database, and the services behind the API on PGlite.

## Contents
| Path | What it does |
|---|---|
| `routes.test.ts` | walks every page/route under `src/app` and asserts the policy gives 401 without a session unless public |
| `middleware.test.ts` | the real `middleware()` on real `NextRequest`s: 401s, public pass-through, path tricks, cross-site POST 403, nonce CSP per request |
| `config.test.ts` | startup config: an empty `COOKIE_SECURE` is accepted and cookies stay Secure in production |
| `support/` | Node resolve hook for `next/server`, and test fixtures (`support/README.md`) |
| `participant-flow.test.ts` | prompt → code with exact settlement; failures uncharged and discarded; budget exhausted; practice; consent; sessions/revert; runs; hidden-test payload scan and SQL-level check |
| `admin-flow.test.ts` | import + waitlist, badges, single-use check-in, cap, live budget change, event lock, problems, staff rules, role change, anonymise |
| `role-writes.test.ts` | static: only `changeRole` in `server/staff-service.ts` updates `users.role` |

## Affects / depends on
- Depends on `@codehaunt/auth` (policy) and `src/middleware.ts`.

## Entry points & how to test
- `npm test -w @codehaunt/web` (loads `support/next-resolve.mjs` via `--import`).

## Gotchas
- A new route must get a `ROUTE_POLICY` row, or these tests (and the route) deny it.
