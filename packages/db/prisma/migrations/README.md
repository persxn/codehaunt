# migrations

Database migration history.

## Contents
| Path | What it does |
|---|---|
| `migration_lock.toml` | records the database provider (postgresql); managed by Prisma |
| `20261102120953_init/` | Initial migration – creates tables and adds triggers for append‑only audit_log and token_ledger |
| `20261102210000_token_reservations/` | adds `RESERVE` and `RELEASE` to `TokenEntryKind` (ADR-022) |

## Affects / depends on
- Applied in order by `prisma migrate deploy`.
- New migrations must be forward‑only; rollback is not supported.

## Entry points & how to test
`make migrate` (`prisma migrate deploy`). Every migration is applied to PGlite by `npm test -w @codehaunt/db`.

## Gotchas
- The init migration appends triggers that raise errors on UPDATE/DELETE/TRUNCATE for `audit_log` and `token_ledger`. Retention must anonymise users/participants rather than delete rows.
- Migrations are generated with `prisma migrate dev --create-only` then reviewed before committing.
