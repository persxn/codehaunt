# test

Tests for the worker: the sandbox runner (Docker) and the judge queue (PGlite).

## Contents
| Path | What it does |
|---|---|
| `code-runner.test.ts` | `CodeRunner` acceptance: hello world in C/C++/Java/Python, WA, CE, TLE, and no network (TCP/UDP) from inside the sandbox |
| `judge-review.test.ts` | batch judge (WP-07) on PGlite with a scripted model: input has no hidden test, no name, filtered replies; valid reply → per-problem + overall reviews + DONE; repair turn; NEEDS_MANUAL after 3 bad replies; injection hints OR-ed; queue claim/drain/stuck sweep; reply parsing; drafts stored, refused once locked |
| `queue.test.ts` | judge queue on PGlite with a fake runner: tests per kind, multiplier, verdict rows, retry then FAILED, stuck-run sweep, calibration, loop, IE re-check once + incidents, proxy-refusal incidents |

## Affects / depends on
- Requires the vendored judge Docker images to be built (`make runners`).
- Depends on Docker daemon availability.

## Entry points & how to test
- Run `npm test -w @codehaunt/worker`.

## Gotchas
- `code-runner.test.ts` fails if the runner images are missing or the host Docker socket is inaccessible (they use it directly,
  not through `docker-proxy`; the proxy has its own end-to-end test).
