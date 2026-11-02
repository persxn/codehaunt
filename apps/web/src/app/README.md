# app

Next.js route folder – each sub‑folder corresponds to a URL path.

## Contents
| Path | What it does |
|---|---|
| `admin/` | admin console page |
| `contest/` | contest landing page |
| `login/` | login UI |
| `healthz/` | liveness probe (`/healthz`) |
| `readyz/` | readiness probe (`/readyz`) |
| `api/` | backend API routes (auth, etc.) |
| `globals.css` | global stylesheet |
| `layout.tsx` | root layout component |
| `page.tsx` | root page component |

## Affects / depends on
- Depends on `@codehaunt/auth` for session middleware and policy enforcement.
- API routes use `@codehaunt/db` Prisma client.

## Entry points & how to test
- Access via browser at http://127.0.0.1:3100 (dev server).
- Tests in `apps/web/test/routes.test.ts` cover each route.

## Gotchas
- `middleware.ts` denies all routes unless listed in `packages/auth/src/policy.ts` (`ROUTE_POLICY`).
