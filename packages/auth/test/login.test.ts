import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import {
  generatePassword,
  hashPassword,
  checkPasswordStrength,
  login,
  resetLoginRateLimits,
  resolveSession,
  setAccountActive,
  verifyPassword,
} from '../src/index.ts';
import {
  GLOBAL_SLOWDOWN_MS,
  IP_SLOWDOWN_MS,
  loginDelayMs,
  MAX_IP_FAILURES,
  MAX_USERNAME_FAILURES,
  MAX_USERNAME_SLOWDOWN_MS,
  recordLoginFailure,
  USERNAME_SLOWDOWN_MS,
} from '../src/rate-limit.ts';

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

test('outside SEB a participant is refused after the password check and keeps their SEB session (ADR-013)', async () => {
  const inSeb = await login(db.prisma, 'p1', PASSWORD, { sebVerified: true });
  assert.ok(inSeb.ok);
  assert.deepEqual(await login(db.prisma, 'p1', PASSWORD, { sebVerified: false, requestId: 'req-seb' }), { ok: false, reason: 'seb_required' });
  assert.ok(await db.prisma.auditLog.findFirst({ where: { action: 'auth.seb_refused', requestId: 'req-seb' } }), 'refusal is audit-logged (R16-6)');
  assert.ok(await resolveSession(db.prisma, inSeb.session.token));
  // A wrong password still reads as a wrong password, SEB or not.
  assert.deepEqual(await login(db.prisma, 'p1', 'wrong-password', { sebVerified: false }), { ok: false, reason: 'invalid_credentials' });
  // Staff use normal browsers.
  assert.ok((await login(db.prisma, 'org', PASSWORD, { sebVerified: false })).ok);
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
  await setAccountActive(db.prisma, result.user.id, false, { actorId: result.user.id, requestId: 'req-deact' });
  assert.equal(await resolveSession(db.prisma, result.session.token), null);
  const entry = await db.prisma.auditLog.findFirst({ where: { action: 'user.deactivated', requestId: 'req-deact' } });
  assert.equal(entry?.targetId, result.user.id);
  await setAccountActive(db.prisma, result.user.id, true, { actorId: result.user.id });
});

test('failures for one username slow it down but never lock its owner out', async () => {
  for (let i = 0; i < MAX_USERNAME_FAILURES; i++) await login(db.prisma, 'p1', 'wrong');
  assert.equal(loginDelayMs('p1'), USERNAME_SLOWDOWN_MS);
  assert.equal(loginDelayMs('P1 '), USERNAME_SLOWDOWN_MS, 'case and spacing do not open a fresh bucket');
  const started = Date.now();
  const result = await login(db.prisma, 'p1', PASSWORD);
  assert.ok(result.ok, 'the right password still gets in');
  assert.ok(Date.now() - started >= USERNAME_SLOWDOWN_MS);
  assert.equal(loginDelayMs('p1'), 0, 'a success clears the bucket');
});

test('the per-username wait grows with failures, up to a ceiling', () => {
  for (let i = 0; i < MAX_USERNAME_FAILURES * 2; i++) recordLoginFailure('target');
  assert.equal(loginDelayMs('target'), 2 * USERNAME_SLOWDOWN_MS);
  for (let i = 0; i < MAX_USERNAME_FAILURES * 20; i++) recordLoginFailure('target');
  assert.equal(loginDelayMs('target'), MAX_USERNAME_SLOWDOWN_MS);
});

test('a hot venue address slows every login from it without refusing any', async () => {
  for (let i = 0; i < MAX_IP_FAILURES; i++) recordLoginFailure(`user${i}`, '203.0.113.7');
  assert.equal(loginDelayMs('p1', '203.0.113.7'), IP_SLOWDOWN_MS);
  assert.equal(loginDelayMs('p1', '203.0.113.8'), GLOBAL_SLOWDOWN_MS, 'the site-wide bucket is hot too');
});

test('unknown and empty tokens resolve to null', async () => {
  assert.equal(await resolveSession(db.prisma, undefined), null);
  assert.equal(await resolveSession(db.prisma, 'not-a-token'), null);
});

test('chosen passwords: long, not common, not the username', () => {
  assert.equal(checkPasswordStrength('short-1A').ok, false);
  assert.equal(checkPasswordStrength('Password2024!!').ok, false, 'a common word padded with digits');
  assert.equal(checkPasswordStrength('aaaaaaaaaaaa1').ok, false, 'too little variety');
  assert.equal(checkPasswordStrength('enrol-2026-0042xyz', 'enrol-2026-0042').ok, false);
  assert.equal(checkPasswordStrength('my codehaunt pass').ok, false);
  assert.equal(checkPasswordStrength('violet tram ladder 9', 'p1').ok, true);
  assert.equal(checkPasswordStrength(generatePassword()).ok, true, 'generated passwords always pass');
});

test('changing a password: wrong current passwords count like failed logins; one change at a time (audit M3)', async () => {
  resetLoginRateLimits();
  const { changePassword } = await import('../src/index.ts');
  const { loginDelayMs } = await import('../src/rate-limit.ts');
  const user = await db.prisma.user.create({ data: { username: 'chg-m3', name: 'C', role: 'PARTICIPANT', passwordHash: await hashPassword('right horse battery'), active: true } });
  for (let i = 0; i < 8; i++) {
    const r = await changePassword(db.prisma, { userId: user.id, sessionToken: 'x', currentPassword: `wrong-${i}`, newPassword: 'amber kettle 19 fox' });
    assert.equal(r.ok, false);
  }
  assert.ok(loginDelayMs('chg-m3') > 0, 'failures now slow down both logins and further checks');
  const [a, b] = await Promise.all([
    changePassword(db.prisma, { userId: user.id, sessionToken: 'x', currentPassword: 'right horse battery', newPassword: 'amber kettle 19 fox' }),
    changePassword(db.prisma, { userId: user.id, sessionToken: 'x', currentPassword: 'right horse battery', newPassword: 'amber kettle 19 fox' }),
  ]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  resetLoginRateLimits();
});
