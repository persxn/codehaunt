/**
 * The gateway against fake model nodes (vLLM's /health, /tokenize and streaming chat API).
 * Covers the WP-02 criteria that don't need GPUs: auth, budget/context refusal before
 * generation, reply capping, retry before the first byte, drain on failure, mid-stream failure.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, test } from 'node:test';

import { loadConfig } from '../src/config.ts';
import { HealthChecker } from '../src/health.ts';
import { Router } from '../src/router.ts';
import { createGateway, type GatewayMetrics, type RequestLog } from '../src/server.ts';

const TOKEN = 'x'.repeat(40);

interface FakeNode {
  url: string;
  server: http.Server;
  chats: Array<{ max_tokens: number; model: string }>;
  mode: 'ok' | 'fail500' | 'cut' | 'slow';
}

/** Tokenizer stand-in: one token per whitespace-separated word across all messages. */
const countWords = (messages: Array<{ content: string }>) =>
  messages.reduce((n, m) => n + m.content.split(/\s+/).filter(Boolean).length, 0);

async function fakeNode(mode: FakeNode['mode'] = 'ok'): Promise<FakeNode> {
  const node = { chats: [], mode } as unknown as FakeNode;
  node.server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/health') return res.end('ok');
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === '/tokenize') return res.end(JSON.stringify({ count: countWords(body.messages) }));
      if (req.url !== '/v1/chat/completions') return res.writeHead(404).end();
      node.chats.push(body);
      if (node.mode === 'fail500') return res.writeHead(500).end('boom');
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hello' } }] })}\n\n`);
      if (node.mode === 'cut') return void setTimeout(() => res.destroy(), 100);
      if (node.mode === 'slow') return; // never finishes
      const prompt = countWords(body.messages);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: 1, total_tokens: prompt + 1 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((r) => node.server.listen(0, '127.0.0.1', r));
  node.url = `http://127.0.0.1:${(node.server.address() as AddressInfo).port}`;
  return node;
}

const noMetrics: GatewayMetrics = { request() {}, ttft() {}, tokens() {}, retry() {}, render: () => '' };
const cleanup: Array<() => void> = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});

