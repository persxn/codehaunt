# app

Next.js route folder – each sub‑folder corresponds to a URL path.

## Contents
| Path | What it does |
|---|---|
| `admin/` | admin console and desk (WP-04; details in `admin/README.md`) |
| `contest/` | participant contest screen (WP-03; details in `contest/README.md`) |
| `system-check/` | public pre-event system check (SEB, latency, screen) |
| `account/` | change your own password (every role) |
| `login/` | login UI |
| `healthz/` | liveness probe (`/healthz`) |
| `readyz/` | readiness probe (`/readyz`) |
| `api/` | backend API routes (auth, etc.) |
| `tokens.css` | design tokens (colours, type, spacing, radius, motion) as CSS custom properties; dark default, `[data-theme="light"]` |
| `globals.css` | base element styles on the design tokens |
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
