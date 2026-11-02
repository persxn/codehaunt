# docker-proxy
Filtering proxy between the worker and the host Docker socket (ADR-019, audit F1). Security-critical: Claude-owned.
A compromised worker can at most start sandbox containers: no network, read-only, no capabilities, our runner images.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile` | image with Node and `src/` only (no npm packages) |
| `package.json` | `@codehaunt/docker-proxy`; no dependencies on purpose |
| `src/` | policy (what is allowed) and the HTTP/upgrade server (`src/README.md`) |
| `test/` | policy unit tests and tests against the real daemon (`test/README.md`) |
| `tsconfig.json` | extends the root base config |

## Affects / depends on
- Used by: `apps/worker` via `DOCKER_HOST=tcp://docker-proxy:2375` on the internal `sandbox` network.
- Depends on: `/var/run/docker.sock` (mounted only here), the runner images (`RUNNER_IMAGE` and its `-cpp/-java/-python` siblings).
- Must change together with `packages/judge/src/backends/docker.ts`: if the vendored judge's `docker run` flags or API
  calls change, the template here must follow or runs fail with a 403.

## Entry points & how to test
`npm start -w @codehaunt/docker-proxy` (env `PROXY_PORT`, `PROXY_HOST`, `RUNNER_IMAGE`, `DOCKER_SOCKET`) ·
`npm test -w @codehaunt/docker-proxy` (daemon tests skip without a socket).

## Gotchas
- Allowed: `_ping`, image inspect (runner images only), container create, and attach/wait/start/kill on containers it
  created. Everything else gets 403 with `codehaunt docker-proxy: <reason>` and a JSON log line.
- A create is rebuilt from the sandbox template, not validated field by field: unknown fields are dropped, so
  `--privileged` or `-v /:/host` produce an ordinary sandbox, not an error.
- Responses flush headers immediately: `docker run` waits for `/wait`'s headers before it starts the container.
- Attach (HTTP upgrade): nothing from the client is forwarded until the daemon answers 101; any other answer ends both
  connections with 502. The client's API version is never forwarded (re-audit N1: the daemon keeps a connection open
  after a 400 for an unsupported version, which allowed a smuggled second request).
- Caps: 32 live sandboxes and 24 GiB of sandbox memory in total (2 GiB each), 256 connections, a 64 KiB create body.
  A create reserves its slot before it goes upstream. A sandbox whose `wait` is abandoned (the judge killed an
  overrunning run, or the worker restarted) is force-removed at once; any sandbox older than 40 minutes (above the
  judge's worst case, ~36) is removed by the proxy itself. Refused upgrades are closed fully; a half-closed attach
  stream is ended after 10 minutes. Malformed requests are refused, never crash the process.
