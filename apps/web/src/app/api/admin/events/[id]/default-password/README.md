# default-password
`POST { password | null, reason? }` (ADMIN; ADR-041): set or clear the event's default participant password. Setting it
checks the ADR-020 rules, stores only an argon2 hash on the event, gives it (with the forced change) to every participant
it may apply to and ends their sessions; answers how many accounts now use it. Never echoes the password or hash.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler: `setEventDefaultPassword` (`src/server/default-password-service.ts`) |

## Affects / depends on
- Depends on: `src/lib/route.ts`, `src/server/default-password-service.ts`. Used by setup step 06.

## Entry points & how to test
`apps/web/test/accounts.test.ts`.

## Gotchas
Security-critical (Claude-owned). The plaintext must never be logged, stored or returned.
