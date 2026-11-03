# admin

Admin console page – shows event management UI.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | React component rendering the admin UI |
| `layout.tsx` | Admin shell: header, side nav, content area |
| `nav.tsx` | Side navigation links (client component, marks the current page) |
| `api.ts` | Typed fetch helpers (`getJSON`, `postJSON`, ...) and `eventOptions()` |
| `admin.module.css` | Shared admin classes: shell, table, stack, row, muted, error, success, card, pre |
| `checkin/` | Volunteer camera QR check-in page (`/admin/checkin`) |
| `desk/` | Volunteer desk list with search and waitlist promotion (`/admin/desk`) |

## Affects / depends on
- Depends on auth session (staff only: ADMIN, ORGANIZER or VOLUNTEER, per `ROUTE_POLICY`). No further internal dependencies.

## Entry points & how to test
- Visit `/admin` in the dev server; protected by auth policy.
- No dedicated unit test – covered by overall route test suite.
