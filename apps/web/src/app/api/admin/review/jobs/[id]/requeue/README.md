# requeue
POST `JudgeQueueRequest`: a DONE or NEEDS_MANUAL job goes back to QUEUED (audited).

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), `src/server/review-service.ts`.
- Access: ADMIN and ORGANIZER (`/api/admin` in `packages/auth/src/policy.ts`, plus the role list passed to `route()`).

## Entry points & how to test
Service logic is tested in `apps/web/test/review.test.ts` (`npm test -w @codehaunt/web`).

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result. Every action carries a reason (audit log).
