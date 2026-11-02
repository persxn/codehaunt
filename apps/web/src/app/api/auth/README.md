# auth

Auth API endpoints handling login, logout and session introspection.

## Contents
| Path | What it does |
|---|---|
| `login/` | `POST /api/auth/login` – authenticate and set session |
| `logout/` | `POST /api/auth/logout` – destroy session |
| `me/` | `GET /api/auth/me` – return current user info |

## Affects / depends on
- Uses `@codehaunt/auth` functions for credential verification and session management.
- Relies on DB tables (`users`, `auth_sessions`).

## Entry points & how to test
- `POST /api/auth/login` with valid credentials → 200 and session cookie.
- `POST /api/auth/logout` → clears session.
- `GET /api/auth/me` → returns user JSON when authenticated.
- Tested in route test suite.
