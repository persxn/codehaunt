# test

Database integration tests.

## Contents
| Path | What it does |
|---|---|
| `ledger.test.ts` | Tests token ledger behavior and audit log constraints |

## Affects / depends on
- Requires an in‑memory PGlite instance (used by CI) and the migration history applied.
- Depends on `@codehaunt/db` client utilities.

## Entry points & how to test
- Run `npm test -w @codehaunt/db`.

## Gotchas
- Tests rely on the append‑only triggers from the init migration; they verify that UPDATE/DELETE on `audit_log`/`token_ledger` raise errors.
