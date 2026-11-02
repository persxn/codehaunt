/**
 * The gateway HTTP server: shared-token auth, request validation, per-request token caps
 * (ADR-022), node routing with retry before the first byte (ADR-004), SSE pass-through.
 *
 * The gateway keeps no balance. It refuses a request whose prompt (counted by the node's own
 * tokenizer, no generation) does not fit the caps the DGX reserved, and caps the reply so
 * prompt + reply <= budgetTokens and <= contextLimit.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import { GatewayChatRequest, type GatewayErrorCode, GatewayUsage } from '@codehaunt/contracts';

import type { GatewayConfig } from './config.ts';
import type { HealthChecker } from './health.ts';
import { Router, RouterError } from './router.ts';

const MAX_BODY_BYTES = 1024 * 1024;
/** A client gets this long to send its whole body (the request head has its own 10 s limit). */
const BODY_TIMEOUT_MS = 10_000;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const STATUS: Record<GatewayErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  budget_exceeded: 402,
  context_exceeded: 413,
  gateway_busy: 503,
  no_healthy_node: 503,
  upstream_failed: 502,
  not_found: 404,
};

/** Implemented by metrics.ts; the server only reports events. */
export interface GatewayMetrics {
  request(outcome: 'ok' | GatewayErrorCode, node: string | undefined): void;
  ttft(node: string, seconds: number): void;
  tokens(prompt: number, completion: number): void;
  retry(node: string): void;
  render(router: Router): string;
}

export interface RequestLog {
  requestId: string;
  sessionId?: string;
  node?: string;
  attempts: number;
  outcome: 'ok' | GatewayErrorCode;
  promptTokens?: number;
  completionTokens?: number;
  ttftMs?: number;
  durationMs: number;
  detail?: string;
}

export interface ServerDeps {
  config: GatewayConfig;
  router: Router;
  health: Pick<HealthChecker, 'markDown'>;
  metrics: GatewayMetrics;
  log?: (entry: RequestLog) => void;
}

