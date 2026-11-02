# gateway/test
Unit and integration tests for the gateway; no GPU needed.

## Contents
| Path | What it does |
|---|---|
| `router.test.ts` | least-busy choice, tie spreading, affinity slack, drain, exclusion, FIFO queue, timeout |
| `server.test.ts` | against fake vLLM nodes: auth, caps and refusals, model forced, retry before first byte, drain on failure/stop, mid-stream failure, idle timeout |
| `metrics.test.ts` | Prometheus output: counters, histogram buckets, gauges from a real `Router` |

## Affects / depends on
- Depends on: `../src/*`; starts local HTTP servers on 127.0.0.1 ephemeral ports.

## Entry points & how to test
`npm test -w @codehaunt/gateway`.

## Gotchas
The fake tokenizer counts whitespace-separated words, so token numbers in tests are word counts.
