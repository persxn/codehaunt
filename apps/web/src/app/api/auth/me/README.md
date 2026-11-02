# me

Endpoint to fetch the current authenticated user.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | Handles `GET /api/auth/me`, returns user JSON if session valid |

## Affects / depends on
- Uses `@codehaunt/auth` session resolution; reads from `users` table.

## Entry points & how to test
- `GET /api/auth/me` with session cookie → 200 and user data; 401 otherwise.
