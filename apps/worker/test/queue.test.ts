/**
 * The judge queue (ADR-025) on PGlite with a fake CodeRunner: which tests each kind runs, limits with the language
 * multiplier, verdict rows, retries, dead letters and the stuck-run sweep.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import type { RunRequest, RunResult } from '@codehaunt/contracts';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { claim, judgeLoop, PROXY_REFUSAL_MARKER, judgeSubmission, MAX_ATTEMPTS, requeueStuck, RETRY_DELAY_MS, RUNNING_TIMEOUT_MS, runCalibration } from '../src/queue.ts';
import type { CodeRunner } from '../src/sandbox/code-runner.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

const silent = () => {};

function fakeRunner(behaviour: 'ok' | 'throw' | 'ie' | 'refused' = 'ok') {
  const seen: RunRequest[] = [];
  const runner: CodeRunner = {
    async run(request) {
      seen.push(request);
      if (behaviour === 'throw') throw new Error('docker-proxy refused');
      if (behaviour === 'ie' || behaviour === 'refused') {
        const internalError = behaviour === 'ie' ? 'unparseable runner reply: {"forged"' : 'runner produced no output (exit 125): Error response from daemon: codehaunt docker-proxy: refused';
        return { verdict: 'IE', testsPassed: 0, testsTotal: request.tests.length, maxTimeMs: 0, maxMemoryKb: 0, compileLog: '', results: [], internalError };
      }
      const result: RunResult = {
        verdict: 'AC', testsPassed: request.tests.length, testsTotal: request.tests.length, maxTimeMs: 12.6, maxMemoryKb: 2048.4,
        compileLog: '', results: request.tests.map((t) => ({ testId: t.id, verdict: 'AC', timeMs: 1, memoryKb: 1, outputExcerpt: t.expectedOutput })),
      };
      return result;
    },
  };
  return { runner, seen };
}

let n = 0;
async function queued(kind: 'SAMPLE' | 'SUBMIT', language: 'JAVA' | 'CPP' = 'JAVA') {
  const i = ++n;
  const event = await db.prisma.event.create({
    data: { slug: `q${i}`, name: 'Q', config: {
      branding: { title: 'Q' }, schedule: { checkInAt: '2026-11-07T09:00:00+05:30', startsAt: '2026-11-07T10:00:00+05:30' },
      model: { baseUrl: 'http://g.test', name: 'junior', systemPromptVersion: 'v1' }, judge: { rubricVersion: 'r1' }, consent: { text: 'ok' },
    } },
  });
  const problem = await db.prisma.problem.create({
    data: {
      eventId: event.id, slug: 'p', title: 'P', statement: 's', difficulty: 'EASY', ord: 0, timeLimitMs: 1000, memoryLimitMb: 64,
      checker: { kind: 'caseInsensitive' },
      testCases: { create: [
        { visibility: 'VISIBLE', ord: 0, input: 'v', expectedOutput: 'v' },
        { visibility: 'HIDDEN', ord: 0, input: 'h1', expectedOutput: 'h1' },
        { visibility: 'HIDDEN', ord: 1, input: 'h2', expectedOutput: 'h2' },
      ] },
    },
  });
  const user = await db.prisma.user.create({ data: { username: `qu${i}`, name: 'U', role: 'PARTICIPANT', passwordHash: 'x' } });
  const participant = await db.prisma.participant.create({ data: { eventId: event.id, userId: user.id, enrolmentNo: `Q${i}` } });
  const session = await db.prisma.chatSession.create({ data: { participantId: participant.id, problemId: problem.id, language } });
  const version = await db.prisma.codeVersion.create({ data: { chatSessionId: session.id, language, source: 'class Main {}' } });
  const sub = await db.prisma.submission.create({
    data: { participantId: participant.id, problemId: problem.id, codeVersionId: version.id, kind, idempotencyKey: `k${i}` },
  });
  return { sub, problem };
}

async function drain() {
  while (await claim(db.prisma, 'submissions')) { /* clear rows left by earlier tests */ }
}

