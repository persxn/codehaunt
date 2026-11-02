# judge (vendored)
`@cjudge/judge` from JojoCode @ a8f4056: compiles and runs untrusted code in a Docker sandbox and turns raw runs into
verdicts. Vendored unmodified (see `/VENDORED.md`); one README here covers all sub-folders. Upstream design notes: `UPSTREAM.md`.

## Contents
| Path | What it does |
|---|---|
| `src/` | judge orchestration, comparator, backends (Docker = production), `runner/runner.py` (in-sandbox) |
| `test/` | upstream tests (adversarial, languages, pipeline, …); need Docker + runner images |
| `docker/` | runner Dockerfiles (C, C++, Java, Python) and `build.sh` → `codehaunt-runner*:1` |
| `scripts/` | `copy-runner.mjs` (upstream build step) |
| `package.json` | workspace manifest (`@cjudge/judge`, no runtime deps) |
| `tsconfig.json` | upstream compiler settings |
| `LICENSE` | MIT notice from JojoCode (must ship with the code) |
| `UPSTREAM.md` | upstream package doc (`judge.md`), unchanged |

## Affects / depends on
- Used by: `apps/worker/src/sandbox/code-runner.ts` only. Nothing else may import it.
- Depends on: Docker CLI on the host; images built by `docker/build.sh`.
- Changing anything here affects every verdict. Don't; extend from `code-runner.ts` and record it in `/VENDORED.md`.

## Entry points & how to test
`judge(backend, request)`, `DockerBackend`. Build images: `bash packages/judge/docker/build.sh`.
Tests: `npm test -w @cjudge/judge` (upstream suite), plus `npm test -w @codehaunt/worker` for the CodeHaunt wrapper.

## Gotchas
- Expected outputs never enter the sandbox; `runner.py` receives inputs only.
- Container flags: `--network=none`, memory = swap cap, `--pids-limit`, `--cpus`, `--read-only`, `--cap-drop=ALL`,
  `no-new-privileges`, uid 65534. Never use `LocalBackend` (no filesystem isolation).
