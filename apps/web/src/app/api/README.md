# api

Backend API routes for the web app.

## Contents
| Path | What it does |
|---|---|
| `auth/` | Auth‑related endpoints (login, logout, me) |
| `contest/` | participant contest API (WP-03): state, consent, problems, workspace, sessions, revert, prompt stream, runs |
| `account/` | own-password change for every role |
| `admin/` | admin console API (WP-04): event editor, problems, participants, badges, staff, roles, password resets |
| `staff/` | desk API incl. volunteers: events, participant list, waitlist promotion, check-in |

## Affects / depends on
- Depends on `@codehaunt/auth` for session validation and `@codehaunt/db` for user data.
- Changing routes may require updates to `ROUTE_POLICY`.

## Entry points & how to test
- Access via HTTP requests (e.g., `POST /api/auth/login`).
- Covered by `apps/web/test/routes.test.ts` (no session → 401); services by `apps/web/test/*-flow.test.ts`.
- Every handler goes through `src/lib/route.ts` (`route(roles, handler)`), so every error is an `ApiError`.
