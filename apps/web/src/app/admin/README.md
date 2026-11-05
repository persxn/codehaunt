# admin
The admin console and the desk (WP-04): Event editor, problems, participants, badges, staff, QR check-in, desk;
contest operations (WP-05): controls, leaderboard, incidents, participant log; WP-11 (ADR-043/044): the control-room
overview, the event setup roadmap, participant management and the signal accents.
Who may open what is decided per path in `packages/auth/src/policy.ts` (volunteers: check-in and desk only).

## Contents
| Path | What it does |
|---|---|
| `layout.tsx` | shell: sticky header (wordmark, "Admin console", user, sign out), role-based nav, content (max 1240 px); participants are sent away |
| `nav.tsx` | `Nav`: links by role in three groups (run the contest · set up [Setup roadmap, All event settings, …] · at the door) with line icons, keeps `?event=`; active link glows, icons split RGB on hover; a scrolling strip below 900 px; `SignOut` |
| `page.tsx` | overview route (ADMIN, ORGANIZER) |
| `overview.tsx` | WP-11 overview, polled every 10 s from `GET /api/admin/dashboard`: control-room hero (live/draft/finished events, participants, signed in now, last hour) with quick actions; the selected event's panel (setup progress and next step, participants, live sessions, tutor incl. answer requests redirected and replies trimmed, submissions, tokens, incidents); door funnel; recent events with setup progress; empty states with the next action. Real counts only |
| `dashboard.module.css` | the overview's styles (hero, stat strip, event panel, tiles 3/2/1 columns, recent list, empty state) |
| `dialog.tsx` / `dialog.module.css` | `Dialog`: native `<dialog>` confirmation (focus trapped, Esc closes) used for every change that removes or resets something |
| `setup/` | event setup roadmap (ADMIN; ADR-044) |
| `event-picker.tsx` | `useEventId()` (from `?event=`) and `EventPicker` |
| `ops.tsx` | WP-05 shared: `usePoll` (5 s boards), `clock`, `time`, `ActionForm` (action as large choice buttons in a radiogroup: one Tab stop, arrows/Home/End + optional number + required reason; Apply names the action; idempotency key kept until success) |
| `api.ts` | typed fetch helpers (`getJSON`, `postJSON`, `putJSON`, `patchJSON`, `deleteJSON`) and `eventOptions()` |
| `admin.module.css` | WP-11: ambient light behind the shell, a signal line under the header, page titles glitch once on entry, stat cards lift on hover (all off under reduced motion). WP-07 Part 2 look: shell (texture ground, grouped nav, Creepster titles over the double rule, page entrance), shared classes (table, stack, row, cornered card, fieldset, cards with staggered entrance, choices, hero, funnel, tiles, muted, error, success, pre); grid children shrink so wide tables scroll inside themselves |
| `event/` | "All event settings": every config field on one page (ADMIN); the roadmap is the guided path |
| `problems/` | problem editor + calibration (ADMIN) |
| `participants/` | strict CSV import, search/filter, end sessions, reset password, export/delete |
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
- Badges hold passwords and check-in codes only in memory; nothing here stores them. The event password (ADR-041) is
  shown once after it is set (step 06) and never again.
- Effects come from `src/app/signal.css` (ADR-043): use its classes, not new keyframes; CSS modules rename keyframes,
  so a module that needs the glitch keeps a local copy (`admin.module.css`).
- The problem pages show hidden tests and solutions: they must stay ADMIN-only.
- The UI hides actions a role can't do, but the server is what enforces it.
- Prompts, replies, code, names and `internalError` are untrusted text: render them as text (React escapes), never as HTML.
