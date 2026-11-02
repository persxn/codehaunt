/**
 * Gateway config from the environment, validated once at startup (standards §2). An invalid value
 * throws ConfigError naming the key; main.ts exits non-zero with it.
 */

export class ConfigError extends Error {
  readonly key: string;
  constructor(key: string, reason: string) {
    super(`${key}: ${reason}`);
    this.key = key;
  }
}

export interface ModelNode {
  name: string;
  /** Base URL of the node's OpenAI-compatible model server (vLLM), without `/v1`. */
  url: string;
}

export interface GatewayConfig {
  host: string;
  port: number;
  /** Shared bearer token; only the DGX web API holds it. */
  token: string;
  model: string;
  nodes: ModelNode[];
  slotsPerNode: number;
  queueMax: number;
  queueTimeoutMs: number;
  healthIntervalMs: number;
  healthFailThreshold: number;
  /** Time a node gets to send the first byte of a reply before the gateway tries another node. */
  firstByteTimeoutMs: number;
  /** Longest silence allowed between two chunks of a streaming reply. */
  idleTimeoutMs: number;
  maxAttempts: number;
  /** Reply tokens are merged into one SSE chunk per window of this many ms (0 = one chunk per upstream chunk). */
  streamFlushMs: number;
  /** Passed to the model server as `chat_template_kwargs` (e.g. `{"enable_thinking":false}`). */
  chatTemplateKwargs: Record<string, unknown> | undefined;
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(key, `must be an integer in [${min}, ${max}]`);
  return n;
}

function parseNodes(raw: string | undefined): ModelNode[] {
  if (!raw) throw new ConfigError('GATEWAY_NODES', 'required, e.g. "gpu-master=http://10.0.0.1:8000,gpu-worker-1=http://…"');
  const nodes = raw.split(',').map((part) => {
    const eq = part.indexOf('=');
    const name = part.slice(0, eq).trim();
    const url = part.slice(eq + 1).trim().replace(/\/+$/, '');
    if (eq <= 0 || !/^[a-z0-9-]{1,63}$/.test(name)) throw new ConfigError('GATEWAY_NODES', `bad node name in "${part}"`);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ConfigError('GATEWAY_NODES', `bad URL for ${name}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new ConfigError('GATEWAY_NODES', `${name}: http(s) only`);
    return { name, url };
  });
  if (new Set(nodes.map((n) => n.name)).size !== nodes.length) throw new ConfigError('GATEWAY_NODES', 'duplicate node name');
  return nodes;
}

export function loadConfig(env: Env): GatewayConfig {
  const token = env.GATEWAY_TOKEN ?? '';
  if (token.length < 32) throw new ConfigError('GATEWAY_TOKEN', 'required, at least 32 characters (openssl rand -hex 32)');
  const model = env.GATEWAY_MODEL ?? '';
  if (!model) throw new ConfigError('GATEWAY_MODEL', 'required: the served model name');
  let chatTemplateKwargs: Record<string, unknown> | undefined;
  if (env.GATEWAY_CHAT_TEMPLATE_KWARGS) {
    try {
      chatTemplateKwargs = JSON.parse(env.GATEWAY_CHAT_TEMPLATE_KWARGS);
    } catch {
      throw new ConfigError('GATEWAY_CHAT_TEMPLATE_KWARGS', 'must be a JSON object');
    }
    if (typeof chatTemplateKwargs !== 'object' || chatTemplateKwargs === null || Array.isArray(chatTemplateKwargs)) {
      throw new ConfigError('GATEWAY_CHAT_TEMPLATE_KWARGS', 'must be a JSON object');
    }
  }
  return {
    host: env.GATEWAY_HOST || '0.0.0.0',
    port: int(env, 'GATEWAY_PORT', 8080, 1, 65535),
    token,
    model,
    nodes: parseNodes(env.GATEWAY_NODES),
    slotsPerNode: int(env, 'GATEWAY_SLOTS_PER_NODE', 12, 1, 256),
    queueMax: int(env, 'GATEWAY_QUEUE_MAX', 100, 0, 10_000),
    queueTimeoutMs: int(env, 'GATEWAY_QUEUE_TIMEOUT_MS', 30_000, 100, 600_000),
    healthIntervalMs: int(env, 'GATEWAY_HEALTH_INTERVAL_MS', 2_000, 100, 60_000),
    healthFailThreshold: int(env, 'GATEWAY_HEALTH_FAIL_THRESHOLD', 2, 1, 20),
    firstByteTimeoutMs: int(env, 'GATEWAY_FIRST_BYTE_TIMEOUT_MS', 60_000, 1_000, 600_000),
    idleTimeoutMs: int(env, 'GATEWAY_IDLE_TIMEOUT_MS', 10_000, 1_000, 600_000),
    maxAttempts: int(env, 'GATEWAY_MAX_ATTEMPTS', 3, 1, 10),
    streamFlushMs: int(env, 'GATEWAY_STREAM_FLUSH_MS', 100, 0, 2_000),
    chatTemplateKwargs,
  };
}
