/**
 * GatewayClient (ADR-022, WP-02 hand-off) against a fake fetch: compact SSE parsing, usage required, gateway-b only
 * when gateway-a can't be reached or Traefik answers a non-JSON 502/503/504, never after a timeout or a JSON error.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GatewayClient } from '../src/server/gateway-client.ts';

const request = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  max_tokens: 10,
  temperature: 0.2,
  codehaunt: { budgetTokens: 100, contextLimit: 1000, sessionId: 's' },
};

function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
      c.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'x-codehaunt-node': 'model-1' } });
}

const usage = 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n';

function client(responses: Array<Response | Error | 'hang'>, idleTimeoutMs = 50) {
  const urls: string[] = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    const next = responses.shift()!;
    if (next === 'hang') {
      return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    }
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { urls, gw: new GatewayClient({ primaryUrl: 'http://a/', fallbackUrl: 'http://b', token: 't'.repeat(40), fetch: fake, idleTimeoutMs }) };
}

test('parses split SSE chunks into deltas and exact usage', async () => {
  const { gw, urls } = client([sse(['data: {"choices":[{"delta":{"content":"He"}}]}\n', '\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\n', usage, 'data: [DONE]\n\n'])]);
  const deltas: string[] = [];
  const out = await gw.chat(request, 'r', (d) => deltas.push(d));
  assert.deepEqual(deltas, ['He', 'llo']);
  assert.deepEqual(out, { ok: true, text: 'Hello', node: 'model-1', usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } });
  assert.deepEqual(urls, ['http://a/v1/chat/completions']);
});

test('a stream without usage is a failure that keeps the partial text', async () => {
  const { gw } = client([sse(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: [DONE]\n\n'])]);
  assert.deepEqual(await gw.chat(request, 'r', () => {}), { ok: false, code: 'stream_failed', partial: 'x' });
});

test('gateway-b only when gateway-a is unreachable or Traefik answers 502/503/504 as text', async () => {
  for (const first of [new Error('ECONNREFUSED'), new Response('no available server', { status: 503 })]) {
    const { gw, urls } = client([first, sse([usage, 'data: [DONE]\n\n'])]);
    assert.equal((await gw.chat(request, 'r', () => {})).ok, true);
    assert.deepEqual(urls, ['http://a/v1/chat/completions', 'http://b/v1/chat/completions']);
  }
});

test('a gateway JSON error is final; a timeout on gateway-a is not retried on gateway-b', async () => {
  const json = new Response(JSON.stringify({ error: { code: 'context_exceeded', message: 'm' }, requestId: 'r' }), { status: 400, headers: { 'content-type': 'application/json' } });
  const a = client([json]);
  assert.deepEqual(await a.gw.chat(request, 'r', () => {}), { ok: false, code: 'context_exceeded', partial: '' });
  assert.equal(a.urls.length, 1);
  const b = client(['hang']);
  assert.deepEqual(await b.gw.chat(request, 'r', () => {}), { ok: false, code: 'unreachable', partial: '' });
  assert.equal(b.urls.length, 1);
});
