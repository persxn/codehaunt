# setup
Setup roadmap for one event (ADMIN; WP-11, ADR-044). GET returns the seven steps with their state (done / todo /
blocked), summaries and issues, derived on every read. POST `{ action: 'launch', reason }` opens check-in through
`controlContest`, which refuses (409 `setup_incomplete`) while a required item fails.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handlers: `getSetup`, launch |

## Affects / depends on
- Depends on: `src/server/setup-service.ts`, `src/server/contest-ops-service.ts`. Used by `src/app/admin/setup/`.

## Entry points & how to test
`apps/web/test/setup-dashboard.test.ts`.

## Gotchas
The required items (valid schedule, a contest problem with hidden tests, a participant) also gate Contest ops' "Open check-in".
