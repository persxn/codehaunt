# src

Database client source files.

## Contents
| Path | What it does |
|---|---|
| `client.ts` | `createPrismaClient` (pg driver adapter) and the process-wide `getPrismaClient` |
| `index.ts` | Re‑exports client and helper utilities |
| `app-role.ts` | `TABLE_ACCESS` (per-table access none/read/append/update/write for `codehaunt_web` and `codehaunt_worker`) and the SQL that applies it; neither role is superuser or owner; ledgers append-only (`@codehaunt/db/app-role`) |
| `token-ledger.ts` | token budget (ADR-022): `reserveTokens` (participant row lock, never overdraws, releases stale reservations), `settleTokens` (charge used, release rest; idempotent), `adjustTokens`/`adjustTokensIn` (staff grants, top-ups, clamped decreases; inside a caller's transaction too), `tokenBalance`, `BudgetExhausted` |
| `testing.ts` | test databases: PGlite (`createTestDatabase`), throwaway real Postgres (`createPostgresTestDatabase`), `expectDbError` |

## Affects / depends on
- Depends on generated Prisma client (`@prisma/client`).
- Used by all services (`apps/web`, `apps/worker`) for DB access.

## Gotchas
- Token ledger invariant: every writer of a negative delta (`reserveTokens` now, any admin ADJUSTMENT later) must take
  the participant row lock (`SELECT … FOR UPDATE` on `participants`) and check the balance first, or "the balance
  never goes negative" no longer holds.
- `testing.ts` includes `expectDbError` because PGlite's socket server drops the connection after any error raised through Prisma.
