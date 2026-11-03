# src

Source code for the worker service.

## Contents
| Path | What it does |
|---|---|
| `config.ts` | validates `DATABASE_URL`, `RUNNER_IMAGE`, `WORKER_HEALTH_HOST/PORT`, `JUDGE_CONCURRENCY` (1–16, default 8) at startup (Docker endpoint comes from `DOCKER_HOST`) |
| `main.ts` | entry point: health endpoints and the judge loop; on SIGTERM finishes runs in progress |
| `sandbox/` | Contains the `CodeRunner` implementation that wraps the vendored judge |
| `queue.ts` | judge queue (ADR-025): `claim` (SKIP LOCKED), `judgeSubmission` (SAMPLE visible / SUBMIT all tests), `runCalibration`, `requeueStuck` (45 min), retry after a failure only after `RETRY_DELAY_MS`, `judgeLoop` (≤ `JUDGE_CONCURRENCY`); a submit's first IE is re-checked once (`firstInternalError`), the second is the verdict + a `JUDGE_IE` incident; an IE carrying `PROXY_REFUSAL_MARKER` opens a `PROXY_REFUSAL` incident (ADR-021/028) |

## Affects / depends on
- Depends on `@cjudge/judge` (vendored) and Docker daemon.
- Changing `main.ts` alters job handling flow.
- `queue.ts` reads `submissions`, `calibration_runs`, `test_cases` (hidden included: the only judging path) and writes verdicts and incidents.
- Incident `detail.internalError` can hold participant-controlled output: staff-only, plain text (the web's incident service).

## Entry points & how to test
- Imported by the worker Docker image entrypoint.
- Unit tests target `sandbox/code-runner.ts`.
