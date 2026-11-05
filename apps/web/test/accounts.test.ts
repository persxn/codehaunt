/**
 * WP-11 accounts on PGlite: the event default password with a forced change (ADR-041), staff reset to the default,
 * and removing participants (ADR-044).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { changePassword, createSession, login, resetLoginRateLimits, resolveSession, verifyPassword } from '@codehaunt/auth';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { checkIn, issueBadges } from '../src/server/checkin-service.ts';
import { resetToEventDefault, setEventDefaultPassword } from '../src/server/default-password-service.ts';
import { AppError } from '../src/server/errors.ts';
import { createEvent } from '../src/server/event-service.ts';
import { importParticipants, removalMode, removeParticipant } from '../src/server/participant-admin-service.ts';
import { PASSWORD_CHANGE_PATHS } from '../src/lib/route.ts';
import { eventConfig } from './support/fixtures.ts';

const DEFAULT = 'lantern orchard velvet';
const OWN = 'copper meadow thistle';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

let n = 0;
async function setup(rows = 2) {
  const u = await db.prisma.user.create({ data: { username: `acc-adm${++n}`, name: 'A', role: 'ADMIN', passwordHash: 'x', active: true } });
  const a = { id: u.id, role: 'ADMIN' as const, requestId: `r${n}` };
  const config = eventConfig({ schedule: { checkInAt: new Date().toISOString(), startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 180 } });
  const { id } = await createEvent(db.prisma, { slug: `acc${n}`, name: 'E', config }, a);
  await db.prisma.event.update({ where: { id }, data: { status: 'CHECK_IN' } });
  return { id, a, rows: Array.from({ length: rows }, (_, i) => ({ name: `P ${i}`, enrolmentNo: `ACC${n}N${i}` })) };
}
const userOf = (enrolmentNo: string) => db.prisma.user.findUniqueOrThrow({ where: { username: enrolmentNo.toLowerCase() } });

test('a weak default password is refused; the plaintext is never in the audit log', async () => {
  const { id, a } = await setup();
  await assert.rejects(setEventDefaultPassword(db.prisma, id, 'short', a), (e) => e instanceof AppError && e.status === 400);
  await setEventDefaultPassword(db.prisma, id, DEFAULT, a);
  const event = await db.prisma.event.findUniqueOrThrow({ where: { id } });
  assert.ok(event.defaultPasswordHash && (await verifyPassword(event.defaultPasswordHash, DEFAULT)));
  const entry = await db.prisma.auditLog.findFirstOrThrow({ where: { action: 'event.default_password_set', targetId: id } });
  assert.doesNotMatch(JSON.stringify({ ...entry, id: String(entry.id) }), /lantern|argon2/);
});

test('import into an event with a default: accounts get it, flagged; check-in activates; first login must change it', async () => {
  resetLoginRateLimits();
  const { id, a, rows } = await setup(1);
  await setEventDefaultPassword(db.prisma, id, DEFAULT, a);
  await importParticipants(db.prisma, { eventId: id, rows }, a);
  const user = await userOf(rows[0]!.enrolmentNo);
  assert.equal(user.mustChangePassword, true);
  assert.ok(await verifyPassword(user.passwordHash, DEFAULT));

  // The badge carries no password; the account is still inactive until scanned (ADR-013).
  const [badge] = await issueBadges(db.prisma, { eventId: id, actorId: a.id, requestId: 'r' });
  assert.equal(badge!.password, null);
  assert.equal((await login(db.prisma, user.username, DEFAULT)).ok, false);
  await checkIn(db.prisma, { code: badge!.checkInCode, seatLabel: 'A1', actorId: a.id, requestId: 'r' });

  const result = await login(db.prisma, user.username, DEFAULT);
  assert.ok(result.ok);
  assert.equal(result.user.mustChangePassword, true);
  const resolved = await resolveSession(db.prisma, result.session.token);
  assert.equal(resolved?.user.mustChangePassword, true);

  // The route wrapper lets a flagged user reach only these API paths.
  assert.ok(PASSWORD_CHANGE_PATHS.has('/api/account/password'));
  assert.equal(PASSWORD_CHANGE_PATHS.has('/api/contest/state'), false);

  const same = await changePassword(db.prisma, { userId: user.id, sessionToken: result.session.token, currentPassword: DEFAULT, newPassword: DEFAULT });
  assert.equal(same.ok, false, 'keeping the default is refused');
  const changed = await changePassword(db.prisma, { userId: user.id, sessionToken: result.session.token, currentPassword: DEFAULT, newPassword: OWN });
  assert.ok(changed.ok);
  assert.equal((await userOf(rows[0]!.enrolmentNo)).mustChangePassword, false);
  assert.equal((await resolveSession(db.prisma, result.session.token))?.user.mustChangePassword, false);
});

test('changing the default re-hashes only participants still on it; someone who chose their own keeps it', async () => {
  resetLoginRateLimits();
  const { id, a, rows } = await setup(2);
  await setEventDefaultPassword(db.prisma, id, DEFAULT, a);
  await importParticipants(db.prisma, { eventId: id, rows }, a);
  // Participant 0 is checked in and chose their own password.
  const p0 = await userOf(rows[0]!.enrolmentNo);
  await db.prisma.participant.updateMany({ where: { userId: p0.id }, data: { status: 'CHECKED_IN' } });
  await db.prisma.user.update({ where: { id: p0.id }, data: { active: true } });
  const s0 = await createSession(db.prisma, { userId: p0.id });
  assert.ok((await changePassword(db.prisma, { userId: p0.id, sessionToken: s0.token, currentPassword: DEFAULT, newPassword: OWN })).ok);

  const NEXT = 'harbor quill saffron';
  const res = await setEventDefaultPassword(db.prisma, id, NEXT, a);
  assert.equal(res.applied, 1);
  assert.ok(await verifyPassword((await userOf(rows[0]!.enrolmentNo)).passwordHash, OWN));
  assert.ok(await verifyPassword((await userOf(rows[1]!.enrolmentNo)).passwordHash, NEXT));
  assert.ok(await resolveSession(db.prisma, s0.token), 'their session survives');

  // Clearing the default changes no password.
  await setEventDefaultPassword(db.prisma, id, null, a);
  assert.ok(await verifyPassword((await userOf(rows[1]!.enrolmentNo)).passwordHash, NEXT));
  assert.equal((await db.prisma.event.findUniqueOrThrow({ where: { id } })).defaultPasswordHash, null);
});

test('staff reset to the event default: flag set, sessions end; refused without a default or outside the event', async () => {
  const { id, a, rows } = await setup(1);
  await importParticipants(db.prisma, { eventId: id, rows }, a);
  const user = await userOf(rows[0]!.enrolmentNo);
  await assert.rejects(resetToEventDefault(db.prisma, user.id, id, a), (e) => e instanceof AppError && e.code === 'no_default_password');
  await setEventDefaultPassword(db.prisma, id, DEFAULT, a);
  await db.prisma.user.update({ where: { id: user.id }, data: { passwordHash: 'other', mustChangePassword: false, active: true } });
  await createSession(db.prisma, { userId: user.id });
  const out = await resetToEventDefault(db.prisma, user.id, id, a);
  assert.equal(out.endedSessions, 1);
  const after = await userOf(rows[0]!.enrolmentNo);
  assert.equal(after.mustChangePassword, true);
  assert.ok(await verifyPassword(after.passwordHash, DEFAULT));

  const other = await setup(0);
  await setEventDefaultPassword(db.prisma, other.id, DEFAULT, other.a);
  await assert.rejects(resetToEventDefault(db.prisma, user.id, other.id, other.a), (e) => e instanceof AppError && e.status === 404);
});

test('remove: no activity → deleted with the account; with activity → anonymised, ledgers intact', async () => {
  const { id, a, rows } = await setup(2);
  await importParticipants(db.prisma, { eventId: id, rows }, a);
  const [p0, p1] = await db.prisma.participant.findMany({ where: { eventId: id }, orderBy: { enrolmentNo: 'asc' } });
  await createSession(db.prisma, { userId: p0!.userId });
  assert.equal(await removalMode(db.prisma, p0!.id), 'deleted');
  assert.deepEqual(await removeParticipant(db.prisma, p0!.id, { ...a, reason: 'not attending' }), { ok: true, mode: 'deleted' });
  assert.equal(await db.prisma.participant.count({ where: { id: p0!.id } }), 0);
  assert.equal(await db.prisma.user.count({ where: { id: p0!.userId } }), 0);
  assert.equal(await db.prisma.authSession.count({ where: { userId: p0!.userId } }), 0);

  await db.prisma.tokenLedger.create({ data: { eventId: id, participantId: p1!.id, kind: 'GRANT', delta: 100, idempotencyKey: `g-${p1!.id}` } });
  assert.equal(await removalMode(db.prisma, p1!.id), 'anonymised');
  assert.equal((await removeParticipant(db.prisma, p1!.id, { ...a, reason: 'request' })).mode, 'anonymised');
  const kept = await db.prisma.participant.findUniqueOrThrow({ where: { id: p1!.id } });
  assert.match(kept.enrolmentNo, /^deleted-/);
  assert.equal(await db.prisma.tokenLedger.count({ where: { participantId: p1!.id } }), 1);
  assert.equal(await db.prisma.auditLog.count({ where: { action: 'participant.deleted', targetId: p0!.id } }), 1);
});
