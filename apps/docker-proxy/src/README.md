# docker-proxy/src
Implementation of the Docker socket proxy.

## Contents
| Path | What it does |
|---|---|
| `policy.ts` | pure rules: route parsing (never throws), fixed unversioned upstream paths, runner-image allowlist, create-body template, owned-container registry with count/memory/CPU caps, reservations (released if unanswered) and overdue list |
| `server.ts` | HTTP server: refuses, rebuilds, forwards over a fresh unix-socket connection per request; `attach` upgrade forwarded only after the daemon's 101; removes abandoned and overdue sandboxes |
| `main.ts` | reads env and listens (default `0.0.0.0:2375`) |

## Affects / depends on
- `server.ts` depends on `policy.ts`; tests import both. Node built-ins only.

## Entry points & how to test
`createProxy({ socketPath, runnerImage })` · `npm test -w @codehaunt/docker-proxy`.

## Gotchas
- Owned containers are remembered in memory; a proxy restart forgets them, so runs in flight at that moment fail (the
  judge reports IE, re-checked once per ADR-021) instead of leaking access.
