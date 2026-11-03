/**
 * The real middleware over real requests (acceptance criterion 4 at the HTTP level, audit F8).
 * No cookie means no database lookup, so this needs no Postgres.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NextRequest } from 'next/server';

import { sebHash } from '@codehaunt/auth';

import { middleware, sebGate } from '../src/middleware.ts';

process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, 'http://codehaunt.test'), {
    method: init.method ?? 'GET',
    headers: { host: 'codehaunt.test', ...init.headers },
  });
}

for (const path of ['/', '/contest', '/admin', '/api/auth/me', '/api/contest/x', '/api/admin/x', '/nope']) {
  test(`${path} without a session is 401`, async () => {
    const response = await middleware(request(path));
    assert.equal(response.status, 401);
    if (path.startsWith('/api/')) assert.equal((await response.json()).error.code, 'unauthenticated');
  });
}

test('public routes pass through', async () => {
  for (const path of ['/login', '/healthz', '/_next/static/chunk.js']) {
    assert.equal((await middleware(request(path))).headers.get('x-middleware-next'), '1', path);
  }
});

test('path tricks are refused', async () => {
  for (const path of ['/login/..%2fadmin', '/login%2F..%2Fadmin', '/login/%5c..']) {
    assert.equal((await middleware(request(path))).status, 401, path);
  }
});

test('a cross-site POST is refused before anything else', async () => {
  const response = await middleware(
    request('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example' } }),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'cross_origin');
});

test('every passed-through response carries a nonce CSP without unsafe-inline scripts (audit F9)', async () => {
  const a = (await middleware(request('/login'))).headers.get('content-security-policy') ?? '';
  const b = (await middleware(request('/login'))).headers.get('content-security-policy') ?? '';
  const script = a.split('; ').find((d) => d.startsWith('script-src')) ?? '';
  assert.match(script, /'nonce-[A-Za-z0-9+/=]{20,}' 'strict-dynamic'/);
  assert.doesNotMatch(script, /unsafe-inline/);
  assert.notEqual(a, b, 'a fresh nonce per request');
});

test('SEB gate (ADR-013 §3): participants need the hash for the exact public URL; staff and public routes do not', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { SEB_CONFIG_KEY: env.SEB_CONFIG_KEY, PUBLIC_ORIGIN: env.PUBLIC_ORIGIN };
  const key = 'ab'.repeat(32);
  const origin = 'https://codehaunt.jojocode.in';
  try {
    delete env.SEB_CONFIG_KEY;
    delete env.PUBLIC_ORIGIN;
    assert.equal(sebGate(request('/contest'), 'PARTICIPANT', 'r'), null, 'not enforced on localhost');

    env.SEB_CONFIG_KEY = key;
    env.PUBLIC_ORIGIN = origin;
    const good = { 'x-safeexambrowser-configkeyhash': sebHash(`${origin}/api/contest/x?a=1`, key) };
    assert.equal(sebGate(request('/api/contest/x?a=1', { headers: good }), 'PARTICIPANT', 'r'), null);
    assert.equal(sebGate(request('/api/contest/x?a=2', { headers: good }), 'PARTICIPANT', 'r')?.status, 403);
    assert.equal(sebGate(request('/contest'), 'PARTICIPANT', 'r')?.status, 403);
    assert.equal(sebGate(request('/contest'), 'ORGANIZER', 'r'), null);
    assert.equal(sebGate(request('/login'), 'PARTICIPANT', 'r'), null);
    assert.equal(sebGate(request('/contest'), null, 'r'), null, 'no session: the policy answers 401');

    env.PUBLIC_ORIGIN = '';
    assert.equal(sebGate(request('/api/contest/x?a=1', { headers: good }), 'PARTICIPANT', 'r')?.status, 403, 'half config fails closed');
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  }
});

test('SEB refusal on an API route is the seb_required envelope', async () => {
  const env = process.env as Record<string, string | undefined>;
  env.SEB_CONFIG_KEY = 'ab'.repeat(32);
  env.PUBLIC_ORIGIN = 'https://codehaunt.jojocode.in';
  try {
    const response = sebGate(request('/api/contest/x'), 'PARTICIPANT', 'r');
    assert.equal((await response!.json()).error.code, 'seb_required');
  } finally {
    delete env.SEB_CONFIG_KEY;
    delete env.PUBLIC_ORIGIN;
  }
});
