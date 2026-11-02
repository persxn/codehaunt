import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import {
  generatePassword,
  hashPassword,
  login,
  resetLoginRateLimits,
  resolveSession,
  setAccountActive,
  verifyPassword,
} from '../src/index.ts';

let db: TestDatabase;
const PASSWORD = 'correct-horse-9';

before(async () => {
  db = await createTestDatabase();
  const passwordHash = await hashPassword(PASSWORD);
  await db.prisma.user.createMany({
    data: [
      { username: 'p1', name: 'Participant', role: 'PARTICIPANT', passwordHash, active: true },
      { username: 'p2', name: 'Not checked in', role: 'PARTICIPANT', passwordHash, active: false },
      { username: 'org', name: 'Organizer', role: 'ORGANIZER', passwordHash, active: true },
    ],
  });
});
after(async () => {
  await db?.close();
});
beforeEach(() => resetLoginRateLimits());

test('argon2 round trip; malformed hash reads as wrong password', async () => {
  const hash = await hashPassword('abc12345');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, 'abc12345'), true);
  assert.equal(await verifyPassword(hash, 'nope'), false);
  assert.equal(await verifyPassword('garbage', 'abc12345'), false);
});

test('generated passwords avoid ambiguous characters', () => {
  const pw = generatePassword(64);
  assert.equal(pw.length, 64);
  assert.doesNotMatch(pw, /[0O1lI]/);
});

test('login opens a session that resolves to the user', async () => {
  const result = await login(db.prisma, ' P1 ', PASSWORD);
  assert.ok(result.ok);
  const resolved = await resolveSession(db.prisma, result.session.token);
  assert.equal(resolved?.user.username, 'p1');
  assert.equal(resolved?.user.role, 'PARTICIPANT');
  // Only the hash is stored.
  assert.equal(await db.prisma.authSession.count({ where: { id: result.session.token } }), 0);
});

test('wrong password and unknown user give the same answer', async () => {
  const wrong = await login(db.prisma, 'p1', 'wrong-password');
  const unknown = await login(db.prisma, 'ghost', PASSWORD);
  assert.deepEqual(wrong, { ok: false, reason: 'invalid_credentials' });
  assert.deepEqual(unknown, { ok: false, reason: 'invalid_credentials' });
});

test('an account not yet checked in cannot log in', async () => {
  assert.deepEqual(await login(db.prisma, 'p2', PASSWORD), { ok: false, reason: 'account_inactive' });
});

test('a second participant login ends the first and is audit-logged', async () => {
  const first = await login(db.prisma, 'p1', PASSWORD, { ipAddress: '10.0.0.1' });
  const second = await login(db.prisma, 'p1', PASSWORD, { ipAddress: '10.0.0.2', requestId: 'req-1' });
  assert.ok(first.ok && second.ok);
  assert.ok(second.replacedSessions >= 1);
  assert.equal(await resolveSession(db.prisma, first.session.token), null);
  assert.ok(await resolveSession(db.prisma, second.session.token));
  const entry = await db.prisma.auditLog.findFirst({ where: { action: 'auth.session_replaced', requestId: 'req-1' } });
  assert.ok(entry);
});

test('staff may hold several sessions', async () => {
  const a = await login(db.prisma, 'org', PASSWORD);
  const b = await login(db.prisma, 'org', PASSWORD);
  assert.ok(a.ok && b.ok);
  assert.equal(b.replacedSessions, 0);
  assert.ok(await resolveSession(db.prisma, a.session.token));
});

test('deactivating an account ends its sessions immediately', async () => {
  const result = await login(db.prisma, 'org', PASSWORD);
  assert.ok(result.ok);
  await setAccountActive(db.prisma, result.user.id, false);
  assert.equal(await resolveSession(db.prisma, result.session.token), null);
  await setAccountActive(db.prisma, result.user.id, true);
});

test('repeated failures for one username are throttled', async () => {
  for (let i = 0; i < 8; i++) await login(db.prisma, 'p1', 'wrong');
  const result = await login(db.prisma, 'p1', PASSWORD);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'rate_limited');
});

test('unknown and empty tokens resolve to null', async () => {
  assert.equal(await resolveSession(db.prisma, undefined), null);
  assert.equal(await resolveSession(db.prisma, 'not-a-token'), null);
});
