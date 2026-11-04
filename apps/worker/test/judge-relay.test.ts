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

before(async () => {
  upstream = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    req.resume();
    req.on('end', () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ message: { content: '{"ok":true}' }, prompt_eval_count: 100 })));
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
  assert.equal(await call('POST', '/api/chat', '{}'), 200);
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
