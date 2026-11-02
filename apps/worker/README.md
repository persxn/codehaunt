# worker

Docker sandbox runner wrapper – executes untrusted participant code via the vendored judge.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile` | Image for the worker service (includes runner binaries) |
| `package.json` | Workspace package for the worker |
| `src/` | Source code (config, main entry, sandbox runner) |
| `test/` | Tests for the sandbox runner |
| `tsconfig.json` | TypeScript config for the worker workspace |

## Affects / depends on
- Depends on the vendored `@cjudge/judge` package (see `packages/judge/`).
- Uses Docker on the host to spin up sandbox containers.
- Changing the runner logic affects all code execution verdicts.

## Entry points & how to test
- `npm run dev -w @codehaunt/worker` – start the worker service.
- `npm test -w @codehaunt/worker` – runs `apps/worker/test/code-runner.test.ts`.

## Gotchas
- `CodeRunner` is the only safe way to run generated code; `DockerCodeRunner` adjusts the judge's `TIME_MULTIPLIER`.
- Hidden‑test `outputExcerpt` must be stripped before presenting to participants.
