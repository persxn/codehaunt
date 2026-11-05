# event
Event editor (`/admin/event`, ADMIN only; ADR-006): create an event and edit its whole config as one form.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route; renders the editor |
| `event-editor.tsx` | new-event form, config form by section, languages, reason; locked events keep only Budget and Schedule editable |
| `config-fields.ts` | the form's field list per `EventConfig` section, dotted get/set, datetime-local ↔ ISO with offset, `defaultConfig` for new events (tutor prompt `tutor-v2`, ADR-042) |

## Affects / depends on
- Calls `GET/POST /api/admin/events`, `GET/PUT /api/admin/events/{id}`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
A budget change adjusts every checked-in participant by the difference (server side); the reason goes to the audit log.
