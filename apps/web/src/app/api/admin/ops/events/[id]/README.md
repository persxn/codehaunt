# [id]
GET contest status (clock, results state); POST `ContestControlRequest` (open_checkin, start, pause, resume, end; `contest-ops-service.ts`).

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `extend/` | add minutes for everyone |
| `leaderboard/` | live board |
| `results/` | results states and CSV |
| `projector/` | new projector link |
| `participants/` | ops participant list |
| `incidents/` | incident dashboard data |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: ADMIN and ORGANIZER (`/api/admin` in `packages/auth/src/policy.ts`, plus the role list passed to `route()`).

## Entry points & how to test
Service logic is tested in `apps/web/test/contest-ops.test.ts` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result. Every action carries a reason (audit log).
