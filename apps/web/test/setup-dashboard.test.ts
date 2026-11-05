/**
 * WP-11 setup roadmap and dashboards on PGlite (ADR-044): derived step state, the launch gate (also in Contest ops),
 * and dashboard numbers equal to direct counts.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { controlContest } from '../src/server/contest-ops-service.ts';
import { eventDashboard, platformDashboard } from '../src/server/dashboard-service.ts';
import { AppError } from '../src/server/errors.ts';
import { createEvent, getEvent, updateEvent } from '../src/server/event-service.ts';
import { importParticipants } from '../src/server/participant-admin-service.ts';
import { getSetup, setupReason } from '../src/server/setup-service.ts';
import { eventConfig } from './support/fixtures.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

let n = 0;
async function draftEvent(baseUrl = 'http://gateway.invalid') {
  const u = await db.prisma.user.create({ data: { username: `sd${++n}`, name: 'A', role: 'ADMIN', passwordHash: 'x', active: true } });
  const a = { id: u.id, requestId: `r${n}` };
  const config = eventConfig({
    model: { baseUrl, name: 'junior', systemPromptVersion: 'tutor-v2' },
    schedule: { checkInAt: new Date(Date.now() + 3_600_000).toISOString(), startsAt: new Date(Date.now() + 7_200_000).toISOString(), durationMinutes: 180 },
  });
  const { id } = await createEvent(db.prisma, { slug: `sd${n}`, name: 'Setup test', config }, a);
  return { id, a };
}
const state = async (id: string) => Object.fromEntries((await getSetup(db.prisma, id)).steps.map((s) => [s.key, s.state]));
const blocked = (e: unknown) => e instanceof AppError && e.code === 'setup_incomplete';

test('a fresh event: steps open, launch blocked with reasons; the old Contest ops button is gated too', async () => {
  const { id, a } = await draftEvent();
  const view = await getSetup(db.prisma, id);
  assert.equal(view.canLaunch, false);
  assert.deepEqual(await state(id), { event: 'todo', schedule: 'todo', limits: 'todo', problems: 'blocked', participants: 'blocked', access: 'todo', launch: 'blocked' });
  const launchIssues = view.steps.at(-1)!.issues.map((i) => i.text).join(' | ');
  assert.match(launchIssues, /contest problem[\s\S]*participant CSV/);
  await assert.rejects(controlContest(db.prisma, id, { action: 'open_checkin', reason: 'go' }, a), blocked);
  assert.equal((await db.prisma.event.findUniqueOrThrow({ where: { id } })).status, 'DRAFT');
});

test('completing every step (saved from the roadmap) enables the launch, which opens check-in', async () => {
  const { id, a } = await draftEvent();
  const ev = await getEvent(db.prisma, id);
  const config = { ...ev.config, model: { ...ev.config.model, baseUrl: 'http://gateway.test' } };
  for (const step of [1, 2, 3, 6]) await updateEvent(db.prisma, id, { config, reason: setupReason(step) }, a);
  await db.prisma.problem.create({
    data: {
      eventId: id, slug: 'p', title: 'P', statement: 's', difficulty: 'EASY', ord: 0, timeLimitMs: 1000, memoryLimitMb: 64, checker: {},
      testCases: { create: [{ visibility: 'VISIBLE', ord: 0, input: '1', expectedOutput: '1' }, { visibility: 'HIDDEN', ord: 0, input: '2', expectedOutput: '2' }] },
    },
  });
  await importParticipants(db.prisma, { eventId: id, rows: [{ name: 'One', enrolmentNo: `SD${n}A` }] }, a);
  const view = await getSetup(db.prisma, id);
  assert.deepEqual(view.steps.map((s) => s.state), ['done', 'done', 'done', 'todo', 'done', 'done', 'todo'].map((s, i) => (i === 3 ? view.steps[3]!.state : s)));
  assert.equal(view.steps[3]!.issues.every((i) => i.level !== 'required'), true, 'problems: only the calibration warning left');
  assert.equal(view.canLaunch, true);
  await controlContest(db.prisma, id, { action: 'open_checkin', reason: 'launch' }, a);
  const after = await getSetup(db.prisma, id);
  assert.equal(after.launched, true);
  assert.equal(after.steps.at(-1)!.state, 'done');
});

test('schedule errors are required: check-in after the start, freeze as long as the contest, start in the past', async () => {
  const { id, a } = await draftEvent('http://gateway.test');
  const ev = await getEvent(db.prisma, id);
  const past = new Date(Date.now() - 60_000).toISOString();
  await updateEvent(db.prisma, id, {
    config: { ...ev.config, schedule: { checkInAt: new Date(Date.now() + 1e7).toISOString(), startsAt: past, durationMinutes: 30, freezeMinutes: 30 } },
    reason: setupReason(2),
  }, a);
  const texts = (await getSetup(db.prisma, id)).steps[1]!.issues.filter((i) => i.level === 'required').map((i) => i.text).join(' | ');
  assert.match(texts, /after the start/);
  assert.match(texts, /freeze/);
  assert.match(texts, /in the past/);
});

test('dashboards report the same numbers as direct counts', async () => {
  const { id, a } = await draftEvent('http://gateway.test');
  await importParticipants(db.prisma, { eventId: id, rows: [{ name: 'X', enrolmentNo: `DB${n}A` }, { name: 'Y', enrolmentNo: `DB${n}B` }] }, a);
  const platform = await platformDashboard(db.prisma);
  assert.equal(platform.events.total, await db.prisma.event.count());
  assert.equal(platform.events.draft, await db.prisma.event.count({ where: { status: 'DRAFT' } }));
  assert.equal(platform.participants.total, await db.prisma.participant.count());
  assert.ok(platform.recent.some((e) => e.id === id && e.participants === 2 && e.setupTotal === 7));
  const one = await eventDashboard(db.prisma, id);
  assert.equal(one.participants.total, 2);
  assert.equal(one.participants.registered, 2);
  assert.equal(one.tutor.questions, 0);
  assert.equal(one.tokensUsed, 0);
  assert.doesNotMatch(JSON.stringify(platform), /DB\d+A|"X"/, 'no personal data');
});
