/**
 * Contest operations on PGlite (WP-05): clock controls and their effect on prompts and submissions, extend, extra
 * time, top-ups, disqualification, the leaderboard and projector freeze, results states and incident actions.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { createSession, resolveSession } from '@codehaunt/auth';
import { ProjectorView } from '@codehaunt/contracts';
import { tokenBalance } from '@codehaunt/db';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { participantContext } from '../src/server/contest.ts';
import {
  controlContest, extendContest, getContestStatus, newProjectorLink, participantAction, publishResults, setExtraTime, topUp,
} from '../src/server/contest-ops-service.ts';
import { AppError } from '../src/server/errors.ts';
import { isLocked } from '../src/server/event-service.ts';
import { actOnIncident, listIncidents } from '../src/server/incident-service.ts';
import { adminLeaderboard, projectorView, resultsCsv } from '../src/server/leaderboard-service.ts';
import { participantLog } from '../src/server/participant-log-service.ts';
import { startPrompt } from '../src/server/prompt-service.ts';
import { createRun } from '../src/server/submission-service.ts';
import { fakeModel, HIDDEN_OUTPUT, setup } from './support/fixtures.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const MIN = 60_000;

async function world(status: 'CHECK_IN' | 'RUNNING' = 'RUNNING') {
  const f = await setup(db.prisma, { status });
  const actor = { id: f.admin.id, requestId: randomUUID() };
  const session = await db.prisma.chatSession.create({ data: { participantId: f.participant.id, problemId: f.problem.id, language: 'PYTHON' } });
  const version = await db.prisma.codeVersion.create({ data: { chatSessionId: session.id, language: 'PYTHON', source: 'print(3)' } });
  return { ...f, actor, version };
}

/** A judged SUBMIT, as the worker would leave it. */
async function judged(f: Awaited<ReturnType<typeof world>>, verdict: string, minute: number, at = new Date()) {
  return db.prisma.submission.create({
    data: {
      participantId: f.participant.id, problemId: f.problem.id, codeVersionId: f.version.id, kind: 'SUBMIT', status: 'DONE',
      idempotencyKey: randomUUID(), contestMs: minute * MIN, createdAt: at,
      verdict: { create: { verdict, testsPassed: verdict === 'AC' ? 2 : 0, testsTotal: 2, maxTimeMs: 20, maxMemoryKb: 9000, compileLog: '', results: [], createdAt: at } },
    },
  });
}

const run = (f: Awaited<ReturnType<typeof world>>) => async () =>
  createRun(db.prisma, await f.ctx(), { problemId: f.problem.id, codeVersionId: f.version.id, kind: 'SUBMIT', idempotencyKey: randomUUID() });
const prompt = (f: Awaited<ReturnType<typeof world>>) => async () =>
  startPrompt({ prisma: db.prisma, model: fakeModel().model, now: () => new Date(), requestId: 'r' }, await f.ctx(), {
    problemId: f.problem.id, prompt: 'add', idempotencyKey: randomUUID(),
  });

test('start sets lockedAt and RUNNING in one audited step; a second start is refused', async () => {
  const f = await world('CHECK_IN');
  const now = new Date();
  const status = await controlContest(db.prisma, f.event.id, { action: 'start', reason: 'on time' }, f.actor, now);
  assert.equal(status.status, 'RUNNING');
  assert.equal(status.startedAt, now.toISOString());
  const event = await db.prisma.event.findUniqueOrThrow({ where: { id: f.event.id } });
  assert.equal(event.lockedAt?.toISOString(), now.toISOString());
  assert.ok(isLocked(event));
  const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: 'contest.start', targetId: f.event.id } });
  assert.deepEqual([audit.actorId, audit.reason], [f.admin.id, 'on time']);
  await assert.rejects(controlContest(db.prisma, f.event.id, { action: 'start', reason: 'again' }, f.actor), code('wrong_state'));
});

