# src

Database client source files.

## Contents
| Path | What it does |
|---|---|
| `client.ts` | `createPrismaClient` (pg driver adapter) and the process-wide `getPrismaClient` |
| `index.ts` | Re‑exports client and helper utilities |
| `app-role.ts` | `TABLE_ACCESS` (per-table access for `codehaunt_web` and `codehaunt_worker`) and the SQL that applies it; neither role is superuser or owner; ledgers append-only (`@codehaunt/db/app-role`) |
| `testing.ts` | test databases: PGlite (`createTestDatabase`), throwaway real Postgres (`createPostgresTestDatabase`), `expectDbError` |

## Affects / depends on
- Depends on generated Prisma client (`@prisma/client`).
- Used by all services (`apps/web`, `apps/worker`) for DB access.

## Gotchas
- `testing.ts` includes `expectDbError` because PGlite's socket server drops the connection after any error raised through Prisma.
