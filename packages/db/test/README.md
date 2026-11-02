# test

Database integration tests.

## Contents
| Path | What it does |
|---|---|
| `ledger.test.ts` | `audit_log`/`token_ledger` refuse UPDATE, DELETE and TRUNCATE (triggers); budget = sum of deltas |
| `app-role.test.ts` | `codehaunt_app` can insert/read ledgers but not delete, update, truncate or disable triggers; no migration table |

## Affects / depends on
- Requires an in‑memory PGlite instance (used by CI) and the migration history applied.
- Depends on `@codehaunt/db` client utilities.

## Entry points & how to test
- Run `npm test -w @codehaunt/db`.

## Gotchas
- Tests rely on the append‑only triggers from the init migration; they verify that UPDATE/DELETE on `audit_log`/`token_ledger` raise errors.
