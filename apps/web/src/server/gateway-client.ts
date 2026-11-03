/**
 * The web API's client for the inference gateway (ADR-004, ADR-022, WP-02 hand-off). Security-critical: Claude-owned.
 *
 * Calls gateway-a; retries gateway-b only when gateway-a can't be reached or Traefik answers a non-JSON 502/503/504
 * (gateway-a is down), never after the first streamed byte. Parses the compact SSE stream: content deltas, one
 * `usage` chunk, `[DONE]`. A stream without `usage` is a failure: the caller releases the reservation and discards
 * the text. It reads to the end; nothing here aborts a stream because the participant left.
 */
import { GatewayError, GatewayUsage, type GatewayChatRequest, type GatewayErrorCode } from '@codehaunt/contracts';

export type GatewayOutcome =
  | { ok: true; text: string; usage: GatewayUsage; node: string | null }
  | { ok: false; code: GatewayErrorCode | 'unreachable' | 'stream_failed'; partial: string };

export interface ModelClient {
  chat(request: GatewayChatRequest, requestId: string, onDelta: (text: string) => void): Promise<GatewayOutcome>;
}

export interface GatewayClientOptions {
  primaryUrl: string;
  fallbackUrl?: string | undefined;
  token: string;
  fetch?: typeof fetch;
  /** No byte for this long (headers or body) ends the call as a failure. */
  idleTimeoutMs?: number;
}

const RETRY_STATUSES = new Set([502, 503, 504]);

export class GatewayClient implements ModelClient {
  private readonly urls: string[];
  private readonly options: GatewayClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GatewayClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetch ?? fetch;
    this.urls = [options.primaryUrl, options.fallbackUrl]
      .filter((u): u is string => !!u)
      .map((u) => `${u.replace(/\/+$/, '')}/v1/chat/completions`);
  }

  async chat(request: GatewayChatRequest, requestId: string, onDelta: (text: string) => void): Promise<GatewayOutcome> {
    for (let i = 0; i < this.urls.length; i++) {
      const last = i === this.urls.length - 1;
      const idle = new IdleTimer(this.options.idleTimeoutMs ?? 60_000);
      let response: Response;
      try {
        response = await this.fetchImpl(this.urls[i]!, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.options.token}`,
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify(request),
          signal: idle.signal,
        });
      } catch {
        idle.stop();
        // Retry only a connection failure; a timeout means gateway-a may still be working on it (audit run-9).
        if (last || idle.signal.aborted) return { ok: false, code: 'unreachable', partial: '' };
        continue;
      }
      const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
      if (!response.ok) {
        const body = isJson ? GatewayError.safeParse(await response.json().catch(() => null)) : null;
        idle.stop();
        if (body?.success) return { ok: false, code: body.data.error.code, partial: '' };
        await response.body?.cancel().catch(() => {});
        if (!last && RETRY_STATUSES.has(response.status)) continue;
        return { ok: false, code: 'unreachable', partial: '' };
      }
      try {
        return await readStream(response, idle, onDelta);
      } finally {
        idle.stop();
      }
    }
    return { ok: false, code: 'unreachable', partial: '' };
  }
}

async function readStream(response: Response, idle: IdleTimer, onDelta: (text: string) => void): Promise<GatewayOutcome> {
  const node = response.headers.get('x-codehaunt-node');
  let text = '';
  let usage: GatewayUsage | null = null;
  let done = false;
  let buffer = '';
  const decoder = new TextDecoder();
  try {
    const reader = response.body!.getReader();
    while (!done) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      idle.touch();
      buffer += decoder.decode(value, { stream: true });
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            done = true;
            break;
          }
          let chunk: { choices?: Array<{ delta?: { content?: unknown } }>; usage?: unknown };
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            text += delta;
            onDelta(delta);
          }
          if (chunk.usage) {
            const parsed = GatewayUsage.safeParse(chunk.usage);
            if (parsed.success) usage = parsed.data;
          }
        }
      }
    }
    if (done) await reader.cancel().catch(() => {});
  } catch {
    return { ok: false, code: 'stream_failed', partial: text };
  }
  return usage ? { ok: true, text, usage, node } : { ok: false, code: 'stream_failed', partial: text };
}

/** Aborts the request when no byte arrived for `ms`; each received chunk resets it. */
class IdleTimer {
  private readonly controller = new AbortController();
  private timer: NodeJS.Timeout;
  private readonly ms: number;
  readonly signal = this.controller.signal;
  constructor(ms: number) {
    this.ms = ms;
    this.timer = setTimeout(() => this.controller.abort(), ms);
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.controller.abort(), this.ms);
  }
  stop() {
    clearTimeout(this.timer);
  }
}
