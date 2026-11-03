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
  assert.deepEqual(authorize('/admin/checkin', 'VOLUNTEER'), { allow: true });
  assert.deepEqual(authorize('/api/admin/x', 'VOLUNTEER'), { allow: false, status: 403 });
  assert.deepEqual(authorize('/api/admin/x', 'ORGANIZER'), { allow: true });
});

test('traversal and encoded separators are denied', () => {
  for (const path of ['/login/../admin', '/login%2f..%2fadmin', '/login\\admin', 'login']) {
    assert.equal(authorize(path, null).allow, false, path);
    assert.equal(authorize(path, 'ADMIN').allow, false, path);
  }
});

test('WP-04: volunteers reach only check-in and the desk; organizers cannot edit the event or roles', () => {
  const allowed = (path: string, role: Parameters<typeof authorize>[1]) => authorize(path, role).allow;
  for (const path of ['/admin/checkin', '/admin/desk', '/api/staff/checkin', '/api/staff/participants', '/api/staff/events']) {
    assert.equal(allowed(path, 'VOLUNTEER'), true, path);
  }
  for (const path of ['/admin', '/admin/event', '/admin/problems', '/api/admin/staff', '/api/admin/badges', '/api/admin/participants/import',
    '/api/admin/events', '/api/admin/roles/x', '/api/admin/users/x/password']) {
    assert.equal(allowed(path, 'VOLUNTEER'), false, path);
  }
  for (const path of ['/admin/event', '/admin/problems', '/api/admin/events', '/api/admin/events/x', '/api/admin/problems/x', '/api/admin/roles/x']) {
    assert.equal(allowed(path, 'ORGANIZER'), false, path);
    assert.equal(allowed(path, 'ADMIN'), true, path);
  }
  for (const path of ['/api/admin/staff', '/api/admin/badges', '/api/admin/participants/import', '/admin']) {
    assert.equal(allowed(path, 'ORGANIZER'), true, path);
  }
  for (const path of ['/api/staff/checkin', '/admin/checkin', '/api/admin/events']) assert.equal(allowed(path, 'PARTICIPANT'), false, path);
  assert.equal(allowed('/api/account/password', 'PARTICIPANT'), true);
});

test('WP-05: contest ops for admins and organizers only; the projector is public, its neighbours are not', () => {
  const allowed = (path: string, role: Parameters<typeof authorize>[1]) => authorize(path, role).allow;
  for (const path of ['/api/admin/ops/events/x', '/api/admin/ops/participants/x/topup', '/api/admin/ops/incidents/x', '/admin/contest', '/admin/leaderboard', '/admin/incidents', '/admin/log']) {
    assert.equal(allowed(path, 'ADMIN'), true, path);
    assert.equal(allowed(path, 'ORGANIZER'), true, path);
    assert.equal(allowed(path, 'VOLUNTEER'), false, path);
    assert.equal(allowed(path, 'PARTICIPANT'), false, path);
  }
  for (const path of ['/projector/abc', '/api/projector/abc']) assert.deepEqual(authorize(path, null), { allow: true }, path);
  for (const path of ['/projectors', '/api/projectorx']) assert.deepEqual(authorize(path, null), { allow: false, status: 401 }, path);
});
