# setup
The event setup roadmap (`/admin/setup`, ADMIN only; WP-11, ADR-044): seven numbered steps from creating an event to
opening check-in. 01 Event · 02 Schedule · 03 Limits · 04 Problems · 05 Participants · 06 Access · 07 Review & launch.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route: "Event setup" title, `Roadmap` |
| `roadmap.tsx` | `Roadmap`: `?new=1` (or no event) shows the create form (step 01: name + short name, then the config defaults); otherwise the rail (big step numbers, done/to do/needs attention, checks for done) and one panel per step (`?step=N`). Steps 01/02/03/06 save the whole config with reason `setup:NN`; unsaved edits are one draft shared by all steps and kept in sessionStorage across reloads; step 05 embeds `ParticipantImport`; step 06 sets the event password (shown once) and shows what participants need; step 07 reviews every step and launches through a dialog |
| `setup.module.css` | roadmap styles: sticky numbered rail with joining line, the active step's glowing number, panel with gradient step number and the one rotating border, schedule timeline, review rows, launched state; rail becomes a number strip below 1000 px |

## Affects / depends on
- Calls `GET /api/admin/events/{id}/setup` (state, derived on the server), `GET/PUT /api/admin/events/{id}`,
  `POST /api/admin/events`, `GET /api/admin/events/{id}/problems`, `POST /api/admin/events/{id}/default-password`,
  `POST /api/admin/events/{id}/setup` (launch).
- Depends on `../event/config-fields.ts` (`defaultConfig`, date helpers), `../participants/participant-import.tsx`, `../dialog.tsx`.

## Entry points & how to test
`/admin/setup?new=1`; service logic in `apps/web/test/setup-dashboard.test.ts`.

## Gotchas
- Step state is never stored: a step counts as saved only through the audit row the PUT writes with its `setup:NN` reason.
- Launch is also refused by the server (and by Contest ops' "Open check-in") while a required item fails.
- After the contest starts the server accepts only schedule and budget changes; the other inputs are disabled.
