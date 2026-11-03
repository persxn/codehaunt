# participants
Participants (`/admin/participants`, ADMIN and ORGANIZER): list, CSV import with preview, single-person form; export and delete for admins (ADR-010).

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route |
| `participants-admin.tsx` | table, import preview, add-one form, export (JSON download) and delete (with reason) |
| `csv.ts` | RFC 4180-ish parser and header mapping (name, enrolment, email, phone), per-line validation |

## Affects / depends on
- Calls `GET /api/staff/participants`, `POST /api/admin/participants/import`, `GET/DELETE /api/admin/participants/{id}`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
Delete anonymises for good (the ledgers keep their rows). Registrations beyond the check-in cap are waitlisted by the server.
