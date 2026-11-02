import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Router, RouterError } from '../src/router.ts';

function router(slots = 2, queueMax = 4, timeoutMs = 200): Router {
  const r = new Router(['a', 'b', 'c'], slots, queueMax, timeoutMs);
  for (const n of ['a', 'b', 'c']) r.setHealthy(n, true);
  return r;
}

test('routes to the least-busy healthy node and spreads ties', async () => {
  const r = router(4);
  const picks = [await r.acquire('s1'), await r.acquire('s2'), await r.acquire('s3')];
  assert.deepEqual([...picks].sort(), ['a', 'b', 'c']);
  r.release(picks[1]!);
  assert.equal(await r.acquire('s4'), picks[1]);
});

test('a session sticks to its node unless that node is more than one request busier', async () => {
  const r = router(8);
  const home = await r.acquire('s'); // home 1, others 0
  assert.equal(await r.acquire('s'), home); // 1 <= 0 + 1: stays
  assert.notEqual(await r.acquire('s'), home); // 2 > 0 + 1: moves
});

test('drained nodes get no work; no healthy node fails fast', async () => {
  const r = router();
  r.setHealthy('a', false);
  r.setHealthy('b', false);
  assert.equal(await r.acquire('s'), 'c');
  r.setHealthy('c', false);
  await assert.rejects(r.acquire('s'), (e) => e instanceof RouterError && e.code === 'no_healthy_node');
});

test('excluded nodes are skipped (retry on another node)', async () => {
  const r = router();
  const n = await r.acquire('s', new Set(['a', 'b']));
  assert.equal(n, 'c');
  await assert.rejects(
    new Router(['a'], 1, 1, 100).acquire('s', new Set(['a'])),
    (e) => e instanceof RouterError && e.code === 'no_healthy_node',
  );
});

test('full slots queue FIFO, a release serves the queue, a full queue refuses', async () => {
  const r = new Router(['a'], 1, 1, 1_000);
  r.setHealthy('a', true);
  assert.equal(await r.acquire('s1'), 'a');
  const waiting = r.acquire('s2');
  assert.equal(r.queueDepth, 1);
  await assert.rejects(r.acquire('s3'), (e) => e instanceof RouterError && e.code === 'gateway_busy');
  r.release('a');
  assert.equal(await waiting, 'a');
  assert.equal(r.nodes.get('a')!.inflight, 1);
});

test('a queued request times out with gateway_busy and leaves the queue', async () => {
  const r = new Router(['a'], 1, 5, 50);
  r.setHealthy('a', true);
  await r.acquire('s1');
  await assert.rejects(r.acquire('s2'), (e) => e instanceof RouterError && e.code === 'gateway_busy');
  assert.equal(r.queueDepth, 0);
});

test('queued requests fail when the last usable node is drained', async () => {
  const r = new Router(['a'], 1, 5, 5_000);
  r.setHealthy('a', true);
  await r.acquire('s1');
  const waiting = r.acquire('s2');
  r.setHealthy('a', false);
  await assert.rejects(waiting, (e) => e instanceof RouterError && e.code === 'no_healthy_node');
});
