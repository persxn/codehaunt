# [id]
GET the event with its config; PUT `EventUpdateRequest` (after the start only budget/schedule; audit-logged; budget changes adjust balances).

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `problems/` | its problems |
| `setup/` | setup roadmap state (GET) and launch = open check-in (POST; 409 `setup_incomplete` lists what's missing) |
| `default-password/` | set or clear the event's default participant password (ADR-041) |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: see `packages/auth/src/policy.ts` (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
