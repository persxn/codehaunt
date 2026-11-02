# participants
GET `?eventId=`: status, seat, badge and check-in state per participant.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `[id]/` | one participant |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: see `packages/auth/src/policy.ts` (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
