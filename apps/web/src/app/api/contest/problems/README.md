# problems
GET the problems open to the participant now (practice before the start, the rest after).

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `[id]/` | one problem |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: PARTICIPANT (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
