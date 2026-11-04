# login

Login UI – renders the login form and handles authentication flow.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | sign-in page in the public theme (ADR-031): form panel with SEB/staff guidance, desk-scene art |
| `login-form.tsx` | `SignIn`: title, form (username/password → `/api/auth/login`, error from the API envelope) and notes; a `seb_required` refusal swaps in the SEB handoff |
| `seb-handoff.tsx` | `[claude]` ADR-039: asks the browser to open `sebs://<host>/CodeHaunt.seb` at once, three steps, the open button, "I don't have SEB" help with the official download link, back to sign in |
| `page.module.css` | layout; remaps the app's tool tokens onto the public theme so `Field`/`Button` match; fits 1366×768; the form rises in, the art settles then drifts slowly (ADR-037; off under reduced motion) |

## Affects / depends on
- Calls `@codehaunt/auth` login API; sets session cookie on success.
- The handoff links to `/CodeHaunt.seb` (`apps/web/public/`, public in `policy.ts`); a participant signed in from
  Edge is not signed in: SEB is a separate browser, so they sign in again inside it.

## Entry points & how to test
- Visit `/login` in the browser.
- Covered by `apps/web/test/routes.test.ts`.
