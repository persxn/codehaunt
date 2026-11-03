# override
POST `ScoreOverrideRequest`: replaces one score component (ADR-009); refused once results are final.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: ADMIN and ORGANIZER (`/api/admin` in `packages/auth/src/policy.ts`, plus the role list passed to `route()`).

## Entry points & how to test
Service logic is tested in `apps/web/test/contest-ops.test.ts` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result. Every action carries a reason (audit log).
