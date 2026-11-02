# sandbox

Sandbox runner implementation that executes untrusted participant code.

## Contents
| Path | What it does |
|---|---|
| `code-runner.ts` | `CodeRunner` interface and `DockerCodeRunner`: validates `RunRequest`, runs the vendored judge (Docker backend only), returns `RunResult`; `missingImages()` for readiness |

## Affects / depends on
- Depends on the vendored `@cjudge/judge` (Docker backend) and a Docker endpoint: `docker-proxy` in compose
  (`DOCKER_HOST`), the host socket in local tests.
- Changing this file changes all verdicts produced by the platform.

## Entry points & how to test
- Created once in `apps/worker/src/main.ts` (readiness today; job consumers from WP-03/07).
- Tested by `apps/worker/test/code-runner.test.ts`.

## Gotchas
- `DockerCodeRunner` divides out the judge's `TIME_MULTIPLIER` so the event's per‑language multiplier applies.
- It does NOT strip anything: callers must drop `outputExcerpt` for hidden tests before any participant‑facing output.
- The only way generated code executes. Never construct the vendored `LocalBackend` (no filesystem isolation).
