/**
 * The real middleware over real requests (acceptance criterion 4 at the HTTP level, audit F8).
 * No cookie means no database lookup, so this needs no Postgres.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NextRequest } from 'next/server';

import { middleware } from '../src/middleware.ts';

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
