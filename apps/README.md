# apps

The runnable CodeHaunt services: three on the DGX, the gateway on the GPU cluster.

## Contents
| Path | What it does |
|---|---|
| `web/` | Next.js app: participant UI, admin console, `/api/*` |
| `worker/` | background jobs; runs untrusted code only through `CodeRunner` (Docker sandbox) |
| `docker-proxy/` | filtering proxy: the only service holding the host Docker socket (ADR-019) |
| `gateway/` | inference gateway on the k3s GPU cluster: routing, per-request token caps, metrics (ADR-004/022) |

## Affects / depends on
- web, worker and docker-proxy are built and run by `docker-compose.yml` (profile `core`); the gateway runs on the
  GPU cluster from `deploy/gpu-cluster/`.
- worker → docker-proxy → host Docker: changing either side of that link changes what code can do on the DGX.

## Entry points & how to test
`npm test -w @codehaunt/<web|worker|docker-proxy|gateway>`.

## Gotchas
- The worker has no Docker socket and no route out of Docker's internal networks; give it neither.
