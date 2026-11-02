# auth/src
Implementation of `@codehaunt/auth`.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `password.ts` | argon2id hash/verify (OWASP params), random password generator |
| `session.ts` | create/resolve/destroy DB sessions; only SHA-256 of the token is stored; cookie options |
| `login.ts` | login (timing-safe for unknown users, throttled), single participant session, `setAccountActive` |
| `rate-limit.ts` | in-memory login throttling per username, per IP and globally (verbatim port) |
| `policy.ts` | route → roles table and `authorize()`; pure, no Node imports (`@codehaunt/auth/policy`) |

## Affects / depends on
- Used by: `apps/web/src/middleware.ts`, `apps/web/src/app/api/auth/*`, `apps/web/src/lib/session.ts`.
- Depends on: `@codehaunt/db` tables `users`, `auth_sessions`, `audit_log`.
- Changing `policy.ts` changes access to every route.

## Entry points & how to test
`npm test -w @codehaunt/auth`.

## Gotchas
- Inactive accounts are reported only after a correct password, so guessing can't tell them apart.
- `authorize()` denies paths with `..`, backslashes or encoded slashes; pass Next's normalised pathname.
