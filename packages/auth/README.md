# auth
Accounts and sessions for every CodeHaunt app: argon2id passwords, DB-backed sessions, login throttling, and the
deny-by-default route policy. Ported from JojoCode @ a8f4056 (see `/VENDORED.md`). Security-critical: Claude-owned.

## Contents
| Path | What it does |
|---|---|
| `src/` | password, session, login, rate-limit, policy (details in `src/README.md`) |
| `test/` | policy unit tests, login/session tests on PGlite, concurrent-login test on Postgres (`test/README.md`) |
| `package.json` | `@codehaunt/auth`; exports `.` and `./policy` |
| `tsconfig.json` | extends the root base config |

## Affects / depends on
- Used by: `apps/web` (middleware, `/api/auth/*`, `lib/session.ts`); later the admin console (check-in, deactivate).
- Depends on: `@codehaunt/db` (`users`, `auth_sessions`, `audit_log`), `@node-rs/argon2`. Env: `COOKIE_SECURE`, `NODE_ENV`.
- Changing the policy table changes who can reach every route; changing session TTL/cookie affects every login.

## Entry points & how to test
`login`, `resolveSession`, `destroySession`, `setAccountActive`, `authorize`, `ROUTE_POLICY`. Test: `npm test -w @codehaunt/auth`.

## Gotchas
- A route missing from `ROUTE_POLICY` is denied (401 without a session, 403 with one). Add a row when you add a route.
- One active session per participant: a new login ends the old one and writes `auth.session_replaced` to `audit_log`.
- A participant's correct password from outside SEB is refused (`seb_required`) and writes `auth.seb_refused` (no IP,
  ADR-010), listed on the admin Incidents page (audit R16-6).
- Throttling state is in process memory; it resets on restart and is per web instance. It delays, never refuses (ADR-020).
