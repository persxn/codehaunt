# docker-proxy/test
Tests for the Docker socket proxy.

## Contents
| Path | What it does |
|---|---|
| `policy.test.ts` | allowed and refused calls, fixed query strings, template rebuild drops privileged/bind/host fields, image allowlist, ownership expiry |
| `proxy.test.ts` | real daemon: a C submission judged AC through the proxy; a privileged host-mounting create comes out sandboxed; foreign containers untouchable; CLI refusals |

## Affects / depends on
- `proxy.test.ts` imports the worker's `DockerCodeRunner` and needs the host socket plus runner images (`make runners`).

## Entry points & how to test
`npm test -w @codehaunt/docker-proxy`.

## Gotchas
- `proxy.test.ts` skips when `/var/run/docker.sock` is missing (e.g. the audit sandbox); run it on the host.
