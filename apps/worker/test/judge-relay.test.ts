/**
 * The judge relay (ADR-035, audit R14-4): forwards only POST /api/chat to Ollama, refuses every other method and path
 * (model pulls, deletes, tags), refuses oversized bodies; the judge client reaches it over the unix socket.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { OllamaJudgeModel } from '../src/judge-review/ollama.ts';

let upstream: Server;
let relay: ChildProcess;
let dir: string;
let socket: string;
const seen: string[] = [];
const bodies: string[] = [];
const cancelled: boolean[] = [];
const chat = (extra: Record<string, unknown> = {}) => JSON.stringify({ model: 'gpt-oss:120b', messages: [{ role: 'user', content: 'hi' }], ...extra });

before(async () => {
  upstream = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      bodies.push(Buffer.concat(chunks).toString());
      if (bodies.at(-1)!.includes('"SLOW"')) {
        // Never answers: the relay must cancel it when the judge leaves.
        res.on('close', () => cancelled.push(true));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ message: { content: '{"ok":true}' } }));
    });
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()));
  const port = (upstream.address() as { port: number }).port;
  dir = mkdtempSync(join(tmpdir(), 'relay-'));
  socket = join(dir, 'ollama.sock');
  relay = spawn(process.execPath, ['--experimental-strip-types', new URL('../src/judge-review/relay.ts', import.meta.url).pathname], {
    env: { ...process.env, JUDGE_RELAY_SOCKET: socket, JUDGE_OLLAMA_URL: `http://127.0.0.1:${port}` },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve) => relay.stdout!.on('data', (d: Buffer) => d.toString().includes('relay ready') && resolve()));
});

after(() => {
  relay?.kill('SIGTERM');
  upstream?.close();
  rmSync(dir, { recursive: true, force: true });
});

function call(method: string, path: string, body = ''): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: socket, path, method, headers: { 'content-length': Buffer.byteLength(body) } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('only POST /api/chat reaches Ollama', async () => {
  for (const [method, path] of [['GET', '/api/tags'], ['POST', '/api/pull'], ['DELETE', '/api/delete'], ['POST', '/api/generate'], ['GET', '/api/chat'], ['POST', '/api/chat/../pull']]) {
    assert.equal(await call(method!, path!, '{}'), 403, `${method} ${path}`);
  }
  assert.equal(seen.length, 0, 'nothing forwarded');
  assert.equal(await call('POST', '/api/chat', chat()), 200);
  assert.deepEqual(seen, ['POST /api/chat']);
});

test('an oversized body is refused before it is forwarded', async () => {
  const before = seen.length;
  const status = await call('POST', '/api/chat', 'x'.repeat(1024 * 1024 + 10)).catch(() => 413);
  assert.equal(status, 413);
  assert.equal(seen.length, before);
});

test('the judge client talks to the relay over the socket', async () => {
  const model = new OllamaJudgeModel({ url: 'http://unused.invalid', socketPath: socket, model: 'gpt-oss:120b' });
  assert.equal(await model.chat([{ role: 'user', content: 'hi' }], {}), '{"ok":true}');
});

test('audit R15-5: only the judge model and fields are forwarded; a request the judge abandons is cancelled upstream', async () => {
  assert.equal(await call('POST', '/api/chat', chat({ model: 'llama3:70b' })), 400, 'another model');
  assert.equal(await call('POST', '/api/chat', 'not json'), 400);
  const n = bodies.length;
  assert.equal(await call('POST', '/api/chat', chat({ keep_alive: -1, options: { num_ctx: 999_999, num_gpu: 0 }, think: 'max' })), 200);
  const sent = JSON.parse(bodies[n]!) as Record<string, unknown>;
  assert.equal(sent.keep_alive, undefined);
  assert.deepEqual(sent.options, { temperature: 0, num_ctx: 32_768 });
  assert.equal(sent.think, 'low');

  const req = request({ socketPath: socket, path: '/api/chat', method: 'POST' });
  req.on('error', () => {});
  req.end(chat({ messages: [{ role: 'user', content: 'SLOW' }] }));
  await new Promise((r) => setTimeout(r, 200));
  req.destroy();
  for (let i = 0; i < 50 && !cancelled.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(cancelled.length, 1, 'the upstream generation was cancelled');
});

