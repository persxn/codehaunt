# admin
Admin console API (WP-04). ADMIN and ORGANIZER by default; the Event editor (`events/`, `problems/`) and `roles/` are
ADMIN only (policy rows in `packages/auth/src/policy.ts`, and the role list in each handler).

## Contents
| Path | What it does |
|---|---|
| `events/` | event list/create; `[id]/` get/update config; `[id]/problems/` list/create problems |
| `problems/` | `[id]/` full problem incl. hidden tests (get/replace/delete); `[id]/calibrate/` |
| `participants/` | `import/` rows from CSV/form; `[id]/` export and delete (anonymise) |
| `badges/` | issue badges: password + single-use check-in code, returned once |
| `staff/` | list/create staff; `[id]/` activate/deactivate |
| `roles/` | `[id]/` the one audited role change |
| `users/` | `[id]/password/` staff password reset |

## Affects / depends on
- Depends on: `src/lib/route.ts`, services in `src/server/` (`event-service`, `problem-admin-service`,
  `participant-admin-service`, `checkin-service`, `staff-service`).
- Every write is audit-logged by its service.

## Entry points & how to test
`npm test -w @codehaunt/web` (`admin-flow.test.ts`, `role-writes.test.ts`); access per path: `npm test -w @codehaunt/auth`.

## Gotchas
- `problems/[id]` returns hidden tests and reference solutions: never call it from participant code.
- Badges are the only place passwords and check-in codes appear in clear; nothing stores or logs them.
