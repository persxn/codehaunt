# lib

Utility library for the web app.

## Contents
| Path | What it does |
|---|---|
| `config.ts` | Reads environment config (e.g., API base URL) |
| `http.ts` | Wrapper around fetch with auth cookie handling |
| `session.ts` | `currentUser()`: resolves the session cookie to a user on the server (route handlers, pages) |

## Affects / depends on
- Depends on `@codehaunt/auth` policy for protected calls.
- Used by many pages and API clients.

## Entry points & how to test
- Imported by components; unit tests reside in `apps/web/test/` (none specific).
