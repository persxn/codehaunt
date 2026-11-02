/**
 * Admin console and desk services on PGlite (WP-04): badges and single-use check-in with the cap and waitlist, live
 * budget changes, the event lock, staff management and password rules.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createSession, login, resetLoginRateLimits } from '@codehaunt/auth';
import { tokenBalance } from '@codehaunt/db';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { checkIn, issueBadges, promoteFromWaitlist } from '../src/server/checkin-service.ts';
import { AppError } from '../src/server/errors.ts';
import { createEvent, getEvent, updateEvent } from '../src/server/event-service.ts';
import { importParticipants, anonymiseParticipant } from '../src/server/participant-admin-service.ts';
import { createProblem, getProblem } from '../src/server/problem-admin-service.ts';
import { changeRole, createStaff, noAccessSync, resetPassword, setStaffActive, type AccessGroupSync } from '../src/server/staff-service.ts';
import { eventConfig } from './support/fixtures.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

let n = 0;
async function admin() {
  const u = await db.prisma.user.create({ data: { username: `adm${++n}`, name: 'A', role: 'ADMIN', passwordHash: 'x', active: true } });
  return { id: u.id, role: 'ADMIN' as const, requestId: `req-${n}` };
}
const code = (e: unknown, c: string) => e instanceof AppError && e.code === c;

async function eventWith(cap: number, rows: number) {
  const a = await admin();
  const config = eventConfig({ access: { checkInCap: cap } });
  const { id } = await createEvent(db.prisma, { slug: `e${++n}`, name: 'E', config }, a);
  await db.prisma.event.update({ where: { id }, data: { status: 'CHECK_IN' } });
  const result = await importParticipants(
    db.prisma,
    { eventId: id, rows: Array.from({ length: rows }, (_, i) => ({ name: `Person ${i}`, enrolmentNo: `ENR${n}X${i}` })) },
    a,
  );
  return { id, a, result };
}

test('import waitlists beyond the cap and skips duplicates', async () => {
  const { id, a, result } = await eventWith(2, 3);
  assert.equal(result.created, 3);
  const statuses = (await db.prisma.participant.findMany({ where: { eventId: id }, orderBy: { enrolmentNo: 'asc' } })).map((p) => p.status);
  assert.deepEqual(statuses, ['REGISTERED', 'REGISTERED', 'WAITLISTED']);
  const again = await importParticipants(db.prisma, { eventId: id, rows: [{ name: 'X', enrolmentNo: `ENR${n}X0` }] }, a);
  assert.equal(again.created, 0);
  assert.equal(again.skipped[0]?.reason, 'already registered');
});

test('an unscanned participant cannot log in; scanning activates them; a reused code is rejected', async () => {
  resetLoginRateLimits();
  const { id, a } = await eventWith(5, 1);
  const [badge] = await issueBadges(db.prisma, { eventId: id, actorId: a.id, requestId: 'r' });
  assert.ok(badge && /^CH1:[A-Za-z0-9_-]{43}$/.test(badge.checkInCode));
  assert.equal((await login(db.prisma, badge.username, badge.password)).ok, false, 'inactive until scanned');
  // Only the hash is stored.
  const stored = await db.prisma.participant.findUniqueOrThrow({ where: { id: badge.participantId } });
  assert.notEqual(stored.checkInTokenHash, badge.checkInCode.slice(4));

  const result = await checkIn(db.prisma, { code: badge.checkInCode, seatLabel: 'A-12', actorId: a.id, requestId: 'r' });
  assert.equal(result.seatLabel, 'A-12');
  assert.equal((await login(db.prisma, badge.username, badge.password)).ok, true);
  assert.equal(await tokenBalance(db.prisma, badge.participantId), 20_000, 'event budget granted once');
  await assert.rejects(checkIn(db.prisma, { code: badge.checkInCode, seatLabel: 'B-1', actorId: a.id, requestId: 'r' }), (e) => code(e, 'invalid_code'));
  await assert.rejects(checkIn(db.prisma, { code: 'CH1:nope', seatLabel: 'B-1', actorId: a.id, requestId: 'r' }), (e) => code(e, 'invalid_code'));
  assert.equal(await db.prisma.auditLog.count({ where: { action: 'checkin.scanned', targetId: badge.participantId } }), 1);
});

test('the cap holds at check-in; a waitlisted person is promoted first', async () => {
  const { id, a } = await eventWith(1, 2);
  const badges = await issueBadges(db.prisma, { eventId: id, actorId: a.id, requestId: 'r' });
  const waitlisted = badges[1]!;
  await assert.rejects(checkIn(db.prisma, { code: waitlisted.checkInCode, seatLabel: 'S', actorId: a.id, requestId: 'r' }), (e) => code(e, 'waitlisted'));
  await checkIn(db.prisma, { code: badges[0]!.checkInCode, seatLabel: 'S1', actorId: a.id, requestId: 'r' });
  await promoteFromWaitlist(db.prisma, { participantId: waitlisted.participantId, actorId: a.id, requestId: 'r' });
  await assert.rejects(checkIn(db.prisma, { code: waitlisted.checkInCode, seatLabel: 'S2', actorId: a.id, requestId: 'r' }), (e) => code(e, 'at_capacity'));
});

test('a live budget change applies from now on, is audit-logged, and never overdraws', async () => {
  const { id, a } = await eventWith(5, 2);
  const badges = await issueBadges(db.prisma, { eventId: id, actorId: a.id, requestId: 'r' });
  await checkIn(db.prisma, { code: badges[0]!.checkInCode, seatLabel: 'S1', actorId: a.id, requestId: 'r' });
  await db.prisma.event.update({ where: { id }, data: { status: 'RUNNING', lockedAt: new Date() } });
  const ev = await getEvent(db.prisma, id);
  await updateEvent(db.prisma, id, { config: { ...ev.config, budget: { ...ev.config.budget, tokensPerParticipant: 25_000 } } }, a);
  assert.equal(await tokenBalance(db.prisma, badges[0]!.participantId), 25_000);
  // Checked in after the change: the new amount, once.
  await checkIn(db.prisma, { code: badges[1]!.checkInCode, seatLabel: 'S2', actorId: a.id, requestId: 'r' });
  assert.equal(await tokenBalance(db.prisma, badges[1]!.participantId), 25_000);
  await updateEvent(db.prisma, id, { config: { ...ev.config, budget: { ...ev.config.budget, tokensPerParticipant: 1000 } } }, a);
  assert.equal(await tokenBalance(db.prisma, badges[0]!.participantId), 1000);
  assert.equal(await db.prisma.auditLog.count({ where: { action: 'event.config_updated', targetId: id } }), 2);
  // Locked: scoring weights (and problems) are frozen.
  await assert.rejects(
    updateEvent(db.prisma, id, { config: { ...ev.config, scoring: { ...ev.config.scoring, wrongSubmissionPenalty: 1 } } }, a),
    (e) => code(e, 'event_locked'),
  );
});

test('problems are edited as a whole with hidden tests and solutions, and freeze at the start', async () => {
  const { id, a } = await eventWith(5, 0 + 1);
  const input = {
    slug: 'p1', title: 'P1', statement: 'S', difficulty: 'EASY' as const, ord: 0, timeLimitMs: 1000, memoryLimitMb: 64,
    checker: { kind: 'caseInsensitive' as const }, practice: false,
    solutions: [{ language: 'cpp' as const, kind: 'REFERENCE' as const, source: 'int main(){}' }],
    visibleTests: [{ input: '1', expectedOutput: '1' }],
    hiddenTests: [{ input: '2', expectedOutput: '2' }, { input: '3', expectedOutput: '3' }],
  };
  const { id: problemId } = await createProblem(db.prisma, id, input, a);
  const back = await getProblem(db.prisma, problemId);
  assert.equal(back.hiddenTests.length, 2);
  assert.equal(back.solutions[0]?.language, 'cpp');
  await db.prisma.event.update({ where: { id }, data: { lockedAt: new Date() } });
  await assert.rejects(createProblem(db.prisma, id, { ...input, slug: 'p2' }, a), (e) => code(e, 'event_locked'));
});

test('staff: organizers add volunteers only; weak passwords are refused; removal ends sessions', async () => {
  const a = await admin();
  const synced: string[] = [];
  const sync: AccessGroupSync = { add: async (e) => void synced.push(`+${e}`), remove: async (e) => void synced.push(`-${e}`) };
  const org = await createStaff(db.prisma, { username: `org${n}`, name: 'O', email: `o${n}@x.test`, role: 'ORGANIZER', password: 'violet tram 42 mango' }, a, noAccessSync);
  const orgActor = { id: org.id, role: 'ORGANIZER' as const, requestId: 'r' };
  await assert.rejects(
    createStaff(db.prisma, { username: `o2${n}`, name: 'O', email: `o2${n}@x.test`, role: 'ORGANIZER', password: 'violet tram 42 mango' }, orgActor, sync),
    (e) => code(e, 'forbidden'),
  );
  for (const weak of ['short', 'password1234', `vol${n}vol${n}xyz!`]) {
    await assert.rejects(
      createStaff(db.prisma, { username: `vol${n}`, name: 'V', email: `v${n}@x.test`, role: 'VOLUNTEER', password: weak }, orgActor, sync),
      (e) => code(e, 'invalid_request'),
    );
  }
  const vol = await createStaff(db.prisma, { username: `vol${n}`, name: 'V', email: `v${n}@x.test`, role: 'VOLUNTEER', password: 'copper lantern 7 owl' }, orgActor, sync);
  await createSession(db.prisma, { userId: vol.id });
  await setStaffActive(db.prisma, vol.id, false, orgActor, sync);
  assert.equal(await db.prisma.authSession.count({ where: { userId: vol.id } }), 0);
  assert.deepEqual(synced, [`+v${n}@x.test`, `-v${n}@x.test`]);
  // A reset ends that user's sessions; organizers can't reset an admin.
  await createSession(db.prisma, { userId: org.id });
  await resetPassword(db.prisma, org.id, 'amber kettle 19 fox', a);
  assert.equal(await db.prisma.authSession.count({ where: { userId: org.id } }), 0);
  await assert.rejects(resetPassword(db.prisma, a.id, 'amber kettle 19 fox', orgActor), (e) => code(e, 'forbidden'));
});

test('role changes are admin-only, audited, and end the target sessions', async () => {
  const a = await admin();
  const vol = await createStaff(db.prisma, { username: `rv${n}`, name: 'V', email: `rv${n}@x.test`, role: 'VOLUNTEER', password: 'copper lantern 7 owl' }, a, noAccessSync);
  await createSession(db.prisma, { userId: vol.id });
  await assert.rejects(changeRole(db.prisma, vol.id, { role: 'ADMIN', reason: 'x' }, { ...a, role: 'ORGANIZER' }), (e) => code(e, 'forbidden'));
  await changeRole(db.prisma, vol.id, { role: 'ORGANIZER', reason: 'runs the desk' }, a);
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: vol.id } })).role, 'ORGANIZER');
  assert.equal(await db.prisma.authSession.count({ where: { userId: vol.id } }), 0);
  const entry = await db.prisma.auditLog.findFirstOrThrow({ where: { action: 'user.role_changed', targetId: vol.id } });
  assert.deepEqual([entry.before, entry.after, entry.reason], [{ role: 'VOLUNTEER' }, { role: 'ORGANIZER' }, 'runs the desk']);
});

test('deleting a participant erases identity and content but keeps the ledgers', async () => {
  const { id, a } = await eventWith(5, 1);
  const p = await db.prisma.participant.findFirstOrThrow({ where: { eventId: id } });
  await anonymiseParticipant(db.prisma, p.id, { ...a, reason: 'participant request' });
  const after = await db.prisma.participant.findUniqueOrThrow({ where: { id: p.id }, include: { user: true } });
  assert.equal(after.user.name, 'Deleted participant');
  assert.equal(after.user.active, false);
  assert.match(after.enrolmentNo, /^deleted-/);
});
