# gateway/load
Load generator for the gateway (WP-02 acceptance: 40 concurrent sessions; WP-08 full load test).

## Contents
| Path | What it does |
|---|---|
| `load.ts` | N concurrent synthetic sessions × T turns with growing chat history; prints JSON (ok, errors by code, TTFT p50/p95, aggregate tokens/s) |

## Affects / depends on
- Depends on: a running gateway (`GATEWAY_URL`, `GATEWAY_TOKEN`); Node 22 built-ins only.
- Costs GPU time on the cluster: never run during the event.

## Entry points & how to test
`GATEWAY_URL=http://… GATEWAY_TOKEN=… node --experimental-strip-types apps/gateway/load/load.ts --sessions 40 --turns 3`
(flags: `--max-tokens`, `--budget`, `--context`, `--ramp-ms`). Exit 1 if any request failed.

## Gotchas
Never prints the token. Sessions use ids `load-<i>`, so affinity spreads them like real participants.
