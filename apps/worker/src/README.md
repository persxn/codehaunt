# src

Source code for the worker service.

## Contents
| Path | What it does |
|---|---|
| `config.ts` | validates `DATABASE_URL`, `RUNNER_IMAGE`, `WORKER_HEALTH_HOST/PORT` at startup (Docker endpoint comes from `DOCKER_HOST`) |
| `main.ts` | Service entry point – listens for jobs, invokes sandbox runner |
| `sandbox/` | Contains the `CodeRunner` implementation that wraps the vendored judge |

## Affects / depends on
- Depends on `@cjudge/judge` (vendored) and Docker daemon.
- Changing `main.ts` alters job handling flow.

## Entry points & how to test
- Imported by the worker Docker image entrypoint.
- Unit tests target `sandbox/code-runner.ts`.
