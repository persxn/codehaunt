# [id]
GET the full problem incl. hidden tests and solutions; PUT replaces it; DELETE (no runs yet). ADMIN only; frozen after the start.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |
| `calibrate/` | calibration runs |
| `drafts/` | GPT-OSS drafts (WP-07 task 8): list, approve, reject |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: see `packages/auth/src/policy.ts` (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
