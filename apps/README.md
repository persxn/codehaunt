# apps

The three runnable CodeHaunt services.

## Contents
| Path | What it does |
|---|---|
| `web/` | Next.js app: participant UI, admin console, `/api/*` |
| `worker/` | background jobs; runs untrusted code only through `CodeRunner` (Docker sandbox) |
| `docker-proxy/` | filtering proxy: the only service holding the host Docker socket (ADR-019) |

## Affects / depends on
- All three are built and run by `docker-compose.yml` (profile `core`).
- worker → docker-proxy → host Docker: changing either side of that link changes what code can do on the DGX.

## Entry points & how to test
`npm test -w @codehaunt/<web|worker|docker-proxy>`.

## Gotchas
- The worker has no Docker socket and no route out of Docker's internal networks; give it neither.
