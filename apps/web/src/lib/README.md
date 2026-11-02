# lib

Server-side helpers for the web app.

## Contents
| Path | What it does |
|---|---|
| `config.ts` | validates `DATABASE_URL`, `NODE_ENV`, `COOKIE_SECURE`, `GATEWAY_URL`, `GATEWAY_FALLBACK_URL`, `GATEWAY_TOKEN` (empty = unset) at startup; exits naming the bad key; `parseConfig` for tests |
| `http.ts` | request IDs (`cf-ray` or UUID), `apiError` (the one `ApiError` envelope), `clientIp` (`cf-connecting-ip` only) |
| `session.ts` | `currentUser()`: resolves the session cookie to a user on the server (route handlers, pages) |
| `csp.ts` | `contentSecurityPolicy(nonce, dev)` and `newNonce()`: per-request nonce CSP, no `'unsafe-inline'` scripts (set by `middleware.ts`) |
| `route.ts` | `route(roles, handler)`: the one route-handler wrapper (session, roles, JSON, `AppError` → `ApiError`, 500 envelope); `body(request, schema)` |
| `services.ts` | process-wide `modelClient()` (gateway client from env; 503 when unset) and `accessSync()` |

## Affects / depends on
- `http.ts` is used by `middleware.ts` and every `/api` route; changing `apiError` changes every error response.
- `session.ts` depends on `@codehaunt/auth` and `@codehaunt/db`.

## Entry points & how to test
- Covered through `apps/web/test/middleware.test.ts` (error envelope, request IDs).

## Gotchas
- `clientIp` trusts only Cloudflare's header: `x-forwarded-for` is client-controlled. It feeds throttling, never authorization.
- `middleware.ts` imports `./lib/http.ts` by relative path so the tests can load it with plain Node.
