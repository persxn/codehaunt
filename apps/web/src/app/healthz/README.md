# healthz

Liveness probe endpoint used by Kubernetes.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | Returns HTTP 200 when the app is alive |

## Affects / depends on
- No dependencies; simple static response.

## Entry points & how to test
- `GET /healthz` – should return 200 OK.
- Verified by integration tests.