test('pause blocks prompts and submits at once and freezes the clock; resume and extend push the end back', async () => {
  const f = await world();
  const t0 = new Date();
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: new Date(t0.getTime() - 10 * MIN) } });
  await (await run(f))(); // works while running

  const paused = await controlContest(db.prisma, f.event.id, { action: 'pause', reason: 'power cut' }, f.actor, t0);
  assert.equal(paused.phase, 'paused');
  await assert.rejects(run(f)(), code('contest_not_running'));
  await assert.rejects(prompt(f)(), code('contest_not_running'));

  const later = await getContestStatus(db.prisma, f.event.id, new Date(t0.getTime() + 5 * MIN));
  assert.equal(later.msLeft, paused.msLeft, 'the clock stands still while paused');

  const resumed = await controlContest(db.prisma, f.event.id, { action: 'resume', reason: 'power back' }, f.actor, new Date(t0.getTime() + 5 * MIN));
  assert.equal(new Date(resumed.endsAt).getTime(), t0.getTime() - 10 * MIN + 180 * MIN + 5 * MIN);

  const extended = await extendContest(db.prisma, f.event.id, { minutes: 15, reason: 'lost time', idempotencyKey: randomUUID() }, f.actor, new Date(t0.getTime() + 5 * MIN));
  assert.equal(new Date(extended.endsAt).getTime() - new Date(resumed.endsAt).getTime(), 15 * MIN);
  assert.equal(extended.durationMinutes, 195);
  const actions = (await db.prisma.auditLog.findMany({ where: { targetId: f.event.id }, orderBy: { id: 'asc' } })).map((a) => [a.action, a.reason]);
  assert.deepEqual(actions, [['contest.pause', 'power cut'], ['contest.resume', 'power back'], ['contest.extended', 'lost time']]);
});

test('a submission records the contest time elapsed, pauses excluded', async () => {
  const f = await world();
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: new Date(Date.now() - 30 * MIN), pausedMs: 10 * MIN } });
  const r = await (await run(f))();
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: r.submissionId } });
  assert.ok(Math.abs(row.contestMs! - 20 * MIN) < 5000, `contestMs ${row.contestMs}`);
});

test('extra time keeps one participant going after the end; end stops everyone', async () => {
  const f = await world();
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: new Date(Date.now() - 181 * MIN) } });
  await assert.rejects(run(f)(), code('contest_not_running'));
  await setExtraTime(db.prisma, f.participant.id, { minutes: 20, reason: 'accommodation' }, f.actor);
  await (await run(f))();
  await controlContest(db.prisma, f.event.id, { action: 'end', reason: 'done' }, f.actor);
  await assert.rejects(run(f)(), code('contest_not_running'));
  assert.ok(await db.prisma.auditLog.findFirst({ where: { action: 'participant.extra_time', targetId: f.participant.id, reason: 'accommodation' } }));
});

test('a top-up is idempotent per key and audit-logged', async () => {
  const f = await world();
  const before = await tokenBalance(db.prisma, f.participant.id);
  const req = { tokens: 5000, reason: 'gateway glitch', idempotencyKey: randomUUID() };
  assert.deepEqual(await topUp(db.prisma, f.participant.id, req, f.actor), { added: 5000 });
  assert.deepEqual(await topUp(db.prisma, f.participant.id, req, f.actor), { added: 0 });
  assert.equal(await tokenBalance(db.prisma, f.participant.id), before + 5000);
  assert.equal(await db.prisma.auditLog.count({ where: { action: 'participant.topped_up', targetId: f.participant.id } }), 1);
});

test('disqualify ends the session and shuts the contest; reinstate undoes it; deactivate turns the account off', async () => {
  const f = await world();
  const { token } = await createSession(db.prisma, { userId: f.user.id });
  await participantAction(db.prisma, f.participant.id, { action: 'disqualify', reason: 'phone' }, f.actor);
  assert.equal(await resolveSession(db.prisma, token), null);
  await assert.rejects(participantContext(db.prisma, f.user.id, new Date()), code('forbidden'));
  await assert.rejects(participantAction(db.prisma, f.participant.id, { action: 'disqualify', reason: 'x' }, f.actor), code('wrong_state'));
  await db.prisma.participant.update({ where: { id: f.participant.id }, data: { checkedInAt: new Date() } });
  await participantAction(db.prisma, f.participant.id, { action: 'reinstate', reason: 'appeal upheld' }, f.actor);
  await participantContext(db.prisma, f.user.id, new Date());

  await participantAction(db.prisma, f.participant.id, { action: 'deactivate', reason: 'shared password' }, f.actor);
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).active, false);
  await participantAction(db.prisma, f.participant.id, { action: 'reinstate', reason: 'sorted' }, f.actor);
  assert.equal((await db.prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).active, true);
  const actions = (await db.prisma.auditLog.findMany({ where: { targetId: f.participant.id }, orderBy: { id: 'asc' } })).map((a) => a.action);
  assert.deepEqual(actions, ['participant.disqualify', 'participant.reinstate', 'participant.deactivate', 'participant.reinstate']);
});

