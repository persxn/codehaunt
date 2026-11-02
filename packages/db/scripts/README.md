# db/scripts
Deploy-time scripts for the database. Run as the owner, never by web or worker.

## Contents
| Path | What it does |
|---|---|
| `provision-app-role.ts` | creates/updates `codehaunt_web` and `codehaunt_worker`, re-applies their grants and drops the old shared role, in one transaction (audit F2, N5) |

## Affects / depends on
- Run by the compose `migrate` service after `prisma migrate deploy`; web/worker cannot log in until it has run.
- Depends on `src/app-role.ts` (the SQL) and env `DATABASE_URL` (owner), `WEB_DB_PASSWORD`, `WORKER_DB_PASSWORD`.

## Entry points & how to test
`npm run provision-app-role -w @codehaunt/db` · tested through `test/app-role.test.ts`.

## Gotchas
- Idempotent: safe on every deploy. Changing either password takes effect on the next `migrate` run.
