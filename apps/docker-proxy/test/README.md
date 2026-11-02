# docker-proxy/test
Tests for the Docker socket proxy.

## Contents
| Path | What it does |
|---|---|
| `policy.test.ts` | allowed and refused calls, fixed query strings, template rebuild drops privileged/bind/host fields, image allowlist, ownership expiry |
| `smuggle.test.ts` | fake daemon with dockerd's keep-alive-after-400 behaviour: nothing is forwarded behind a refused upgrade; after 101 extra bytes are stdin; malformed requests don't crash it (no Docker needed) |
| `proxy.test.ts` | real daemon: a C submission judged AC through the proxy; a privileged host-mounting create comes out sandboxed; foreign containers untouchable; version-smuggled create never runs; CLI refusals |

## Affects / depends on
- `proxy.test.ts` imports the worker's `DockerCodeRunner` and needs the host socket plus runner images (`make runners`).

## Entry points & how to test
`npm test -w @codehaunt/docker-proxy`.

## Gotchas
- `proxy.test.ts` skips when `/var/run/docker.sock` is missing (e.g. the audit sandbox); run it on the host.
