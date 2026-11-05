# dashboard
`GET /api/admin/dashboard` (ADMIN, ORGANIZER; WP-11, ADR-044): the admin overview's numbers. Without a query: events by
status, participants, checked in, live participant sessions, questions and submissions in the last hour, recent events
with setup progress. With `?eventId=`: that event's setup progress, participants by status, live sessions, tutor
questions (answer requests redirected, replies trimmed), submissions/accepted, tokens used, open incidents.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler: calls `platformDashboard` or `eventDashboard` (`src/server/dashboard-service.ts`) |

## Affects / depends on
- Depends on: `src/lib/route.ts`, `src/server/dashboard-service.ts`. Used by `src/app/admin/overview.tsx`.

## Entry points & how to test
`apps/web/test/setup-dashboard.test.ts` (numbers equal direct counts; no personal data).

## Gotchas
Counts only: never add names, enrolment numbers or text here (organisers' phones show this page).
