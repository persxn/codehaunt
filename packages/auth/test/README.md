# auth/test
Tests for `@codehaunt/auth`.

## Contents
| Path | What it does |
|---|---|
| `policy.test.ts` | public routes, 401 without session, 403 for unknown routes and wrong roles, traversal |
| `login.test.ts` | argon2, login, inactive accounts, single participant session + audit, delay-only throttling, password rules, audited deactivation (PGlite) |
| `login-race.test.ts` | 8 concurrent logins leave one live participant session (real Postgres, `TEST_POSTGRES_URL`) |

## Affects / depends on
- Depends on: `@codehaunt/db/testing` (PGlite with all migrations applied; `createPostgresTestDatabase` for the race test).

## Entry points & how to test
`npm test -w @codehaunt/auth`.

## Gotchas
- Each file runs in its own process with its own in-memory database.
- `login-race.test.ts` skips without `TEST_POSTGRES_URL`; `scripts/ci.sh` sets it from `.env` and starts Postgres.
  It is the only test that can catch a regression of the user-row lock in `login.ts`.
