# scripts
Repository tooling: README enforcement, test wrappers, dev seed and CI entry point.

## Contents
| Path | What it does |
|---|---|
| `check-readmes.mjs` | fails if a folder lacks `README.md` or its Contents table is out of sync (standards §6) |
| `check-readmes.test.mjs` | tests for the checker (temp trees, no git needed) |
| `test-judge.mjs` | runs the vendored judge suite on `codehaunt-runner*` images; skips 2 arch-specific tests on arm64 |
| `seed.ts` | seeds a demo event, admin and participants for dev; idempotent; random password unless `SEED_PASSWORD` is set |
| `judge-golden.ts` | WP-07 task 7: 10 golden tutor-mode transcripts (3 honest, 3 integrity cases, 4 injection attempts) through the real judge (GPT-OSS in Ollama); checks schema, injection flags and score order; prints time per transcript. Never during the event |
| `ci.sh` | CI entry point: `npm ci`, README check, typecheck, all tests; starts Postgres for the concurrency tests |
| `create-staff.ts` | `[claude]` creates one staff account (default ADMIN) in the database `.env` points at and prints a one-time 16-character password once; the person changes it at `/account` (WP-10) |
| `set-staff-password.ts` | `[claude]` sets a staff account's password from `NEW_PASSWORD` (same rules as `/account`), ends its sessions, audit-logged (WP-10) |
| `test-accounts.ts` | `[claude]` attaches named test accounts (`sebtest…`/`test-…`) to an existing `test-`/`sebtest-` event, checked in, with the shared password from `TEST_ACCOUNT_PASSWORD` (ADR-040); idempotent; re-run per test event |
| `seed-test-event.ts` | creates a repeatable test event with configurable participants (0–60) and length (`--minutes`, 10–1440); for pre‑event checks |
| `delete-test-event.ts` | `[claude]` removes a test event (`test-`/`sebtest-`/`e2e-`/`ui-` slug, ≤ 60 participants) and all it created: dry run by default, `--yes` deletes in one transaction (append-only triggers off only inside it), participant accounts of that event only, their own audit rows; leaves one `event.test_deleted` audit row |

## Affects / depends on
- Used by: `make check-readmes`, `make test`, `make ci`, root `npm test`.
- Depends on: git (file list honours `.gitignore`), Node 22, Docker + runner images for `test-judge.mjs`, `.env`
  for `ci.sh`'s Postgres (`TEST_POSTGRES_URL` = the owner `DATABASE_URL`; tests create and drop their own databases).
- Changing `EXEMPT_SEGMENTS` / `SINGLE_README_ROOTS` changes which folders must be documented.

## Entry points & how to test
`node scripts/check-readmes.mjs [root]` · `node --test scripts/check-readmes.test.mjs` · `node scripts/test-judge.mjs`.

## Gotchas
- Untracked files count (only gitignored ones don't), so a new file fails the check until its README row exists.
- `seed.ts` refuses the old published default password; with `SEED_PASSWORD` unset it prints a generated one once.
- `test-judge.mjs` forces `CJUDGE_RUNNER_IMAGE=codehaunt-runner:1` unless set: never test against another product's images.
- `seed-test-event.ts` writes into the database `.env` points at (the live one on the DGX): only `test-` slugs; remove with `delete-test-event.ts` (needs the owner `DATABASE_URL`; staff accounts made by tests stay, remove them on the Staff page)