class Refusal extends Error {
  readonly code: GatewayErrorCode;
  constructor(code: GatewayErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** A failure on one node before the client saw a byte: worth trying another node. */
class NodeFailure extends Error {}

const digest = (s: string) => createHash('sha256').update(s).digest();

function sendError(res: ServerResponse, code: GatewayErrorCode, message: string, requestId: string): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(STATUS[code], { 'content-type': 'application/json', 'x-request-id': requestId })
    .end(JSON.stringify({ error: { code, message }, requestId }));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      reject(new Refusal('bad_request', 'request body too slow'));
      req.destroy();
    }, BODY_TIMEOUT_MS);
    req.on('close', () => clearTimeout(timer));
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Refusal('bad_request', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function createGateway(deps: ServerDeps): http.Server {
  const { config, router, metrics } = deps;
  const log = deps.log ?? ((e) => console.log(JSON.stringify({ msg: 'request', ...e })));
  const tokenDigest = digest(config.token);

  const authorized = (req: IncomingMessage) => {
    const h = req.headers.authorization ?? '';
    return h.startsWith('Bearer ') && timingSafeEqual(digest(h.slice(7)), tokenDigest);
  };

  const server = http.createServer(async (req, res) => {
    const headerId = req.headers['x-request-id'];
    const requestId = typeof headerId === 'string' && REQUEST_ID.test(headerId) ? headerId : randomUUID();
    const url = req.url ?? '/';

    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (req.method === 'GET' && url === '/readyz') {
      const healthy = router.healthyCount();
      res.writeHead(healthy > 0 ? 200 : 503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ ok: healthy > 0, healthyNodes: healthy }));
      return;
    }
    if (req.method === 'GET' && url === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(metrics.render(router));
      return;
    }
    if (req.method !== 'POST' || url !== '/v1/chat/completions') {
      sendError(res, 'not_found', 'not found', requestId);
      return;
    }
    if (!authorized(req)) {
      metrics.request('unauthorized', undefined);
      sendError(res, 'unauthorized', 'missing or wrong gateway token', requestId);
      req.resume();
      return;
    }
    await handleChat(req, res, requestId);
  });

  async function handleChat(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
    const started = Date.now();
    const entry: RequestLog = { requestId, attempts: 0, outcome: 'ok', durationMs: 0 };
    // Client gone: stop generating, which frees the GPU slot.
    const clientGone = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) clientGone.abort();
    });
    try {
      let body: unknown;
      try {
        body = JSON.parse((await readBody(req)).toString('utf8'));
      } catch (err) {
        throw err instanceof Refusal ? err : new Refusal('bad_request', 'body is not JSON');
      }
      const parsed = GatewayChatRequest.safeParse(body);
      if (!parsed.success) throw new Refusal('bad_request', parsed.error.issues[0]?.message ?? 'invalid request');
      const chat = parsed.data;
      entry.sessionId = chat.codehaunt.sessionId;

      const tried = new Set<string>();
      for (;;) {
        const node = await router.acquire(chat.codehaunt.sessionId, tried, clientGone.signal);
        entry.node = node;
        entry.attempts++;
        tried.add(node);
        try {
          await forward(node, chat, res, entry, started, clientGone.signal);
          return;
        } catch (err) {
          if (!(err instanceof NodeFailure) || res.headersSent || clientGone.signal.aborted) throw err;
          entry.detail = err.message;
          if (entry.attempts >= config.maxAttempts) throw new Refusal('upstream_failed', 'model nodes failed');
          metrics.retry(node);
        } finally {
          router.release(node);
        }
      }
    } catch (err) {
      if (err instanceof Refusal || err instanceof RouterError) {
        entry.outcome = err.code;
        entry.detail ??= err.message;
        sendError(res, err.code, err.message, requestId);
      } else {
        entry.outcome = 'upstream_failed';
        entry.detail = err instanceof Error ? err.message : String(err);
        sendError(res, 'upstream_failed', 'the model node failed', requestId);
      }
    } finally {
      entry.durationMs = Date.now() - started;
      metrics.request(entry.outcome, entry.node);
      log(entry);
    }
  }

  /** One attempt on one node. Throws NodeFailure while nothing has reached the client yet. */
  async function forward(
    node: string,
    chat: GatewayChatRequest,
    res: ServerResponse,
    entry: RequestLog,
    started: number,
    clientGone: AbortSignal,
  ): Promise<void> {
    const base = config.nodes.find((n) => n.name === node)!.url;
    // The timeout covers only the wait for the response to start (audit H1); once a reply streams,
    // the idle timeout between chunks takes over, so long healthy replies are never cut.
    const call = async (path: string, payload: unknown, timeoutMs: number) => {
      const startTimeout = new AbortController();
      const timer = setTimeout(() => startTimeout.abort(new Error(`no response within ${timeoutMs} ms`)), timeoutMs);
      try {
        return await fetch(`${base}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': entry.requestId,
            ...(config.nodeApiKey && { authorization: `Bearer ${config.nodeApiKey}` }),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.any([clientGone, startTimeout.signal]),
        });
      } catch (err) {
        if (clientGone.aborted) throw err;
        deps.health.markDown(node);
        throw new NodeFailure(`${node}${path}: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    };

    // Count the prompt with the node's tokenizer (CPU only, no generation).
    const tok = await call('/tokenize', {
      model: config.model,
      messages: chat.messages,
      add_generation_prompt: true,
      ...(config.chatTemplateKwargs && { chat_template_kwargs: config.chatTemplateKwargs }),
    }, 10_000);
    if (!tok.ok) {
      await tok.body?.cancel();
      throw new NodeFailure(`${node}/tokenize: HTTP ${tok.status}`);
    }
    const count = Number(((await tok.json()) as { count?: unknown }).count);
    if (!Number.isInteger(count) || count < 0) throw new NodeFailure(`${node}/tokenize: no count`);
    entry.promptTokens = count;
    const { budgetTokens, contextLimit } = chat.codehaunt;
    if (count >= contextLimit) throw new Refusal('context_exceeded', `prompt is ${count} tokens; the context limit is ${contextLimit}`);
    const maxTokens = Math.min(chat.max_tokens, budgetTokens - count, contextLimit - count);
    if (maxTokens < 1) throw new Refusal('budget_exceeded', `prompt is ${count} tokens; ${budgetTokens} were reserved`);

    const upstream = await call('/v1/chat/completions', {
      model: config.model,
      messages: chat.messages,
      max_tokens: maxTokens,
      temperature: chat.temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...(config.chatTemplateKwargs && { chat_template_kwargs: config.chatTemplateKwargs }),
    }, config.firstByteTimeoutMs);
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      // A 4xx is our request's fault: another node would refuse it too.
      if (upstream.status >= 400 && upstream.status < 500) throw new Refusal('upstream_failed', `model refused: HTTP ${upstream.status} ${text.slice(0, 200)}`);
      throw new NodeFailure(`${node}: HTTP ${upstream.status}`);
    }

    // The reply is re-encoded as compact OpenAI chunks, merged per flush window: the DGX link is a ~0.5 MB/s relay
    // (ADR-015) and vLLM's ~200-byte chunk per token saturates it at full load (WP-02 load test).
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let first = true;
    let pending = '';
    let text = '';
    let finish: string | null = null;
    let usage: GatewayUsage | undefined;
    let lastFlush = 0;
    // Never wait on a closed response: its 'close' has already fired, so the wait would never end and
    // the node slot would leak (audit H2).
    const send = async (chunk: string) => {
      if (res.destroyed) throw new Error('client closed the connection');
      if (!res.write(chunk) && !res.destroyed) {
        await new Promise((r) => {
          res.once('drain', r);
          res.once('close', r);
        });
      }
      if (res.destroyed) throw new Error('client closed the connection');
    };
    const flush = async () => {
      if (!text && !finish) return;
      const delta = text ? { content: text } : {};
      await send(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      text = '';
      finish = null;
      lastFlush = Date.now();
    };
    for (;;) {
      let idle: NodeJS.Timeout | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          idle = setTimeout(() => reject(new Error('model node went silent')), config.idleTimeoutMs);
        }),
      ]).catch(async (err) => {
        await reader.cancel().catch(() => {});
        if (first && !clientGone.aborted) {
          deps.health.markDown(node);
          throw new NodeFailure(`${node}: ${(err as Error).message}`);
        }
        throw err;
      }).finally(() => clearTimeout(idle));
      if (next.done) break;
      pending += decoder.decode(next.value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('data: {')) continue;
        let chunk: { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>; usage?: GatewayUsage | null };
        try {
          chunk = JSON.parse(line.slice(6));
        } catch {
          continue; // a malformed chunk carries nothing we can forward
        }
        if (chunk.usage) {
          const u = GatewayUsage.safeParse(chunk.usage);
          if (u.success) usage = u.data;
        }
        const choice = chunk.choices?.[0];
        if (typeof choice?.delta?.content === 'string') text += choice.delta.content;
        if (typeof choice?.finish_reason === 'string') finish = choice.finish_reason;
      }
      if (!text && !finish) continue;
      if (first) {
        first = false;
        entry.ttftMs = Date.now() - started;
        metrics.ttft(node, entry.ttftMs / 1000);
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-request-id': entry.requestId,
          'x-codehaunt-node': node,
        });
      }
      // The first token goes out at once (time to first token); later ones are merged per window.
      if (lastFlush === 0 || finish || Date.now() - lastFlush >= config.streamFlushMs) await flush();
    }
    if (first) throw new NodeFailure(`${node}: empty reply`);
    await flush();
    if (usage) await send(`data: ${JSON.stringify({ choices: [], usage })}\n\n`);
    res.end('data: [DONE]\n\n');
    if (usage) {
      entry.promptTokens = usage.prompt_tokens;
      entry.completionTokens = usage.completion_tokens;
      metrics.tokens(usage.prompt_tokens, usage.completion_tokens);
    }
  }

  server.headersTimeout = 10_000;
  server.requestTimeout = 0; // streaming replies may run for minutes
  return server;
}
