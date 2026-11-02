# login

Login UI – renders the login form and handles authentication flow.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | Wrapper page component for login route |
| `login-form.tsx` | Form component with username/password fields |

## Affects / depends on
- Calls `@codehaunt/auth` login API; sets session cookie on success.

## Entry points & how to test
- Visit `/login` in the browser.
- Covered by `apps/web/test/routes.test.ts`.