test('a sample runs the visible tests only; a submission runs all, with the language multiplier', async () => {
  await drain();
  const { runner, seen } = fakeRunner();
  const sample = await queued('SAMPLE');
  const id = await claim(db.prisma, 'submissions');
  assert.equal(id, sample.sub.id);
  await judgeSubmission(db.prisma, runner, id!, silent);
  assert.deepEqual(seen[0]!.tests.map((t) => t.input), ['v']);
  assert.equal(seen[0]!.limits.timeLimitMs, 2000, 'Java ×2');

  const submit = await queued('SUBMIT', 'CPP');
  await judgeSubmission(db.prisma, runner, (await claim(db.prisma, 'submissions'))!, silent);
  assert.deepEqual(seen[1]!.tests.map((t) => t.input).sort(), ['h1', 'h2', 'v']);
  assert.equal(seen[1]!.limits.timeLimitMs, 1000);
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: submit.sub.id }, include: { verdict: true } });
  assert.equal(row.status, 'DONE');
  assert.deepEqual([row.verdict?.verdict, row.verdict?.maxTimeMs, row.verdict?.maxMemoryKb], ['AC', 13, 2048]);
});

test('a failing run is retried once after a delay, then becomes FAILED', async () => {
  await drain();
  const { runner } = fakeRunner('throw');
  const { sub } = await queued('SUBMIT');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const id = await claim(db.prisma, 'submissions');
    assert.equal(id, sub.id);
    await judgeSubmission(db.prisma, runner, id!, silent);
    if (attempt < MAX_ATTEMPTS) {
      assert.equal(await claim(db.prisma, 'submissions'), null, 'not claimable during the retry delay');
      await db.prisma.submission.update({ where: { id: sub.id }, data: { startedAt: new Date(Date.now() - RETRY_DELAY_MS - 1000) } });
    }
  }
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: sub.id } });
  assert.deepEqual([row.status, row.attempts], ['FAILED', 2]);
  assert.equal(await claim(db.prisma, 'submissions'), null);
});

test('a run left RUNNING by a crashed worker is requeued after the timeout', async () => {
  await drain();
  const { sub } = await queued('SAMPLE');
  await claim(db.prisma, 'submissions');
  assert.equal(await requeueStuck(db.prisma, new Date()), 0, 'not stuck yet');
  assert.equal(await requeueStuck(db.prisma, new Date(Date.now() + RUNNING_TIMEOUT_MS + 1000)), 1);
  assert.equal((await db.prisma.submission.findUniqueOrThrow({ where: { id: sub.id } })).status, 'QUEUED');
});

test('calibration runs every test and stores the full result for organizers', async () => {
  const { problem } = await queued('SAMPLE');
  await drain();
  const run = await db.prisma.calibrationRun.create({ data: { problemId: problem.id, language: 'CPP', kind: 'REFERENCE', source: 'int main(){}', requestedBy: 'admin' } });
  const { runner, seen } = fakeRunner();
  await runCalibration(db.prisma, runner, (await claim(db.prisma, 'calibration_runs'))!, silent);
  assert.equal(seen[0]!.tests.length, 3);
  const row = await db.prisma.calibrationRun.findUniqueOrThrow({ where: { id: run.id } });
  assert.equal(row.status, 'DONE');
  assert.equal((row.result as { verdict: string }).verdict, 'AC');
});

