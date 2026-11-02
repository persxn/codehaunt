# staff
Desk API for every staff role incl. volunteers (ADR-013): no prompts, tokens or scores.

## Contents
| Path | What it does |
|---|---|
| `events/` | events the desk can work on |
| `participants/` | desk list and waitlist promotion |
| `checkin/` | POST: a scanned badge code |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: see `packages/auth/src/policy.ts` (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
