# login

Login UI – renders the login form and handles authentication flow.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | sign-in page in the public theme (ADR-031): form panel with SEB/staff guidance, desk-scene art |
| `login-form.tsx` | form (username/password → `/api/auth/login`, error from the API envelope); logic unchanged by the redesign |
| `page.module.css` | layout; remaps the app's tool tokens onto the public theme so `Field`/`Button` match; fits 1366×768; the form rises in, the art settles then drifts slowly (ADR-037; off under reduced motion) |

## Affects / depends on
- Calls `@codehaunt/auth` login API; sets session cookie on success.

## Entry points & how to test
- Visit `/login` in the browser.
- Covered by `apps/web/test/routes.test.ts`.