test('the loop judges queued work and stops cleanly', async () => {
  await drain();
  const { runner } = fakeRunner();
  const a = await queued('SAMPLE');
  const b = await queued('SUBMIT');
  const stop = new AbortController();
  const loop = judgeLoop(db.prisma, runner, { concurrency: 1, pollMs: 10, log: silent }, stop.signal);
  for (let i = 0; i < 200; i++) {
    const done = await db.prisma.submission.count({ where: { id: { in: [a.sub.id, b.sub.id] }, status: 'DONE' } });
    if (done === 2) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  stop.abort();
  await loop;
  assert.equal(await db.prisma.submission.count({ where: { id: { in: [a.sub.id, b.sub.id] }, status: 'DONE' } }), 2);
});

async function claimAfterDelay(id: string) {
  await db.prisma.submission.update({ where: { id }, data: { startedAt: new Date(Date.now() - RETRY_DELAY_MS - 1000) } });
  return claim(db.prisma, 'submissions');
}

test('a submit judged IE is re-checked once; the second IE is its verdict and opens a JUDGE_IE incident', async () => {
  await drain();
  const { runner, seen } = fakeRunner('ie');
  const { sub } = await queued('SUBMIT');
  await judgeSubmission(db.prisma, runner, (await claim(db.prisma, 'submissions'))!, silent);
  let row = await db.prisma.submission.findUniqueOrThrow({ where: { id: sub.id }, include: { verdict: true } });
  assert.deepEqual([row.status, row.attempts, row.verdict], ['QUEUED', 0, null]);
  assert.match(row.firstInternalError!, /forged/);
  assert.equal(await claim(db.prisma, 'submissions'), null, 'the re-check waits for the retry delay');
  assert.equal(await db.prisma.incident.count({ where: { submissionId: sub.id } }), 0);

  await judgeSubmission(db.prisma, runner, (await claimAfterDelay(sub.id))!, silent);
  assert.equal(seen.length, 2);
  row = await db.prisma.submission.findUniqueOrThrow({ where: { id: sub.id }, include: { verdict: true } });
  assert.deepEqual([row.status, row.verdict?.verdict], ['DONE', 'IE']);
  const incidents = await db.prisma.incident.findMany({ where: { submissionId: sub.id } });
  assert.deepEqual(incidents.map((i) => [i.kind, i.status, i.participantId]), [['JUDGE_IE', 'OPEN', sub.participantId]]);
  assert.match((incidents[0]!.detail as { firstInternalError: string }).firstInternalError, /forged/);
});

test('an IE on the re-check that turns out fine is just the verdict, no incident', async () => {
  await drain();
  const { sub } = await queued('SUBMIT');
  await judgeSubmission(db.prisma, fakeRunner('ie').runner, (await claim(db.prisma, 'submissions'))!, silent);
  await judgeSubmission(db.prisma, fakeRunner('ok').runner, (await claimAfterDelay(sub.id))!, silent);
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: sub.id }, include: { verdict: true } });
  assert.equal(row.verdict?.verdict, 'AC');
  assert.equal(await db.prisma.incident.count({ where: { submissionId: sub.id } }), 0);
});

test('a sample run with IE is not re-checked; each docker-proxy refusal opens a PROXY_REFUSAL incident', async () => {
  await drain();
  const sample = await queued('SAMPLE');
  await judgeSubmission(db.prisma, fakeRunner('refused').runner, (await claim(db.prisma, 'submissions'))!, silent);
  const row = await db.prisma.submission.findUniqueOrThrow({ where: { id: sample.sub.id }, include: { verdict: true } });
  assert.deepEqual([row.status, row.verdict?.verdict], ['DONE', 'IE']);
  assert.deepEqual((await db.prisma.incident.findMany({ where: { submissionId: sample.sub.id } })).map((i) => i.kind), ['PROXY_REFUSAL']);

  const submit = await queued('SUBMIT');
  const { runner } = fakeRunner('refused');
  await judgeSubmission(db.prisma, runner, (await claim(db.prisma, 'submissions'))!, silent);
  await judgeSubmission(db.prisma, runner, (await claimAfterDelay(submit.sub.id))!, silent);
  const kinds = (await db.prisma.incident.findMany({ where: { submissionId: submit.sub.id } })).map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['JUDGE_IE', 'PROXY_REFUSAL', 'PROXY_REFUSAL'], 'one per refused run: first try and re-check');
  assert.ok(PROXY_REFUSAL_MARKER.length > 0);
});
