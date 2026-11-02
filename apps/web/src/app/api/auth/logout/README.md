# logout

Endpoint for user logout.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | Handles `POST /api/auth/logout`, destroys session cookie |

## Affects / depends on
- Calls `@codehaunt/auth` logout function; nothing is audit-logged.

## Entry points & how to test
- `POST /api/auth/logout` with valid session cookie → 204 and cookie cleared.
