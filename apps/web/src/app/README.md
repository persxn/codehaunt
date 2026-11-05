# app

Next.js route folder – each sub‑folder corresponds to a URL path.

## Contents
| Path | What it does |
|---|---|
| `admin/` | admin console and desk (WP-04; details in `admin/README.md`) |
| `contest/` | participant contest screen (WP-03; details in `contest/README.md`) |
| `projector/` | public projector board (ADR-008, WP-05; `projector/README.md`) |
| `system-check/` | public pre-event system check (SEB, latency, screen) |
| `account/` | change your own password (every role); `?first=1` = choose your own after signing in with the event password (ADR-041) |
| `login/` | login UI |
| `healthz/` | liveness probe (`/healthz`) |
| `readyz/` | readiness probe (`/readyz`) |
| `api/` | backend API routes (auth, etc.) |
| `tokens.css` | design tokens (colours, type, spacing, radius, motion) as CSS custom properties; colours are the public theme's (ADR-032), dark only |
| `globals.css` | base element styles on the design tokens |
| `signal.css` | ADR-043 signal accents, global: glow tokens, focus glow, gradient text, rotating gradient border (`@property --sig-angle`), ambient light, drift, scanlines, RGB split, one-shot glitch, lift, step transition, drawn check, progress bar, skeleton; all static under reduced motion |
| `layout.tsx` | root layout: fonts, tokens, `signal.css`, startup config check, `metadataBase` (`PUBLIC_ORIGIN` or the tunnel hostname) |
| `not-found.tsx` | 404 for unknown paths: the shared card (`components/card-page.module.css`) with the "not found" illustration in an arch, Creepster title, link home (ADR-032) |
| `page.tsx` | public event page (ADR-029/031): composes the `_landing/` sections in the public theme; signed-in users are redirected to their area |
| `_public/` | the public theme shared by `/` and `/login`: tokens, icons, event facts (`_public/README.md`) |
| `_landing/` | event page sections, demo, countdown, artwork (`_landing/README.md`) |
| `icon.png` | app icon (hooded skull), served at `/icon.png` (public) |
| `opengraph-image.jpg` | link-preview image, served at `/opengraph-image.jpg` (public); absolute via `metadataBase` in `layout.tsx` |

## Affects / depends on
- Depends on `@codehaunt/auth` for session middleware and policy enforcement.
- API routes use `@codehaunt/db` Prisma client.

## Entry points & how to test
- Access via browser at http://127.0.0.1:3100 (dev server).
- Tests in `apps/web/test/routes.test.ts` cover each route.

## Gotchas
- `/projector/<token>` is public: the token is the key; it shows rank, name, solved only.
- `middleware.ts` denies all routes unless listed in `packages/auth/src/policy.ts` (`ROUTE_POLICY`).
