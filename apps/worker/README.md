# worker

Background service. Runs untrusted participant code only through `CodeRunner`, which drives the vendored judge's
Docker backend. Since ADR-019 it has no Docker socket: it talks to `apps/docker-proxy` over the internal network.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile` | worker image: Node, the app, and the Docker CLI binary (no daemon, no socket) |
| `package.json` | workspace package for the worker |
| `src/` | config, main entry (health server), sandbox runner (`src/README.md`) |
| `test/` | `CodeRunner` tests against the real runner images |
| `tsconfig.json` | TypeScript config for the worker workspace |

## Affects / depends on
- Depends on the vendored `@cjudge/judge` (`packages/judge/`) and, in compose, on `docker-proxy` via
  `DOCKER_HOST=tcp://docker-proxy:2375`. Locally (tests) it uses the host socket directly.
- Changing the runner logic affects all code execution verdicts.

## Entry points & how to test
- `npm start -w @codehaunt/worker` – start the worker (health on `WORKER_HEALTH_HOST:WORKER_HEALTH_PORT`).
- `npm test -w @codehaunt/worker` – runs `test/code-runner.test.ts` (needs Docker + `make runners`).

## Gotchas
- `CodeRunner` is the only path by which generated code executes; `DockerCodeRunner` divides out the judge's `TIME_MULTIPLIER`.
- `RunResult.outputExcerpt` and `internalError` can carry participant-controlled text (an echoed hidden input, or a
  forged runner reply: verified, it yields IE, never AC). Never show `RunResult` to participants as is (WP-03).
- In compose: read-only filesystem, all capabilities dropped, only the internal `db` and `sandbox` networks (no
  internet, no tailnet), DB login `codehaunt_app`. `node_modules` is root-owned so it cannot be modified at runtime.
