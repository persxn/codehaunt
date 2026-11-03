# leaderboard
Organizers' live leaderboard (ADR-008/009/028): never frozen; all four components, per-problem points and wrong attempts, overrides.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route (ADMIN, ORGANIZER) |
| `leaderboard.tsx` | board polled every 5 s; missing-calibration warning; override form per row (until results are final) |

## Affects / depends on
- Calls `/api/admin/ops/events/[id]/leaderboard` and `/api/admin/ops/participants/[id]/override`.
- Scores come from `computeStandings` in `packages/core/src/scoring.ts`.

## Entry points & how to test
`/admin/leaderboard?event=<id>` (ADMIN, ORGANIZER); services in `apps/web/test/contest-ops.test.ts`; access in `packages/auth/test/policy.test.ts`.

## Gotchas
- Process quality shows "—" until the judge (WP-07) scores; it adds 0 for everyone meanwhile.
- Names are participant-supplied text.