test('leaderboard scores a counted IE as WA; reversing the incident restores the points, audit-logged', async () => {
  const f = await world();
  const ie = await judged(f, 'IE', 1);
  await judged(f, 'AC', 10);
  const incident = await db.prisma.incident.create({ data: { eventId: f.event.id, participantId: f.participant.id, submissionId: ie.id, kind: 'JUDGE_IE', detail: { internalError: '<b>forged</b>' } } });
  let board = await adminLeaderboard(db.prisma, f.event.id);
  const row = () => board.standings.find((s) => s.participantId === f.participant.id)!;
  assert.equal(row().problems[0]!.points, 500 - 20 - 50);
  const list = await listIncidents(db.prisma, f.event.id, { role: 'ADMIN' });
  assert.equal(list.incidents[0]!.internalError, '<b>forged</b>', 'plain string; the UI renders it as text');
  const forOrganizer = await listIncidents(db.prisma, f.event.id, { role: 'ORGANIZER' });
  assert.deepEqual([forOrganizer.incidents[0]!.internalError, forOrganizer.incidents[0]!.textHidden], [null, true], 'it can echo hidden input: admins only');

  await actOnIncident(db.prisma, incident.id, { action: 'reverse_penalty', reason: 'our fault' }, f.actor);
  board = await adminLeaderboard(db.prisma, f.event.id);
  assert.equal(row().problems[0]!.points, 480);
  const audit = await db.prisma.auditLog.findFirstOrThrow({ where: { action: 'incident.reverse_penalty', targetId: incident.id } });
  assert.deepEqual([audit.actorId, audit.reason], [f.admin.id, 'our fault']);
});

test('re-judge from an incident clears the verdict and queues the submission for a fresh check', async () => {
  const f = await world();
  const ie = await judged(f, 'IE', 1);
  const incident = await db.prisma.incident.create({ data: { eventId: f.event.id, participantId: f.participant.id, submissionId: ie.id, kind: 'JUDGE_IE', detail: {} } });
  await actOnIncident(db.prisma, incident.id, { action: 'rejudge', reason: 'node fixed' }, f.actor);
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: ie.id }, include: { verdict: true } });
  assert.deepEqual([row.status, row.verdict, row.firstInternalError, row.attempts], ['QUEUED', null, null, 0]);
  await assert.rejects(actOnIncident(db.prisma, incident.id, { action: 'rejudge', reason: 'again' }, f.actor), code('wrong_state'));
});

test('the projector shows rank, name, solved only, and nothing that happened after the freeze', async () => {
  const f = await world();
  const start = new Date(Date.now() - 170 * MIN); // 180 min contest, 30 min freeze: frozen since 20 min ago
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: start } });
  const { path } = await newProjectorLink(db.prisma, f.event.id, { reason: 'projector' }, f.actor);
  const token = path.split('/').pop()!;
  await judged(f, 'AC', 165, new Date(Date.now() - 5 * MIN));

  const view = await projectorView(db.prisma, token);
  assert.ok(ProjectorView.safeParse(view).success);
  assert.equal(view.frozen, true);
  assert.equal(view.rows[0]!.solved, 0, 'the projector does not move during the freeze');
  assert.equal(JSON.stringify(view).includes(f.participant.enrolmentNo), false);
  assert.equal((await adminLeaderboard(db.prisma, f.event.id)).standings[0]!.solved, 1, 'the admin board keeps updating');

  await assert.rejects(projectorView(db.prisma, 'wrong-token'), code('not_found'));
  const { path: second } = await newProjectorLink(db.prisma, f.event.id, { reason: 'projector' }, f.actor);
  await assert.rejects(projectorView(db.prisma, token), code('not_found'), 'a new link replaces the old one');
  await projectorView(db.prisma, second.split('/').pop()!);
});

