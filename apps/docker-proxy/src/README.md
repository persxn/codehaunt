# docker-proxy/src
Implementation of the Docker socket proxy.

## Contents
| Path | What it does |
|---|---|
| `policy.ts` | pure rules: route parsing, fixed upstream paths, runner-image allowlist, create-body template, owned-container registry |
| `server.ts` | HTTP server: refuses, rebuilds, forwards over the unix socket; hijacked `attach` via HTTP upgrade |
| `main.ts` | reads env and listens (default `0.0.0.0:2375`) |

## Affects / depends on
- `server.ts` depends on `policy.ts`; tests import both. Node built-ins only.

## Entry points & how to test
`createProxy({ socketPath, runnerImage })` · `npm test -w @codehaunt/docker-proxy`.

## Gotchas
- Owned containers are remembered in memory for 30 minutes; a proxy restart forgets them, so runs in flight at that
  moment fail (the judge reports IE) instead of leaking access.
