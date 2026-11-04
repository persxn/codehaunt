# admin
The admin console and the desk (WP-04): Event editor, problems, participants, badges, staff, QR check-in, desk;
contest operations (WP-05): controls, leaderboard, incidents, participant log.
Who may open what is decided per path in `packages/auth/src/policy.ts` (volunteers: check-in and desk only).

## Contents
| Path | What it does |
|---|---|
| `layout.tsx` | shell: sticky header (wordmark, "Admin console", user, sign out), role-based nav, content (max 1240 px); participants are sent away |
| `nav.tsx` | `Nav`: links by role in three groups (run the contest · set up · at the door) with line icons, keeps `?event=`; a scrolling strip below 900 px; `SignOut` |
| `page.tsx` | overview route (ADMIN, ORGANIZER) |
| `overview.tsx` | live counts by participant status (polled every 10 s), the door funnel chart (registered → checked in → consented → badge), action tiles to the next pages |
| `event-picker.tsx` | `useEventId()` (from `?event=`) and `EventPicker` |
| `ops.tsx` | WP-05 shared: `usePoll` (5 s boards), `clock`, `time`, `ActionForm` (action as large choice buttons + optional number + required reason; Apply names the action; idempotency key kept until success) |
| `api.ts` | typed fetch helpers (`getJSON`, `postJSON`, `putJSON`, `patchJSON`, `deleteJSON`) and `eventOptions()` |
| `admin.module.css` | WP-07 Part 2 look: shell (texture ground, grouped nav, Creepster titles over the double rule, page entrance), shared classes (table, stack, row, cornered card, fieldset, cards with staggered entrance, choices, hero, funnel, tiles, muted, error, success, pre); grid children shrink so wide tables scroll inside themselves |
| `event/` | Event editor (ADMIN) |
| `problems/` | problem editor + calibration (ADMIN) |
| `participants/` | list, CSV import, export/delete |
| `badges/` | issue and print badges |
| `staff/` | staff management, role changes (ADMIN) |
| `checkin/` | camera QR check-in (all staff) |
| `desk/` | desk list and waitlist promotion (all staff) |
| `contest/` | contest clock controls, extend, projector link, results, participant actions (ADMIN, ORGANIZER) |
| `leaderboard/` | live leaderboard with all components and overrides (ADMIN, ORGANIZER) |
| `incidents/` | incident dashboard (ADMIN, ORGANIZER; ADR-021) |
| `review/` | batch-judge review: queue judging, scores, integrity flags, override (ADMIN, ORGANIZER; WP-07) |
| `log/` | one participant's log (`?participant=`) |

## Affects / depends on
- Calls `/api/admin/*` (WP-05 pages: `/api/admin/ops/*`) and `/api/staff/*` (services in `src/server/`); components from `src/components/`.
- Changing `policy.ts` rows for `/admin/*` changes who sees these pages.

## Entry points & how to test
`/admin` in the web app; `e2e/admin.spec.ts` (admin creates an event in the UI, check-in, staff rules); route access in
`packages/auth/test/policy.test.ts`.

## Gotchas
- Badges hold passwords and check-in codes only in memory; nothing here stores them.
- The problem pages show hidden tests and solutions: they must stay ADMIN-only.
- The UI hides actions a role can't do, but the server is what enforces it.
- Prompts, replies, code, names and `internalError` are untrusted text: render them as text (React escapes), never as HTML.
