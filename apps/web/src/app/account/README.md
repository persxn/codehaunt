# account
`/account` for every signed-in role: shows the account and lets the person change their own password (ADR-020).

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | server page in the shared card (`components/card-page.module.css`): name, username, the form; sends anonymous visitors to `/login` |
| `password-form.tsx` | current + new + repeat; POST `/api/account/password`; shows the server's plain-language refusal |
| `account.module.css` | form styles (tokens only); the page layout comes from the shared card |

## Affects / depends on
- Calls `POST /api/account/password` (`checkPasswordStrength`, ends the user's other sessions).
- Policy row `/account` (all roles) in `packages/auth/src/policy.ts`.

## Entry points & how to test
`e2e/participant.spec.ts` (weak password refused with its reason); `packages/auth/test/login.test.ts` for the rules.

## Gotchas
The only client-side check is that the two new passwords match; strength is decided by the server.
