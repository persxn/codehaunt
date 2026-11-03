# admin
The admin console and the desk (WP-04): Event editor, problems, participants, badges, staff, QR check-in, desk.
Who may open what is decided per path in `packages/auth/src/policy.ts` (volunteers: check-in and desk only).

## Contents
| Path | What it does |
|---|---|
| `layout.tsx` | shell: header (wordmark, user, sign out), role-based nav, content (max 1200 px); participants are sent away |
| `nav.tsx` | `Nav` (links by role, keeps `?event=`), `SignOut` |
| `page.tsx` | overview route (ADMIN, ORGANIZER) |
| `overview.tsx` | counts by participant status for the selected event, links to the pages |
| `event-picker.tsx` | `useEventId()` (from `?event=`) and `EventPicker` |
| `api.ts` | typed fetch helpers (`getJSON`, `postJSON`, `putJSON`, `patchJSON`, `deleteJSON`) and `eventOptions()` |
| `admin.module.css` | shared classes: shell, table, stack, row, card, fieldset, cards, muted, error, success, pre |
| `event/` | Event editor (ADMIN) |
| `problems/` | problem editor + calibration (ADMIN) |
| `participants/` | list, CSV import, export/delete |
| `badges/` | issue and print badges |
| `staff/` | staff management, role changes (ADMIN) |
| `checkin/` | camera QR check-in (all staff) |
| `desk/` | desk list and waitlist promotion (all staff) |

## Affects / depends on
- Calls `/api/admin/*` and `/api/staff/*` (services in `src/server/`); components from `src/components/`.
- Changing `policy.ts` rows for `/admin/*` changes who sees these pages.

## Entry points & how to test
`/admin` in the web app; `e2e/admin.spec.ts` (admin creates an event in the UI, check-in, staff rules); route access in
`packages/auth/test/policy.test.ts`.

## Gotchas
- Badges hold passwords and check-in codes only in memory; nothing here stores them.
- The problem pages show hidden tests and solutions: they must stay ADMIN-only.
- The UI hides actions a role can't do, but the server is what enforces it.
