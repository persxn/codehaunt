import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_LIVE_CONTAINERS, Owned, parseRoute, runnerImages, sandboxCreateBody, upstreamPath } from '../src/policy.ts';

const IMAGES = runnerImages('codehaunt-runner:1');
const NAME = 'cjudge-52b3b75d-8ede-4d28-a212-290663e632bc';
const ID = 'a'.repeat(64);

/** What the Docker CLI sends for the vendored judge's `docker run` (captured from a real run). */
const cliBody = () => ({
  Image: 'codehaunt-runner:1',
  Cmd: ['python3', '/opt/cjudge/runner.py'],
  User: '65534:65534',
  HostConfig: { NetworkMode: 'none', Memory: 671088640, MemorySwap: 671088640, PidsLimit: 64, NanoCpus: 1e9 },
});

test('the judge\'s seven calls are recognised', () => {
  assert.deepEqual(parseRoute('HEAD', '/_ping'), { kind: 'ping' });
  assert.deepEqual(parseRoute('GET', '/v1.47/images/codehaunt-runner-cpp:1/json'), {
    kind: 'image', version: '/v1.47', image: 'codehaunt-runner-cpp:1',
  });
  assert.deepEqual(parseRoute('POST', `/v1.52/containers/create?name=${NAME}`), { kind: 'create', version: '/v1.52', name: NAME });
  for (const action of ['attach', 'wait', 'start', 'kill'] as const) {
    assert.deepEqual(parseRoute('POST', `/v1.52/containers/${ID}/${action}?x=1`), { kind: 'container', version: '/v1.52', ref: ID, action });
  }
  assert.equal(parseRoute('POST', `/containers/${NAME}/kill`)?.kind, 'container');
});

test('everything else is refused', () => {
  for (const [method, url] of [
    ['GET', '/v1.52/containers/json'],
    ['POST', `/v1.52/containers/${ID}/exec`],
    ['DELETE', `/v1.52/containers/${ID}`],
    ['POST', '/v1.52/containers/create'],
    ['POST', '/v1.52/containers/create?name=jojocode-web'],
    ['POST', '/v1.52/images/create?fromImage=alpine'],
    ['POST', '/v1.52/build'],
    ['GET', '/v1.52/info'],
    ['POST', `/v1.52/containers/${ID}/../../exec`],
  ]) {
    assert.equal(parseRoute(method!, url!), null, `${method} ${url}`);
  }
});

test('query strings and API versions are fixed by the proxy, never copied', () => {
  assert.equal(upstreamPath(parseRoute('POST', `/v1.52/containers/${ID}/wait?condition=next-exit&x=1`)!),
    `/containers/${ID}/wait?condition=removed`);
  assert.equal(upstreamPath(parseRoute('POST', `/v1.999/containers/${ID}/kill?signal=SIGHUP`)!), `/containers/${ID}/kill`);
  assert.equal(upstreamPath(parseRoute('POST', `/v1.999/containers/${ID}/attach`)!),
    `/containers/${ID}/attach?stderr=1&stdin=1&stdout=1&stream=1`);
});

test('malformed URLs are refused, never thrown', () => {
  for (const url of ['//', 'http://[::1', '/v1.47/images/%E0%A4%A/json', '/v1.47/images/%/json', '\\x']) {
    assert.equal(parseRoute('GET', url), null, url);
  }
});

test('a create body is rebuilt from the template: extra fields vanish', () => {
  const evil = {
    ...cliBody(),
    Env: ['LD_PRELOAD=/x'],
    Entrypoint: ['/bin/sh'],
    HostConfig: {
      ...cliBody().HostConfig,
      Privileged: true,
      Binds: ['/:/host'],
      NetworkMode: 'host',
      PidMode: 'host',
      CapAdd: ['SYS_ADMIN'],
      Devices: [{ PathOnHost: '/dev/sda' }],
      SecurityOpt: ['seccomp=unconfined'],
    },
  };
  const out = sandboxCreateBody(evil, IMAGES) as { HostConfig: Record<string, unknown> } & Record<string, unknown>;
  assert.equal(out.Env, undefined);
  assert.equal(out.Entrypoint, undefined);
  assert.equal(out.User, '65534:65534');
  assert.deepEqual(out.HostConfig, {
    NetworkMode: 'none', AutoRemove: true, ReadonlyRootfs: true, Privileged: false, CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges'],
    Tmpfs: { '/box': 'rw,exec,nosuid,size=64m,mode=1777', '/tmp': 'rw,noexec,nosuid,size=8m,mode=1777' },
    Memory: 671088640, MemorySwap: 671088640, PidsLimit: 64, NanoCpus: 1e9,
  });
});

test('wrong image, command or limits are refused', () => {
  assert.throws(() => sandboxCreateBody({ ...cliBody(), Image: 'cjudge-runner:latest' }, IMAGES), /runner image/);
  assert.throws(() => sandboxCreateBody({ ...cliBody(), Cmd: ['sh', '-c', 'id'] }, IMAGES), /command/);
  assert.throws(() => sandboxCreateBody({ ...cliBody(), HostConfig: { ...cliBody().HostConfig, PidsLimit: 0 } }, IMAGES), /PidsLimit/);
  assert.throws(() => sandboxCreateBody({ ...cliBody(), HostConfig: { ...cliBody().HostConfig, Memory: 2 ** 40 } }, IMAGES), /Memory/);
  assert.throws(() => sandboxCreateBody({ ...cliBody(), HostConfig: { ...cliBody().HostConfig, MemorySwap: -1 } }, IMAGES), /swap/);
  assert.throws(() => sandboxCreateBody('[]', IMAGES), /object/);
});

test('runner images: the C image and its three siblings only', () => {
  assert.deepEqual([...IMAGES].sort(), [
    'codehaunt-runner-cpp:1', 'codehaunt-runner-java:1', 'codehaunt-runner-python:1', 'codehaunt-runner:1',
  ]);
});

test('live containers are counted until their wait completes', () => {
  const owned = new Owned();
  owned.add(ID, NAME);
  owned.add('b'.repeat(64), 'cjudge-00000000-0000-0000-0000-000000000000');
  assert.equal(owned.liveCount(), 2);
  owned.done(NAME);
  assert.equal(owned.liveCount(), 1);
  assert.ok(owned.has(ID), 'a finished container may still be killed or waited on');
  assert.ok(MAX_LIVE_CONTAINERS >= 8);
});

test('only created containers are owned, by ID or name, until they expire', () => {
  const owned = new Owned(1000);
  owned.add(ID, NAME, 0);
  assert.ok(owned.has(ID, 500) && owned.has(NAME, 500));
  assert.equal(owned.has('b'.repeat(64), 500), false);
  assert.equal(owned.has(ID, 1000), false);
});
