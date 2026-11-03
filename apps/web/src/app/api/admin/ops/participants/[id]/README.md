# [id]
GET one participant's log (prompts, replies, code, runs, ledger, actions; no hidden-test output).

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `topup/` | token top-up |
| `extra-time/` | extra minutes |
| `action/` | disqualify, reinstate, end session, deactivate |
| `override/` | score override |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: ADMIN and ORGANIZER (`/api/admin` in `packages/auth/src/policy.ts`, plus the role list passed to `route()`).

## Entry points & how to test
Service logic is tested in `apps/web/test/contest-ops.test.ts` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result. Every action carries a reason (audit log).
