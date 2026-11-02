# db

Database layer – Prisma client, schema, and migrations.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile.migrate` | one-shot image that runs `prisma migrate deploy` (compose service `migrate`) |
| `package.json` | Workspace package for the DB layer |
| `prisma/` | Prisma schema and migration files |
| `prisma.config.ts` | Prisma configuration (generator, datasource) |
| `src/` | client factory, PGlite test harness (`src/README.md`); the generated Prisma client is gitignored |
| `test/` | Integration tests for DB models |
| `tsconfig.json` | TypeScript config for the DB package |

## Affects / depends on
- Depends on PostgreSQL (runtime) and `@prisma/client`.
- Changing schema requires a new migration and regeneration of the client.

## Entry points & how to test
- `npm run migrate:deploy -w @codehaunt/db` applies migrations.
- `npm test -w @codehaunt/db` runs DB tests (`ledger.test.ts`).

## Gotchas
- Migrations are forward‑only; the init migration adds triggers that make `audit_log` and `token_ledger` append‑only. Deleting rows is prohibited – anonymise instead.
- `testing.ts` provides `expectDbError` because PGlite drops the connection after any Prisma error.