test('results: provisional after the end, final only after the appeal window; projector shows totals once final', async () => {
  const f = await world();
  await judged(f, 'AC', 5);
  await assert.rejects(publishResults(db.prisma, f.event.id, { action: 'provisional', reason: 'x' }, f.actor), code('wrong_state'));
  await controlContest(db.prisma, f.event.id, { action: 'end', reason: 'time' }, f.actor);
  const t = new Date();
  const prov = await publishResults(db.prisma, f.event.id, { action: 'provisional', reason: 'scores in' }, f.actor, t);
  assert.equal(prov.appealEndsAt, new Date(t.getTime() + 30 * MIN).toISOString());
  await assert.rejects(publishResults(db.prisma, f.event.id, { action: 'final', reason: 'x' }, f.actor, new Date(t.getTime() + 29 * MIN)), code('appeal_window'));
  const fin = await publishResults(db.prisma, f.event.id, { action: 'final', reason: 'no appeals' }, f.actor, new Date(t.getTime() + 31 * MIN));
  assert.deepEqual([fin.status, fin.resultsState], ['PUBLISHED', 'FINAL']);
  const { path } = await newProjectorLink(db.prisma, f.event.id, { reason: 'projector' }, f.actor);
  const view = await projectorView(db.prisma, path.split('/').pop()!);
  assert.equal(view.final, true);
  assert.equal(typeof view.rows[0]!.total, 'number');
});

test('results CSV neutralises formula cells and is audit-logged', async () => {
  const f = await world();
  await db.prisma.user.update({ where: { id: f.user.id }, data: { name: '=HYPERLINK("x")' } });
  const csv = await resultsCsv(db.prisma, f.event.id, f.actor);
  assert.match(csv, /^rank,name,enrolment/);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(await db.prisma.auditLog.findFirst({ where: { action: 'results.exported', targetId: f.event.id } }));
});

test('the participant log never carries hidden-test output', async () => {
  const f = await world();
  const hidden = await db.prisma.testCase.findFirstOrThrow({ where: { problemId: f.problem.id, visibility: 'HIDDEN' } });
  const visible = await db.prisma.testCase.findFirstOrThrow({ where: { problemId: f.problem.id, visibility: 'VISIBLE' } });
  await db.prisma.submission.create({
    data: {
      participantId: f.participant.id, problemId: f.problem.id, codeVersionId: f.version.id, kind: 'SUBMIT', status: 'DONE', idempotencyKey: randomUUID(),
      verdict: { create: { verdict: 'WA', testsPassed: 1, testsTotal: 2, maxTimeMs: 1, maxMemoryKb: 1, compileLog: '', results: [
        { testId: visible.id, verdict: 'AC', timeMs: 1, memoryKb: 1, outputExcerpt: '3' },
        { testId: hidden.id, verdict: 'WA', timeMs: 1, memoryKb: 1, outputExcerpt: HIDDEN_OUTPUT },
      ] } },
    },
  });
  const log = await participantLog(db.prisma, f.participant.id);
  assert.equal(JSON.stringify(log).includes(HIDDEN_OUTPUT), false);
  assert.deepEqual(log.submissions[0]!.verdict!.tests.map((t) => [t.hidden, t.outputExcerpt]), [[false, '3'], [true, undefined]]);
});

/** A running event whose 180-min contest started `minutes` ago (30-min freeze), with a projector link. */
async function frozenWorld(minutes: number) {
  const f = await world();
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: new Date(Date.now() - minutes * MIN) } });
  const { path } = await newProjectorLink(db.prisma, f.event.id, { reason: 'projector' }, f.actor);
  return { ...f, token: path.split('/').pop()! };
}

test('R13-1: pausing or extending during the freeze never moves the projector cut', async () => {
  const f = await frozenWorld(170); // frozen since 20 min ago
  await judged(f, 'AC', 165, new Date(Date.now() - 5 * MIN));
  await controlContest(db.prisma, f.event.id, { action: 'pause', reason: 'p' }, f.actor);
  // An hour of pause later the live freeze time would be after that AC; the stored cut is not.
  const later = new Date(Date.now() + 60 * MIN);
  assert.equal((await projectorView(db.prisma, f.token, later)).rows[0]!.solved, 0);
  await controlContest(db.prisma, f.event.id, { action: 'resume', reason: 'r' }, f.actor, later);
  await extendContest(db.prisma, f.event.id, { minutes: 60, reason: 'e', idempotencyKey: randomUUID() }, f.actor, later);
  const view = await projectorView(db.prisma, f.token, later);
  assert.deepEqual([view.frozen, view.rows[0]!.solved], [true, 0], 'an extend during the freeze does not reopen the board');
});

test('R13-1: the projector stores the cut the first time it sees the freeze', async () => {
  const f = await frozenWorld(170);
  await projectorView(db.prisma, f.token);
  const stored = (await db.prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).frozenAt;
  assert.ok(stored);
  // Moving the end afterwards (a raw extend) leaves the cut alone.
  await db.prisma.event.update({ where: { id: f.event.id }, data: { pausedMs: 90 * MIN } });
  await projectorView(db.prisma, f.token);
  assert.equal((await db.prisma.event.findUniqueOrThrow({ where: { id: f.event.id } })).frozenAt?.getTime(), stored.getTime());
});

