# db

Database layer – Prisma client, schema, and migrations.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile.migrate` | one-shot image: `prisma migrate deploy`, then `scripts/provision-app-role.ts` (compose service `migrate`) |
| `package.json` | Workspace package for the DB layer |
| `prisma/` | Prisma schema and migration files |
| `prisma.config.ts` | Prisma configuration (generator, datasource) |
| `scripts/` | deploy-time scripts run by `migrate` (`scripts/README.md`) |
| `src/` | client factory, app-role SQL, test databases (`src/README.md`); the generated Prisma client is gitignored |
| `test/` | ledger triggers and app-role permission tests (PGlite) |
| `tsconfig.json` | TypeScript config for the DB package |

## Affects / depends on
- Depends on PostgreSQL (runtime) and `@prisma/client`.
- Changing schema requires a new migration and regeneration of the client.
- Roles: only `migrate` holds the owner (`POSTGRES_USER`). web logs in as `codehaunt_web` (`WEB_DB_PASSWORD`), worker
  as `codehaunt_worker` (`WORKER_DB_PASSWORD`). Every table is classified in `TABLE_ACCESS` (`src/app-role.ts`):
  an unclassified table gets no grants and `test/app-role.test.ts` fails until you add it.

## Entry points & how to test
- `npm run migrate:deploy -w @codehaunt/db` applies migrations.
- `npm run provision-app-role -w @codehaunt/db` (re)creates both roles (needs owner `DATABASE_URL`, `WEB_DB_PASSWORD`,
  `WORKER_DB_PASSWORD`).
- `npm test -w @codehaunt/db` runs DB tests.

## Gotchas
- Migrations are forward‑only; the init migration adds triggers that make `audit_log` and `token_ledger` append‑only. Deleting rows is prohibited – anonymise instead.
- `testing.ts` provides `expectDbError` because PGlite drops the connection after any Prisma error.
- PGlite serves one connection at a time: concurrency bugs only show on real Postgres (`createPostgresTestDatabase`).
