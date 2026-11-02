# contest

Contest landing page – displays contest information and entry points.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | React component for the contest page |

## Affects / depends on
- Participants only (`PARTICIPANT` role in `ROUTE_POLICY`); everyone else gets 401/403 from the middleware.

## Entry points & how to test
- Visit `/contest` on the dev server.
- Covered by route integration tests.
