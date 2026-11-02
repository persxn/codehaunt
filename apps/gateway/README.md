# gateway
Inference gateway in front of the model servers on the GPU cluster (ADR-004, ADR-016, ADR-022). The DGX web API is its
only client. Routes each chat request to the least-busy healthy node, enforces the per-request token caps the DGX
reserved, and streams the reply back with exact token usage. Security-critical (auth, caps): Claude-owned.

## Contents
| Path | What it does |
|---|---|
| `Dockerfile` | image with Node, `src/` and `@codehaunt/contracts` (+ zod); builds amd64 on an arm64 host without emulation |
| `package.json` | `@codehaunt/gateway`; depends on `@codehaunt/contracts` only |
| `tsconfig.json` | extends the root base config |
| `src/` | config, router, health checks, HTTP server, metrics (`src/README.md`) |
| `test/` | router, server (against fake model nodes) and metrics tests (`test/README.md`) |
| `load/` | load generator: N concurrent synthetic sessions against a running gateway (`load/README.md`) |

## Affects / depends on
- Used by: the DGX web API's model client (WP-03), through Traefik on gpu-master's tailnet IP (`deploy/gpu-cluster/`).
- Depends on: the model servers' vLLM API (`/health`, `/tokenize`, `/v1/chat/completions`), `@codehaunt/contracts`
  (`GatewayChatRequest`, `GatewayError`), env vars below.
- Changing the request/response shape changes `packages/contracts/src/gateway.ts` and the web's model client together.

## Entry points & how to test
`npm start -w @codehaunt/gateway` · `npm test -w @codehaunt/gateway` (no GPU needed) ·
load: `GATEWAY_URL=… GATEWAY_TOKEN=… node --experimental-strip-types apps/gateway/load/load.ts --sessions 40`.

| Env | Default | Meaning |
|---|---|---|
| `GATEWAY_TOKEN` | required | shared bearer token (≥32 chars); only the DGX holds it |
| `GATEWAY_MODEL` | required | served model name sent to every node |
| `GATEWAY_NODES` | required | `name=http://host:port,…` model servers |
| `GATEWAY_CHAT_TEMPLATE_KWARGS` | unset | JSON passed to vLLM as `chat_template_kwargs`, e.g. `{"enable_thinking":false}` |
| `GATEWAY_HOST` / `GATEWAY_PORT` | `0.0.0.0` / `8080` | listen address |
| `GATEWAY_SLOTS_PER_NODE` | 12 | concurrent requests per node before queueing |
| `GATEWAY_QUEUE_MAX` / `GATEWAY_QUEUE_TIMEOUT_MS` | 100 / 30000 | FIFO queue when all slots are busy |
| `GATEWAY_HEALTH_INTERVAL_MS` / `GATEWAY_HEALTH_FAIL_THRESHOLD` | 2000 / 2 | node drained after N failed probes (≈4 s) |
| `GATEWAY_FIRST_BYTE_TIMEOUT_MS` / `GATEWAY_IDLE_TIMEOUT_MS` | 60000 / 10000 | node gets this long for its first byte / between chunks |
| `GATEWAY_STREAM_FLUSH_MS` | 100 | reply tokens merged into one SSE chunk per window (first token sent at once) |
| `GATEWAY_MAX_ATTEMPTS` | 3 | nodes tried per request, only before the first byte reaches the client |

## Gotchas
- The gateway keeps **no balance** (ADR-022). The DGX reserves `budgetTokens` in `token_ledger` and settles after the
  reply; a reply without a final `usage` chunk (node failed mid-stream) must be released in full by the DGX.
- Refusals happen before generation: the prompt is counted by the node's `/tokenize` (CPU only), then
  `max_tokens = min(requested, budgetTokens − prompt, contextLimit − prompt)`.
- The client cannot choose the model or any sampling field beyond `temperature` (`GatewayChatRequest` is strict).
- Retries happen only while nothing has reached the client; after that a failure ends the stream.
- The reply is re-encoded, not passed through: compact OpenAI chunks (`choices[0].delta.content`, `finish_reason`),
  merged per 100 ms, then a `usage` chunk and `[DONE]`. vLLM's ~200 bytes per token would saturate the ~0.5 MB/s
  DERP relay to the DGX at full load (load test 2026-11-02: client TTFT max 22 s while the gateway's was 124 ms).
- vLLM keeps a connection open after SIGTERM, so a reply cut by a node restart ends after the 10 s idle timeout.
- A client disconnect aborts generation on the node, freeing its slot.
- `/metrics`, `/healthz`, `/readyz` are unauthenticated; Traefik routes only `/v1/` from outside the pod.
