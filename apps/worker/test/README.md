# test

Tests for the worker sandbox runner.

## Contents
| Path | What it does |
|---|---|
| `code-runner.test.ts` | `CodeRunner` acceptance: hello world in C/C++/Java/Python, WA, CE, TLE, and no network (TCP/UDP) from inside the sandbox |

## Affects / depends on
- Requires the vendored judge Docker images to be built (`make runners`).
- Depends on Docker daemon availability.

## Entry points & how to test
- Run `npm test -w @codehaunt/worker`.

## Gotchas
- Tests will fail if the runner images are missing or the host Docker socket is inaccessible.
