# readyz

Readiness probe endpoint – reports when the app is ready to serve traffic.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | Returns HTTP 200 once DB connection is healthy |

## Affects / depends on
- Checks DB health via `@codehaunt/db` client.

## Entry points & how to test
- `GET /readyz` – should return 200 when migrations applied.
- Tested in route test suite.
