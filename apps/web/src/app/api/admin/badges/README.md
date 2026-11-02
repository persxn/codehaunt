# badges
POST `BadgeRequest`: issues badges (password + check-in code), returned once for printing; reissue replaces both.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: see `packages/auth/src/policy.ts` (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
