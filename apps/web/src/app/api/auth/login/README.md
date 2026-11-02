# login

Endpoint for user login.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | Handles `POST /api/auth/login`, verifies credentials, creates session cookie |

## Affects / depends on
- Calls `@codehaunt/auth` login logic; writes `auth.session_replaced` audit entry.
- Returns 401 on failure.

## Entry points & how to test
- `POST /api/auth/login` with JSON `{username, password}`.
- Verified by `apps/web/test/routes.test.ts`.
