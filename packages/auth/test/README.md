# auth/test
Tests for `@codehaunt/auth`.

## Contents
| Path | What it does |
|---|---|
| `policy.test.ts` | public routes, 401 without session, 403 for unknown routes and wrong roles, traversal |
| `login.test.ts` | argon2, login, inactive accounts, single participant session + audit, throttling (PGlite) |

## Affects / depends on
- Depends on: `@codehaunt/db/testing` (PGlite with all migrations applied).

## Entry points & how to test
`npm test -w @codehaunt/auth`.

## Gotchas
Each file runs in its own process with its own in-memory database.
