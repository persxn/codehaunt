# admin
Admin console API (WP-04). ADMIN and ORGANIZER by default; the Event editor (`events/`, `problems/`) and `roles/` are
ADMIN only (policy rows in `packages/auth/src/policy.ts`, and the role list in each handler).

## Contents
| Path | What it does |
|---|---|
| `events/` | event list/create; `[id]/` get/update config; `[id]/problems/` list/create problems; `[id]/setup/` roadmap state + launch; `[id]/default-password/` event password (ADR-041) |
| `dashboard/` | overview counts: platform, or one event with `?eventId=` (ADMIN, ORGANIZER; ADR-044) |
| `problems/` | `[id]/` full problem incl. hidden tests (get/replace/delete); `[id]/calibrate/` |
| `participants/` | `import/` strict import (dry run, all or nothing, ADR-044); `[id]/` export and delete (hard delete without activity, else anonymise) |
| `badges/` | issue badges: password + single-use check-in code, returned once |
| `staff/` | list/create staff; `[id]/` activate/deactivate |
| `roles/` | `[id]/` the one audited role change |
| `users/` | `[id]/password/` staff password reset: a new one, or back to the event default (ADR-041) |
| `ops/` | contest operations (WP-05): controls, extend, leaderboard, results + CSV, projector link, participant log/actions, overrides, incidents |
| `review/` | batch-judge review (WP-07): board per event, queue judging, re-queue a job |

## Affects / depends on
- Depends on: `src/lib/route.ts`, services in `src/server/` (`event-service`, `problem-admin-service`,
  `participant-admin-service`, `checkin-service`, `staff-service`; WP-05: `contest-ops-service`, `leaderboard-service`,
  `incident-service`, `participant-log-service`; WP-11: `setup-service`, `dashboard-service`, `default-password-service`).
- Every write is audit-logged by its service.

## Entry points & how to test
`npm test -w @codehaunt/web` (`admin-flow.test.ts`, `role-writes.test.ts`); access per path: `npm test -w @codehaunt/auth`.

## Gotchas
- `problems/[id]` returns hidden tests and reference solutions: never call it from participant code.
- Badges are the only place passwords and check-in codes appear in clear; nothing stores or logs them. With an event
  password the badge carries none; the event password itself is echoed only to the admin who typed it.
