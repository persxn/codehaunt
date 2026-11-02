/**
 * Proxy behaviour against a fake daemon (no Docker needed). N1: nothing may reach the daemon behind
 * an attach upgrade until it has answered 101; the fake behaves like dockerd 29 on a refused upgrade
 * (400 and keep-alive). R1: an abandoned wait removes its container. R2: refused upgrades close fully.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createProxy } from '../src/server.ts';

const ID = 'ab'.repeat(32);
const NAME = 'cjudge-11111111-2222-3333-4444-555555555555';
const dir = mkdtempSync(join(tmpdir(), 'codehaunt-proxy-'));
const socketPath = join(dir, 'docker.sock');
const daemonSaw: string[] = [];
let upgradeStatus = 400;
let daemon: net.Server;
let proxy: ReturnType<typeof createProxy>;
let port = 0;
const daemonConns = new Set<net.Socket>();

before(async () => {
  daemon = net.createServer((conn) => {
    daemonConns.add(conn);
    conn.on('close', () => daemonConns.delete(conn));
    let buffer = '';
    conn.on('data', (data) => {
      buffer += data;
      let end: number;
      while ((end = buffer.indexOf('\r\n\r\n')) >= 0) {
        const head = buffer.slice(0, end);
        const length = Number(/content-length: *(\d+)/i.exec(head)?.[1] ?? 0);
        if (buffer.length < end + 4 + length) return;
        buffer = buffer.slice(end + 4 + length);
        const line = head.split('\r\n')[0]!;
        daemonSaw.push(line);
        if (line.includes('/wait')) {
          // Like dockerd for a running container: headers at once, the body only when it is removed.
          conn.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n');
          continue;
        }
        if (line.startsWith('DELETE')) {
          conn.write('HTTP/1.1 204 No Content\r\n\r\n');
          continue;
        }
        if (line.includes('/attach')) {
          if (upgradeStatus === 101) {
            conn.write('HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');
            conn.removeAllListeners('data');
            conn.on('data', (raw) => daemonSaw.push(`STDIN ${raw.toString().split('\r\n')[0]}`));
            return;
          }
          conn.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 2\r\n\r\n{}'); // and keep the connection open
        } else {
          const body = JSON.stringify({ Id: ID });
          conn.write(`HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
        }
      }
    });
  });
  await new Promise<void>((resolve) => daemon.listen(socketPath, resolve));
  proxy = createProxy({ socketPath, runnerImage: 'codehaunt-runner:1', log: () => {} });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  port = (proxy.address() as AddressInfo).port;

  const created = await fetch(`http://127.0.0.1:${port}/v1.47/containers/create?name=${NAME}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      Image: 'codehaunt-runner:1',
      Cmd: ['python3', '/opt/cjudge/runner.py'],
      HostConfig: { Memory: 1 << 28, MemorySwap: 1 << 28, PidsLimit: 64, NanoCpus: 1e9 },
    }),
  });
  assert.equal(created.status, 201);
});

after(() => {
  proxy?.closeAllConnections();
  proxy?.close();
  for (const conn of daemonConns) conn.destroy();
  daemon?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Upgrade-attach to the owned container with a smuggled privileged create behind it; returns what the client got. */
function smuggle(): Promise<string> {
  const evil = JSON.stringify({ Image: 'alpine', HostConfig: { Privileged: true, Binds: ['/:/host'] } });
  const smuggled =
    `POST /containers/create?name=pwn HTTP/1.1\r\nHost: docker\r\nContent-Type: application/json\r\n` +
    `Content-Length: ${evil.length}\r\n\r\n${evil}`;
  return new Promise((resolve) => {
    let got = '';
    const client = net.connect(port, '127.0.0.1', () =>
      client.write(
        `POST /v1.999/containers/${ID}/attach HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n` +
          `Content-Length: 0\r\n\r\n${smuggled}`,
      ),
    );
    client.on('data', (d) => (got += d));
    client.on('close', () => resolve(got));
    setTimeout(() => client.destroy(), 500);
  });
}

test('a refused upgrade forwards nothing behind it', async () => {
  daemonSaw.length = 0;
  upgradeStatus = 400;
  const got = await smuggle();
  assert.match(got, /^HTTP\/1\.1 502/);
  assert.deepEqual(daemonSaw, ['POST /containers/' + ID + '/attach?stderr=1&stdin=1&stdout=1&stream=1 HTTP/1.1']);
  assert.ok(!daemonSaw.some((l) => l.includes('/v1.999') || l.includes('pwn')));
});

test('after a 101 the extra bytes are only the container\'s stdin', async () => {
  daemonSaw.length = 0;
  upgradeStatus = 101;
  const got = await smuggle();
  assert.match(got, /^HTTP\/1\.1 101/);
  assert.equal(daemonSaw.filter((l) => l.startsWith('POST')).length, 1, 'one HTTP request reached the daemon');
  assert.ok(daemonSaw.some((l) => l.startsWith('STDIN POST /containers/create?name=pwn')), 'smuggled bytes arrived as stdin');
});

test('malformed request lines do not take the proxy down', async () => {
  for (const raw of ['GET // HTTP/1.1\r\nHost: x\r\n\r\n', 'GET /v1.47/images/%E0%A4%A/json HTTP/1.1\r\nHost: x\r\n\r\n', 'BLAH\r\n\r\n']) {
    await new Promise<void>((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => c.write(raw));
      c.on('data', () => {});
      c.on('close', () => resolve());
      c.on('error', () => resolve());
      setTimeout(() => c.destroy(), 300);
    });
  }
  const ping = await fetch(`http://127.0.0.1:${port}/_ping`);
  assert.equal(ping.status, 201, 'still answering (the fake daemon replies 201 to everything else)');
});

test('an abandoned wait removes the container (re-audit R1)', async () => {
  daemonSaw.length = 0;
  const controller = new AbortController();
  const waiting = fetch(`http://127.0.0.1:${port}/v1.47/containers/${ID}/wait?condition=removed`, {
    method: 'POST',
    signal: controller.signal,
  }).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 200));
  controller.abort();
  await waiting;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(daemonSaw.includes(`DELETE /containers/${ID}?force=1 HTTP/1.1`), daemonSaw.join(' | '));
});

test('a refused upgrade is closed, not left half-open (re-audit R2)', async () => {
  const closed = await new Promise<boolean>((resolve) => {
    const c = net.connect(port, '127.0.0.1', () =>
      c.write('POST /v1.47/containers/' + 'c'.repeat(64) + '/attach HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n'),
    );
    c.on('data', () => {});
    c.on('close', () => resolve(true));
    setTimeout(() => resolve(false), 3000); // the client never ends its side; the proxy must
  });
  assert.ok(closed);
});