test('R13-2: overrides and penalty reversals made during the freeze do not move the projector', async () => {
  const f = await frozenWorld(170);
  // A second participant in the same event, solved before the freeze.
  const user = await db.prisma.user.create({ data: { username: `q${randomUUID().slice(0, 8)}`, name: 'Q', role: 'PARTICIPANT', passwordHash: 'x', active: true } });
  const q = await db.prisma.participant.create({ data: { eventId: f.event.id, userId: user.id, enrolmentNo: `Q${randomUUID().slice(0, 6)}`, status: 'CHECKED_IN' } });
  const before = new Date(Date.now() - 30 * MIN);
  const ie = await judged(f, 'IE', 100, before);
  await judged(f, 'AC', 101, before);
  const qs = await db.prisma.chatSession.create({ data: { participantId: q.id, problemId: f.problem.id, language: 'PYTHON' } });
  const qv = await db.prisma.codeVersion.create({ data: { chatSessionId: qs.id, language: 'PYTHON', source: 'x' } });
  await db.prisma.submission.create({
    data: {
      participantId: q.id, problemId: f.problem.id, codeVersionId: qv.id, kind: 'SUBMIT', status: 'DONE', idempotencyKey: randomUUID(), contestMs: 101 * MIN, createdAt: before,
      verdict: { create: { verdict: 'AC', testsPassed: 2, testsTotal: 2, maxTimeMs: 20, maxMemoryKb: 9000, compileLog: '', results: [], createdAt: before } },
    },
  });
  const ranks = async () => (await projectorView(db.prisma, f.token)).rows.map((r) => [r.name, r.rank]);
  const start = await ranks();
  const incident = await db.prisma.incident.create({ data: { eventId: f.event.id, participantId: f.participant.id, submissionId: ie.id, kind: 'JUDGE_IE', detail: {} } });
  await actOnIncident(db.prisma, incident.id, { action: 'reverse_penalty', reason: 'ours' }, f.actor);
  await db.prisma.scoreOverride.create({ data: { participantId: f.participant.id, component: 'correctness', value: 100, reason: 'x', actorId: f.admin.id } });
  assert.deepEqual(await ranks(), start);
  const live = (await adminLeaderboard(db.prisma, f.event.id)).standings.find((s) => s.participantId === f.participant.id)!;
  assert.equal(live.correctness, 100, 'the admin board applies them at once');
});

test('R13-3: a re-judge clears an earlier penalty reversal', async () => {
  const f = await world();
  const ie = await judged(f, 'IE', 1);
  const incident = await db.prisma.incident.create({ data: { eventId: f.event.id, participantId: f.participant.id, submissionId: ie.id, kind: 'JUDGE_IE', detail: {} } });
  await actOnIncident(db.prisma, incident.id, { action: 'reverse_penalty', reason: 'ours' }, f.actor);
  await actOnIncident(db.prisma, incident.id, { action: 'rejudge', reason: 'fixed' }, f.actor);
  assert.equal((await db.prisma.incident.findUniqueOrThrow({ where: { id: incident.id } })).penaltyReversed, false);
});

test('R13-4: concurrent staff actions on one participant serialise', async () => {
  const f = await world();
  const results = await Promise.allSettled([
    participantAction(db.prisma, f.participant.id, { action: 'disqualify', reason: 'a' }, f.actor),
    participantAction(db.prisma, f.participant.id, { action: 'disqualify', reason: 'b' }, f.actor),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(await db.prisma.auditLog.count({ where: { action: 'participant.disqualify', targetId: f.participant.id } }), 1);
});

test('R13-5: a retried extend adds nothing; the projector link records its reason', async () => {
  const f = await world();
  const req = { minutes: 10, reason: 'retry', idempotencyKey: randomUUID() };
  await extendContest(db.prisma, f.event.id, req, f.actor);
  const again = await extendContest(db.prisma, f.event.id, req, f.actor);
  assert.equal(again.durationMinutes, 190);
  await newProjectorLink(db.prisma, f.event.id, { reason: 'room 2' }, f.actor);
  assert.ok(await db.prisma.auditLog.findFirst({ where: { action: 'projector.link_created', targetId: f.event.id, reason: 'room 2' } }));
});
