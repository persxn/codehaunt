/**
 * The proxy against the real Docker daemon. Skipped where there is no socket (the audit sandbox).
 * Needs the runner images (make runners).
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { promisify } from 'node:util';

import { DockerCodeRunner } from '../../worker/src/sandbox/code-runner.ts';
import { createProxy } from '../src/server.ts';

const SOCKET = '/var/run/docker.sock';
const skip = !existsSync(SOCKET) && 'no Docker socket';
const run = promisify(execFile);
const refused: string[] = [];
let server: http.Server;
let proxyHost = '';

/** Raw HTTP to the real daemon, for setting up and inspecting behind the proxy's back. */
function direct(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: SOCKET, method, path, headers: { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

function viaProxy(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

before(async () => {
  if (skip) return;
  server = createProxy({ socketPath: SOCKET, runnerImage: 'codehaunt-runner:1', log: (e) => refused.push(String(e.reason)) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  proxyHost = `tcp://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server?.closeAllConnections();
  server?.close();
});

test('the judge runs a real submission through the proxy', { skip }, async () => {
  process.env.DOCKER_HOST = proxyHost;
  try {
    const runner = new DockerCodeRunner();
    assert.deepEqual(await runner.missingImages(), []);
    const result = await runner.run({
      language: 'c',
      source: '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}',
      tests: [{ id: 't1', input: '1 2', expectedOutput: '3' }],
      limits: { timeLimitMs: 2000, memoryLimitMb: 256 },
    });
    assert.equal(result.verdict, 'AC');
  } finally {
    delete process.env.DOCKER_HOST;
  }
});

test('a privileged, host-mounting create comes out as the sandbox template', { skip }, async () => {
  const name = `cjudge-${crypto.randomUUID()}`;
  const created = await viaProxy('POST', `/v1.47/containers/create?name=${name}`, {
    Image: 'codehaunt-runner:1',
    Cmd: ['python3', '/opt/cjudge/runner.py'],
    HostConfig: {
      Privileged: true, Binds: ['/:/host'], NetworkMode: 'host', PidMode: 'host', CapAdd: ['ALL'],
      Memory: 268435456, MemorySwap: 268435456, PidsLimit: 16, NanoCpus: 1e9,
    },
  });
  assert.equal(created.status, 201);
  try {
    const { json } = await direct('GET', `/containers/${created.json.Id}/json`);
    assert.equal(json.HostConfig.Privileged, false);
    assert.equal(json.HostConfig.Binds, null);
    assert.equal(json.HostConfig.NetworkMode, 'none');
    assert.equal(json.HostConfig.PidMode, '');
    assert.equal(json.HostConfig.CapAdd, null);
    assert.equal(json.HostConfig.ReadonlyRootfs, true);
    assert.equal(json.Config.User, '65534:65534');
  } finally {
    await direct('DELETE', `/containers/${created.json.Id}?force=1`);
  }
});

test('containers the proxy did not create cannot be touched', { skip }, async () => {
  const name = `cjudge-${crypto.randomUUID()}`; // even with a judge-shaped name
  const other = await direct('POST', `/containers/create?name=${name}`, { Image: 'codehaunt-runner:1', Cmd: ['true'] });
  assert.equal(other.status, 201);
  try {
    for (const action of ['start', 'kill', 'wait']) {
      assert.equal((await viaProxy('POST', `/v1.47/containers/${other.json.Id}/${action}`)).status, 403, action);
      assert.equal((await viaProxy('POST', `/v1.47/containers/${name}/${action}`)).status, 403, action);
    }
  } finally {
    await direct('DELETE', `/containers/${other.json.Id}?force=1`);
  }
});

test('an attach with an unsupported API version smuggles nothing (audit N1)', { skip }, async () => {
  const name = `cjudge-${crypto.randomUUID()}`;
  const created = await viaProxy('POST', `/v1.47/containers/create?name=${name}`, {
    Image: 'codehaunt-runner:1',
    Cmd: ['python3', '/opt/cjudge/runner.py'],
    HostConfig: { Memory: 268435456, MemorySwap: 268435456, PidsLimit: 16, NanoCpus: 1e9 },
  });
  assert.equal(created.status, 201);
  const pwn = `cjudge-${crypto.randomUUID()}`;
  try {
    const { port } = server.address() as AddressInfo;
    const evil = JSON.stringify({ Image: 'codehaunt-runner:1', Cmd: ['true'], HostConfig: { Privileged: true } });
    await new Promise<void>((resolve) => {
      const c = net.connect(port, '127.0.0.1', () =>
        c.write(
          `POST /v1.999/containers/${created.json.Id}/attach HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\n` +
            `Upgrade: tcp\r\nContent-Length: 0\r\n\r\nPOST /containers/create?name=${pwn} HTTP/1.1\r\nHost: d\r\n` +
            `Content-Type: application/json\r\nContent-Length: ${evil.length}\r\n\r\n${evil}`,
        ),
      );
      c.on('data', () => {});
      c.on('close', () => resolve());
      setTimeout(() => c.destroy(), 2000);
    });
    assert.equal((await direct('GET', `/containers/${pwn}/json`)).status, 404, 'the smuggled create never ran');
  } finally {
    await direct('DELETE', `/containers/${created.json.Id}?force=1`);
    await direct('DELETE', `/containers/${pwn}?force=1`);
  }
});

test('an abandoned wait makes the proxy remove the container (re-audit R1)', { skip }, async () => {
  const name = `cjudge-${crypto.randomUUID()}`;
  const created = await viaProxy('POST', `/v1.47/containers/create?name=${name}`, {
    Image: 'codehaunt-runner:1',
    Cmd: ['python3', '/opt/cjudge/runner.py'],
    HostConfig: { Memory: 268435456, MemorySwap: 268435456, PidsLimit: 16, NanoCpus: 1e9 },
  });
  assert.equal(created.status, 201);
  try {
    const { port } = server.address() as AddressInfo;
    const controller = new AbortController();
    const waiting = fetch(`http://127.0.0.1:${port}/v1.47/containers/${created.json.Id}/wait?condition=removed`, {
      method: 'POST',
      signal: controller.signal,
    }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 300));
    controller.abort();
    await waiting;
    let status = 200;
    for (let i = 0; i < 20 && status !== 404; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      status = (await direct('GET', `/containers/${created.json.Id}/json`)).status;
    }
    assert.equal(status, 404, 'the container is gone');
  } finally {
    await direct('DELETE', `/containers/${created.json.Id}?force=1`);
  }
});

test('the Docker CLI gets a clear refusal for anything else', { skip }, async () => {
  const env = { ...process.env, DOCKER_HOST: proxyHost };
  for (const args of [['ps'], ['run', '--rm', 'alpine', 'true'], ['exec', 'x', 'true'], ['image', 'inspect', 'postgres']]) {
    await assert.rejects(run('docker', args, { env, timeout: 30_000 }), /codehaunt docker-proxy/, args.join(' '));
  }
  assert.ok(refused.length >= 4);
});
