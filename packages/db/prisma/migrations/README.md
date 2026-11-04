# migrations

Database migration history.

## Contents
| Path | What it does |
|---|---|
| `migration_lock.toml` | records the database provider (postgresql); managed by Prisma |
| `20261102120953_init/` | Initial migration – creates tables and adds triggers for append‑only audit_log and token_ledger |
| `20261102210000_token_reservations/` | adds `RESERVE` and `RELEASE` to `TokenEntryKind` (ADR-022) |
| `20261103090000_participant_flow/` | WP-03/04: `problems.practice`, `reference_solutions` (per language, REFERENCE/NAIVE; moves the old columns), `calibration_runs`, participant consent columns, queue columns `submissions.attempts/startedAt` (ADR-025) |
| `20261104090000_contest_ops/` | WP-05 (ADR-028): event `pausedAt/pausedMs/frozenAt/projectorTokenHash/resultsState/provisionalAt`, `participants.extraMinutes`, `submissions.contestMs/firstInternalError`, `incidents` |
| `20261105090000_batch_judge/` | WP-07 (ADR-035): `judge_jobs` (batch-judging queue per participant + rubric version), `problem_drafts` (GPT-OSS test / naive-solution drafts, R8-Q6) |

## Affects / depends on
- Applied in order by `prisma migrate deploy`.
- New migrations must be forward‑only; rollback is not supported.

## Entry points & how to test
`make migrate` (`prisma migrate deploy`). Every migration is applied to PGlite by `npm test -w @codehaunt/db`.

## Gotchas
- `20261104090000_contest_ops` gained `events.frozenAt` (audit R13-1) before it was applied anywhere persistent;
  a database that applied the earlier text would need `ALTER TABLE events ADD COLUMN "frozenAt" TIMESTAMP(3)`.
- Rolling back `20261103090000_participant_flow`: re-add `problems."referenceSolution" TEXT` and
  `"referenceLanguage" "Language"`, copy one REFERENCE row per problem back from `reference_solutions`, then drop
  `reference_solutions`, `calibration_runs`, the new columns and the `SolutionKind` type. Applied migrations are
  checksummed by Prisma: put notes here, never in the SQL.
- The init migration appends triggers that raise errors on UPDATE/DELETE/TRUNCATE for `audit_log` and `token_ledger`. Retention must anonymise users/participants rather than delete rows.
- Migrations are generated with `prisma migrate dev --create-only` then reviewed before committing.
