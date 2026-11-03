# contest
Contest operations page (WP-05, ADR-028): the clock and its controls, extend, projector link, results states and CSV, and per-participant actions.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route (ADMIN, ORGANIZER); passes the role to the event picker |
| `contest-ops.tsx` | status cards (polled every 2 s, local tick), control/extend/results forms, projector link (shown once), participant table with top-up, extra time, sign-out, disqualify, deactivate, reinstate |

## Affects / depends on
- Calls `/api/admin/ops/events/[id]` (+ `extend`, `projector`, `results`, `participants`) and `/api/admin/ops/participants/[id]/*`.
- Uses `../ops.tsx` (`ActionForm`, `usePoll`).

## Entry points & how to test
`/admin/contest?event=<id>` (ADMIN, ORGANIZER); services in `apps/web/test/contest-ops.test.ts`; access in `packages/auth/test/policy.test.ts`.

## Gotchas
- Every action needs a reason: it goes to audit_log.
- Top-ups send a fresh `idempotencyKey` per submit; the busy button stops double clicks.
- The projector link is shown once (only its hash is stored); making a new one breaks the old.
