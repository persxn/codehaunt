# api

Backend API routes for the web app.

## Contents
| Path | What it does |
|---|---|
| `auth/` | Auth‑related endpoints (login, logout, me) |

## Affects / depends on
- Depends on `@codehaunt/auth` for session validation and `@codehaunt/db` for user data.
- Changing routes may require updates to `ROUTE_POLICY`.

## Entry points & how to test
- Access via HTTP requests (e.g., `POST /api/auth/login`).
- Covered by `apps/web/test/routes.test.ts`.
