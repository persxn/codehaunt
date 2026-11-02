# admin

Admin console page – shows event management UI.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | React component rendering the admin UI |

## Affects / depends on
- Depends on auth session (staff only: ADMIN, ORGANIZER or VOLUNTEER, per `ROUTE_POLICY`). No further internal dependencies.

## Entry points & how to test
- Visit `/admin` in the dev server; protected by auth policy.
- No dedicated unit test – covered by overall route test suite.
