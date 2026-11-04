# auth/src
Implementation of `@codehaunt/auth`.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `password.ts` | argon2id hash/verify (OWASP params), random password generator, length limits (12–200) |
| `session.ts` | create/resolve/destroy DB sessions; only SHA-256 of the token is stored; cookie options |
| `login.ts` | login (timing-safe, throttled), single participant session, `seb_required` for participants outside SEB (after the password check, old session kept; audit-logged `auth.seb_refused`), `checkPasswordStrength`, audit-logged `setAccountActive`, `changePassword` (current password throttled like a login, one at a time per account), `setPassword` (staff reset) |
| `rate-limit.ts` | in-memory login throttling per username, per IP and globally; slows down, never refuses (ADR-020); `slowedUsernames()` for the incident dashboard (usernames only, no IPs) |
| `common-passwords.ts` | generated: SecLists 10k common passwords, lowercased (see `/VENDORED.md`) |
| `seb.ts` | `[claude]` SEB Config Key check (ADR-013 §3): `sebConfig` (env `SEB_CONFIG_KEY` + `PUBLIC_ORIGIN`, both or neither, throws on half config), `sebHash`, `sebHeaderValid` (public origin + path + query, timing-safe) |
| `policy.ts` | route → roles table and `authorize()`; pure, no Node imports (`@codehaunt/auth/policy`); `/projector` and `/api/projector` are public (WP-05); `/`, `/icon.png`, `/opengraph-image.jpg` are public (ADR-029) |

## Affects / depends on
- Used by: `apps/web/src/middleware.ts`, `apps/web/src/app/api/auth/*`, `apps/web/src/lib/session.ts`.
- Depends on: `@codehaunt/db` tables `users`, `auth_sessions`, `audit_log`.
- Changing `policy.ts` changes access to every route.

## Entry points & how to test
`npm test -w @codehaunt/auth`.

## Gotchas
- Nobody can be locked out (ADR-020): repeated failures add a wait (username: +2 s per 8 failures up to 10 s; IP and
  site-wide: 1.5 s). The correct password always gets in.
- `checkPasswordStrength` must be called by every flow where a person chooses a password (WP-03/04).
- Inactive accounts are reported only after a correct password, so guessing can't tell them apart.
- Login's transaction updates the user row first: that row lock is what keeps one session per participant under
  concurrent logins (PGlite tests can't show the race; it was verified on Postgres).
- `authorize()` denies paths with `..`, backslashes or encoded slashes; pass Next's normalised pathname.
