# scripts
Repository tooling: README enforcement, test wrappers, dev seed and CI entry point.

## Contents
| Path | What it does |
|---|---|
| `check-readmes.mjs` | fails if a folder lacks `README.md` or its Contents table is out of sync (standards §6) |
| `check-readmes.test.mjs` | tests for the checker (temp trees, no git needed) |
| `test-judge.mjs` | runs the vendored judge suite on `codehaunt-runner*` images; skips 2 arch-specific tests on arm64 |
| `seed.ts` | seeds a demo event, admin and participants for dev; idempotent |
| `ci.sh` | CI entry point script running lint, tests and typecheck |

## Affects / depends on
- Used by: `make check-readmes`, `make test`, `make ci`, root `npm test`.
- Depends on: git (file list honours `.gitignore`), Node 22, Docker + runner images for `test-judge.mjs`.
- Changing `EXEMPT_SEGMENTS` / `SINGLE_README_ROOTS` changes which folders must be documented.

## Entry points & how to test
`node scripts/check-readmes.mjs [root]` · `node --test scripts/check-readmes.test.mjs` · `node scripts/test-judge.mjs`.

## Gotchas
- Untracked files count (only gitignored ones don't), so a new file fails the check until its README row exists.
- `test-judge.mjs` forces `CJUDGE_RUNNER_IMAGE=codehaunt-runner:1` unless set: never test against another product's images.
