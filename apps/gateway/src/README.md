# gateway/src
The gateway process: config, routing, health, HTTP server, metrics.

## Contents
| Path | What it does |
|---|---|
| `main.ts` | loads config (exit 1 naming the bad key), wires router + health + server, graceful SIGTERM |
| `config.ts` | `loadConfig(env)`: validates every `GATEWAY_*` variable; `ConfigError` |
| `router.ts` | `Router`: least-outstanding requests, soft session affinity, slot cap, bounded FIFO queue, drain (ADR-004) |
| `health.ts` | `HealthChecker`: probes `<node>/health`, drains after N failures, `markDown` on connection errors |
| `server.ts` | HTTP server: token auth, `GatewayChatRequest` validation, tokenize → cap → stream (re-encoded, merged per window), retry before first token, request log |
| `metrics.ts` | Prometheus text registry (`createMetrics`): requests by outcome, retries, tokens, TTFT histogram, node gauges |

## Affects / depends on
- Used by: `main.ts` only; tests import the modules directly.
- Depends on: `@codehaunt/contracts`, Node built-ins, the vLLM API of each node.
- Changing `server.ts` caps or auth changes what the DGX can spend (ADR-022): re-run `test/server.test.ts`.

## Entry points & how to test
`createGateway(deps)`, `Router`, `HealthChecker`, `loadConfig`, `createMetrics`. Test: `npm test -w @codehaunt/gateway`.

## Gotchas
- `router.release` must run exactly once per `acquire` (the server does it in `finally`).
- Nodes start drained; `/readyz` is 503 until a probe passes.
- Token comparison hashes both sides and uses `timingSafeEqual`.
