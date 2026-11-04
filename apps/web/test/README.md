# test

Tests for the web app: access control (policy, middleware, CSP) without a server or database, and the services behind the API on PGlite.

## Contents
| Path | What it does |
|---|---|
| `routes.test.ts` | walks every page/route under `src/app` and asserts the policy gives 401 without a session unless public |
| `middleware.test.ts` | the real `middleware()` on real `NextRequest`s: 401s, public pass-through, path tricks, cross-site POST 403, nonce CSP per request, SEB gate (exact URL, staff/public exempt, half config fails closed) |
| `config.test.ts` | startup config: an empty `COOKIE_SECURE` is accepted and cookies stay Secure in production; SEB settings both or neither |
| `support/` | Node resolve hook for `next/server`, and test fixtures (`support/README.md`) |
| `participant-flow.test.ts` | prompt → code with exact settlement; failures uncharged and discarded; budget exhausted; practice; consent; sessions/revert; runs; hidden-test payload scan and SQL-level check |
| `admin-flow.test.ts` | import + waitlist, badges, single-use check-in, cap, live budget change, event lock, problems, staff rules, role change, anonymise |
| `budget-concurrency.test.ts` | real Postgres (`TEST_POSTGRES_URL`): live budget changes during reserve/settle loops: no deadlock, exact final balances |
| `gateway-client.test.ts` | `GatewayClient` with a fake fetch: split SSE chunks, usage required, b only on connection failure or Traefik text 502/503/504, no retry after a timeout or a JSON error |
| `contest-ops.test.ts` | WP-05: start sets `lockedAt`; pause blocks prompts/submits and stops the clock; resume/extend; `contestMs`; extra time; top-up idempotency; disqualify/deactivate/reinstate; counted IE + reversal; re-judge; projector freeze, strict view, link rotation; results states; CSV injection; no hidden output in the log; audit run-13 regressions R13-1…5 and the admin-only incident text |
| `review.test.ts` | WP-07 review: queue only after the contest, once per participant, audited; re-queue rules; board shows the newest overall score, flags, override; leaderboard uses the overall row |
| `drafts.test.ts` | WP-07 task 8: approve → hidden test / NAIVE solution, reject, decided once, refused after the start, audited |
| `role-writes.test.ts` | static: only `changeRole` in `server/staff-service.ts` updates `users.role` |

## Affects / depends on
- Depends on `@codehaunt/auth` (policy) and `src/middleware.ts`.

## Entry points & how to test
- `npm test -w @codehaunt/web` (loads `support/next-resolve.mjs` via `--import`).

## Gotchas
- A new route must get a `ROUTE_POLICY` row, or these tests (and the route) deny it.
