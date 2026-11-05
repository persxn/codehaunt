# participants
Participants (`/admin/participants`, ADMIN and ORGANIZER; WP-11, ADR-041/044): strict CSV import with preview, add one
person, search and status filters, and per person: end sessions, reset password (new one or the event default),
export and delete for admins (ADR-010). Every change goes through a confirmation dialog.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route |
| `participants-admin.tsx` | page: import panel, add-one form (server issues shown), search, status filter chips with counts, table (signed-in dot, "event password" flag) that becomes cards below 720 px; dialogs for end sessions, reset password, delete (says when it anonymises instead) |
| `participant-import.tsx` | `ParticipantImport` (also used by setup step 05): format note + template download, drop zone, browser shape check, server dry run, preview with every issue by line and column, all-or-nothing import, success state; `downloadTemplate()` |
| `csv.ts` | strict CSV: the documented format, RFC 4180 quoting with line numbers, unknown/duplicate/missing columns are file errors, 1 MB / 1,000 rows, blank lines counted, per-row checks; `TEMPLATE` |
| `import.module.css` | import styles (drop zone with scan line while working, issue list, drawn success check) |
| `participants.module.css` | page styles (toolbar, filter chips, status colours, phone cards) |

## Affects / depends on
- Calls `GET /api/staff/participants`, `POST /api/admin/participants/import` (`dryRun` first), `GET/DELETE
  /api/admin/participants/{id}`, `POST /api/admin/ops/participants/{id}/action` (`end_session`), `POST /api/admin/users/{userId}/password`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
- Delete removes a participant with no activity outright; with activity it anonymises for good (the ledgers keep their rows).
- One bad row stops the whole import: the server re-checks everything at commit and answers 409 with the issues.
- Registrations beyond the check-in cap are waitlisted by the server (shown in the preview, not an error).
