import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authorize, ROLES } from '../src/policy.ts';

test('public routes need no session', () => {
  for (const path of ['/login', '/api/auth/login', '/healthz', '/readyz', '/_next/static/chunks/a.js']) {
    assert.deepEqual(authorize(path, null), { allow: true }, path);
  }
});

test('every other route is 401 without a session, including unknown ones', () => {
  for (const path of ['/', '/contest', '/admin', '/api/admin/events', '/api/contest/prompt', '/nope', '/loginx', '/healthzz']) {
    assert.deepEqual(authorize(path, null), { allow: false, status: 401 }, path);
  }
});

test('unknown routes are 403 for every role (deny by default)', () => {
  for (const role of ROLES) assert.deepEqual(authorize('/not-in-policy', role), { allow: false, status: 403 });
});

test('roles reach only their routes', () => {
  assert.deepEqual(authorize('/contest/p1', 'PARTICIPANT'), { allow: true });
  assert.deepEqual(authorize('/contest/p1', 'ADMIN'), { allow: false, status: 403 });
  assert.deepEqual(authorize('/admin', 'PARTICIPANT'), { allow: false, status: 403 });
  assert.deepEqual(authorize('/admin/check-in', 'VOLUNTEER'), { allow: true });
  assert.deepEqual(authorize('/api/admin/x', 'VOLUNTEER'), { allow: false, status: 403 });
  assert.deepEqual(authorize('/api/admin/x', 'ORGANIZER'), { allow: true });
});

test('traversal and encoded separators are denied', () => {
  for (const path of ['/login/../admin', '/login%2f..%2fadmin', '/login\\admin', 'login']) {
    assert.equal(authorize(path, null).allow, false, path);
    assert.equal(authorize(path, 'ADMIN').allow, false, path);
  }
});
