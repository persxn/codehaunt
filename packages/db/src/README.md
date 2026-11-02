# src

Database client source files.

## Contents
| Path | What it does |
|---|---|
| `client.ts` | Instantiates Prisma client (singleton) |
| `index.ts` | Re‑exports client and helper utilities |
| `testing.ts` | Test helpers, including `expectDbError` for PGlite connection‑drop behavior |

## Affects / depends on
- Depends on generated Prisma client (`@prisma/client`).
- Used by all services (`apps/web`, `apps/worker`) for DB access.

## Gotchas
- `testing.ts` includes `expectDbError` because PGlite's socket server drops the connection after any error raised through Prisma.
