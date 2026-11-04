# review
Batch-judge review API (WP-07, ADR-035): the board per event, queueing judging, re-queueing one participant.

## Contents
| Path | What it does |
|---|---|
| `events/` | `[id]/` GET: the review board; `[id]/queue/` POST: queue judging |
| `jobs/` | `[id]/requeue/` POST: put one judge job back in the queue |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), `src/server/review-service.ts`.
- Access: ADMIN and ORGANIZER (`/api/admin` in `packages/auth/src/policy.ts`, plus the role list passed to `route()`).

## Entry points & how to test
Service logic is tested in `apps/web/test/review.test.ts` (`npm test -w @codehaunt/web`).

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
