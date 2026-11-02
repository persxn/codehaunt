# web

Next.js application serving the participant UI and admin console.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile` | container image for production |
| `next.config.mjs` | Next.js configuration |
| `next-env.d.ts` | TypeScript env declarations |
| `package.json` | workspace package for the web app |
| `src/` | source code (pages, API routes, lib) |
| `test/` | access-control tests: policy per route and the real middleware (no server, no DB) |
| `tsconfig.json` | TypeScript config for the web workspace |

## Affects / depends on
- Used by: developers running the UI (`npm run dev -w @codehaunt/web`).
- Depends on: `@codehaunt/auth` for session handling, `@codehaunt/db` for data access (the web app never runs code; sample runs and judging go through the worker).
- Changing middleware affects every route (deny‑by‑default policy).

## Entry points & how to test
- `npm run dev -w @codehaunt/web` – start dev server on http://127.0.0.1:3100.
- `npm test -w @codehaunt/web` – runs `test/routes.test.ts` and `test/middleware.test.ts`.

## Gotchas
- `middleware.ts` denies all routes by default; any new route must be added to `packages/auth/src/policy.ts` (`ROUTE_POLICY`).
- Tests fail if a public route is missing from the allow‑list.
- `postcss` is a dev dependency only to pin the patched version Next would otherwise get (root `overrides`; NV3).
- In compose it connects as `codehaunt_web` (not the owner) and runs read-only with `.next/cache` on tmpfs (2 GiB, 256 processes max).
- An empty `COOKIE_SECURE` (what compose passes when it is unset) means unset: Secure cookies in production.