async function gateway(nodes: FakeNode[], env: Record<string, string> = {}) {
  const config = loadConfig({
    GATEWAY_TOKEN: TOKEN,
    GATEWAY_MODEL: 'junior',
    GATEWAY_NODES: nodes.map((n, i) => `n${i}=${n.url}`).join(','),
    GATEWAY_HEALTH_INTERVAL_MS: '100',
    GATEWAY_FIRST_BYTE_TIMEOUT_MS: '2000',
    GATEWAY_IDLE_TIMEOUT_MS: '1000',
    ...env,
  });
  const router = new Router(config.nodes.map((n) => n.name), config.slotsPerNode, config.queueMax, config.queueTimeoutMs);
  const health = new HealthChecker(router, config.nodes, { intervalMs: config.healthIntervalMs, failThreshold: config.healthFailThreshold });
  await health.tick();
  const logs: RequestLog[] = [];
  const server = createGateway({ config, router, health, metrics: noMetrics, log: (e) => logs.push(e) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  cleanup.push(() => {
    server.close();
    server.closeAllConnections();
    for (const n of nodes) {
      n.server.close();
      n.server.closeAllConnections(); // a stalled fake reply would keep the test process alive
    }
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, router, health, logs };
}

function chat(text: string, caps: Partial<{ budgetTokens: number; contextLimit: number }> = {}, maxTokens = 500) {
  return {
    messages: [{ role: 'user', content: text }],
    max_tokens: maxTokens,
    codehaunt: { budgetTokens: 1000, contextLimit: 8192, sessionId: 's1', ...caps },
  };
}

function post(url: string, body: unknown, token: string | null = TOKEN) {
  return fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token !== null && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
}

test('a request without the DGX token is rejected and never reaches a node', async () => {
  const node = await fakeNode();
  const gw = await gateway([node]);
  for (const token of [null, 'wrong', `${TOKEN}x`]) {
    const res = await post(gw.url, chat('hi'), token);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'unauthorized');
  }
  assert.equal(node.chats.length, 0);
});

test('streams the reply, forces the model name and caps max_tokens to the reservation', async () => {
  const node = await fakeNode();
  const gw = await gateway([node]);
  const res = await post(gw.url, chat('one two three four', { budgetTokens: 10 }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-codehaunt-node'), 'n0');
  const text = await res.text();
  assert.match(text, /"usage"/);
  assert.match(text, /\[DONE\]/);
  assert.deepEqual(node.chats.map((c) => [c.model, c.max_tokens]), [['junior', 6]]);
  assert.equal(gw.logs[0]!.outcome, 'ok');
  assert.equal(gw.logs[0]!.promptTokens, 4);
  assert.equal(gw.logs[0]!.completionTokens, 1);
});

test('a prompt that does not fit the reservation or the context is refused before generation', async () => {
  const node = await fakeNode();
  const gw = await gateway([node]);
  let res = await post(gw.url, chat('one two three', { budgetTokens: 3 }));
  assert.equal(res.status, 402);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'budget_exceeded');
  res = await post(gw.url, chat('a b c d e f g h i j', { contextLimit: 256 }));
  assert.equal(res.status, 200); // 10 words fit
  await res.text();
  res = await post(gw.url, chat(Array(300).fill('w').join(' '), { contextLimit: 256, budgetTokens: 5000 }));
  assert.equal(res.status, 413);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'context_exceeded');
  assert.equal(node.chats.length, 1);
});

test('a model field or unknown field is rejected', async () => {
  const gw = await gateway([await fakeNode()]);
  const res = await post(gw.url, { ...chat('hi'), model: 'something-else' });
  assert.equal(res.status, 400);
});

test('a node that fails before the first byte is retried on another node', async () => {
  const bad = await fakeNode('fail500');
  const good = await fakeNode();
  const gw = await gateway([bad, good]);
  for (let i = 0; i < 4; i++) {
    const res = await post(gw.url, { ...chat('hi'), codehaunt: { ...chat('hi').codehaunt, sessionId: `s${i}` } });
    assert.equal(res.status, 200);
    await res.text();
  }
  assert.equal(good.chats.length, 4);
  assert.ok(gw.logs.some((l) => l.attempts === 2));
});

test('an unreachable node is drained at once and requests go elsewhere', async () => {
  const down = await fakeNode();
  const up = await fakeNode();
  const gw = await gateway([down, up]);
  down.server.close();
  down.server.closeAllConnections();
  for (let i = 0; i < 3; i++) {
    const res = await post(gw.url, chat('hi'));
    assert.equal(res.status, 200);
    await res.text();
  }
  assert.equal(gw.router.nodes.get('n0')!.healthy, false);
  assert.equal(up.chats.length, 3);
});

test('a stopped node is drained by the health checker well within 10 s', async () => {
  const a = await fakeNode();
  const b = await fakeNode();
  const gw = await gateway([a, b]);
  gw.health.start();
  cleanup.push(() => gw.health.stop());
  a.server.close();
  a.server.closeAllConnections();
  const t0 = Date.now();
  while (gw.router.nodes.get('n0')!.healthy) {
    assert.ok(Date.now() - t0 < 10_000, 'not drained within 10 s');
    await new Promise((r) => setTimeout(r, 20));
  }
});

test('a node failing mid-stream ends the reply without usage (the DGX then releases the reservation)', async () => {
  const gw = await gateway([await fakeNode('cut')]);
  const res = await post(gw.url, chat('hi'));
  assert.equal(res.status, 200);
  const text = await res.text().catch(() => '');
  assert.doesNotMatch(text, /"usage"/);
  assert.equal(gw.logs[0]!.outcome, 'upstream_failed');
});

test('a node that goes silent mid-stream is cut off after the idle timeout', async () => {
  const gw = await gateway([await fakeNode('slow')]);
  const res = await post(gw.url, chat('hi'));
  await res.text().catch(() => '');
  assert.equal(gw.logs[0]!.outcome, 'upstream_failed');
  assert.equal(gw.router.nodes.get('n0')!.inflight, 0);
});

test('when every node is down the gateway says so', async () => {
  const a = await fakeNode();
  const gw = await gateway([a]);
  gw.router.setHealthy('n0', false);
  const res = await post(gw.url, chat('hi'));
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'no_healthy_node');
  const ready = await fetch(`${gw.url}/readyz`);
  assert.equal(ready.status, 503);
});

test('reply tokens are merged into few compact chunks; content and usage survive', async () => {
  const node = await fakeNode();
  // 40 one-word deltas, sent in one burst: they must arrive as far fewer chunks.
  node.server.removeAllListeners('request');
  node.server.on('request', (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/health') return res.end('ok');
      if (req.url === '/tokenize') return res.end(JSON.stringify({ count: 3 }));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: { role: 'assistant', content: '' } }] })}\n\n`);
      for (let i = 0; i < 40; i++) res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: `w${i} ` }, logprobs: null, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'x', choices: [], usage: { prompt_tokens: 3, completion_tokens: 40, total_tokens: 43 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  const gw = await gateway([node], { GATEWAY_STREAM_FLUSH_MS: '1000' });
  const res = await post(gw.url, chat('hi'));
  const events = (await res.text()).split('\n\n').filter((e) => e.startsWith('data: '));
  const content = events.filter((e) => e.startsWith('data: {')).map((e) => JSON.parse(e.slice(6)))
    .map((c) => c.choices[0]?.delta?.content ?? '').join('');
  assert.equal(content, Array.from({ length: 40 }, (_, i) => `w${i} `).join(''));
  assert.ok(events.length <= 5, `expected merged chunks, got ${events.length}`);
  assert.match(events.at(-2)!, /"usage"/);
  assert.equal(events.at(-1), 'data: [DONE]');
  assert.equal(gw.logs[0]!.completionTokens, 40);
});

/** A node whose chat reply is produced by `reply(res)`; tokenize counts 3. */
async function scriptedNode(reply: (res: http.ServerResponse) => void): Promise<FakeNode> {
  const node = await fakeNode();
  node.server.removeAllListeners('request');
  node.server.on('request', (req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url === '/health') return res.end('ok');
      if (req.url === '/tokenize') return res.end(JSON.stringify({ count: 3 }));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      reply(res);
    });
  });
  return node;
}
const delta = (t: string) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: t }, finish_reason: null }] })}\n\n`;
const usageChunk = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 9, total_tokens: 12 } })}\n\n`;

test('a healthy reply streaming longer than the first-byte timeout is not cut (audit H1)', async () => {
  const node = await scriptedNode((res) => {
    let i = 0;
    const t = setInterval(() => {
      res.write(delta(`t${i} `));
      if (++i === 9) {
        clearInterval(t);
        res.write(usageChunk);
        res.end('data: [DONE]\n\n');
      }
    }, 200); // 1.8 s in total, timeout 1 s
  });
  const gw = await gateway([node], { GATEWAY_FIRST_BYTE_TIMEOUT_MS: '1000', GATEWAY_IDLE_TIMEOUT_MS: '1000' });
  const res = await post(gw.url, chat('hi'));
  assert.match(await res.text(), /"usage"/);
  assert.equal(gw.logs[0]!.outcome, 'ok');
});

test('a client that disconnects under backpressure frees the slot and is logged (audit H2)', async () => {
  const node = await scriptedNode((res) => {
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'A'.repeat(4 * 1024 * 1024) }, finish_reason: 'stop' }] })}\n\n`);
    res.write(usageChunk);
    res.end('data: [DONE]\n\n');
  });
  const gw = await gateway([node]);
  const body = JSON.stringify(chat('hi'));
  const socket = net.connect(Number(new URL(gw.url).port), '127.0.0.1');
  socket.write(`POST /v1/chat/completions HTTP/1.1\r\nhost: x\r\nauthorization: Bearer ${TOKEN}\r\n`
    + `content-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  socket.pause(); // never read: the gateway's writes back up
  await new Promise((r) => setTimeout(r, 1500));
  socket.destroy();
  const t0 = Date.now();
  while (gw.logs.length === 0) {
    assert.ok(Date.now() - t0 < 3000, 'request never finished');
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(gw.router.nodes.get('n0')!.inflight, 0);
  assert.equal(gw.logs[0]!.outcome, 'client_closed'); // not counted as a node failure (run-6 N2)
});

test('a node that sends tokenize headers and then stalls is abandoned (audit run-6 N1)', async () => {
  const stall = await fakeNode();
  stall.server.removeAllListeners('request');
  stall.server.on('request', (req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url === '/health') return res.end('ok');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"count":'); // never finished
    });
  });
  const good = await fakeNode();
  const gw = await gateway([stall, good], { GATEWAY_FIRST_BYTE_TIMEOUT_MS: '1000' });
  gw.router.setHealthy('n1', false); // force the first attempt onto the stalling node
  setTimeout(() => gw.router.setHealthy('n1', true), 100);
  const res = await post(gw.url, chat('hi'));
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(gw.logs[0]!.attempts, 2);
  assert.equal(gw.router.nodes.get('n0')!.healthy, false);
});

test('a client that leaves while queued is logged client_closed, not gateway_busy (audit run-7 R7-3)', async () => {
  const node = await scriptedNode(() => {}); // never answers: holds the only slot
  const gw = await gateway([node], { GATEWAY_SLOTS_PER_NODE: '1' });
  const first = post(gw.url, chat('hi')).catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
  const gone = new AbortController();
  const queued = fetch(`${gw.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(chat('hi')),
    signal: gone.signal,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 100));
  gone.abort();
  await queued;
  const t0 = Date.now();
  while (!gw.logs.some((l) => l.outcome === 'client_closed')) {
    assert.ok(Date.now() - t0 < 3000, `no client_closed log: ${JSON.stringify(gw.logs)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(!gw.logs.some((l) => l.outcome === 'gateway_busy'));
  void first;
});

test('a client leaving during a slow tokenize does not drain the node (audit run-7 R7-1)', async () => {
  const slow = await fakeNode();
  slow.server.removeAllListeners('request');
  slow.server.on('request', (req, res) => {
    req.resume();
    req.on('end', () => {
      if (req.url === '/health') return res.end('ok');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"count":'); // body still coming
    });
  });
  const gw = await gateway([slow], { GATEWAY_FIRST_BYTE_TIMEOUT_MS: '5000' });
  const gone = new AbortController();
  const req = fetch(`${gw.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(chat('hi')),
    signal: gone.signal,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 200));
  gone.abort();
  await req;
  const t0 = Date.now();
  while (gw.logs.length === 0) {
    assert.ok(Date.now() - t0 < 3000, 'request never finished');
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(gw.logs[0]!.outcome, 'client_closed');
  assert.equal(gw.router.nodes.get('n0')!.healthy, true);
});

test('an unauthenticated request is answered and closed without reading its body (audit run-6 L2)', async () => {
  const gw = await gateway([await fakeNode()]);
  const socket = net.connect(Number(new URL(gw.url).port), '127.0.0.1');
  let reply = '';
  socket.on('data', (c) => (reply += c));
  const closed = new Promise<void>((r) => socket.on('close', () => r()));
  socket.write('POST /v1/chat/completions HTTP/1.1\r\nhost: x\r\ncontent-length: 100000\r\n\r\n{'); // body never completes
  const t0 = Date.now();
  await closed;
  assert.ok(Date.now() - t0 < 2000);
  assert.match(reply, /401/);
});

test('a prompt exactly at the context limit is context_exceeded (audit L5)', async () => {
  const gw = await gateway([await fakeNode()]);
  const res = await post(gw.url, chat(Array(256).fill('w').join(' '), { contextLimit: 256, budgetTokens: 5000 }));
  assert.equal(res.status, 413);
});
