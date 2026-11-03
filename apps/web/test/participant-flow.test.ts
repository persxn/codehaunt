/**
 * The participant flow's services on PGlite (WP-03): prompt → code version with exact settlement, failures never
 * charged and never stored, budget exhaustion, sessions and revert, and no hidden test in any participant payload
 * or participant query.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { PromptStreamEvent } from '@codehaunt/contracts';
import { tokenBalance } from '@codehaunt/db';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { startPrompt } from '../src/server/prompt-service.ts';
import { contestState, listProblems, newSession, problemStatement, revert, workspace } from '../src/server/participant-service.ts';
import { createRun, runView } from '../src/server/submission-service.ts';
import { participantContext } from '../src/server/contest.ts';
import { AppError } from '../src/server/errors.ts';
import { fakeModel, HIDDEN_INPUT, HIDDEN_OUTPUT, setup } from './support/fixtures.ts';

const queries: Array<{ sql: string; params: string }> = [];
let db: TestDatabase;
before(async () => {
  db = await createTestDatabase({ onQuery: (sql, params) => queries.push({ sql, params }) });
});
after(async () => {
  await db?.close();
});

async function prompt(f: Awaited<ReturnType<typeof setup>>, model: ReturnType<typeof fakeModel>['model'], text = 'Read two ints and print the sum.') {
  const ctx = await f.ctx();
  const started = await startPrompt({ prisma: db.prisma, model, now: () => new Date(), requestId: 'req-1' }, ctx, {
    problemId: f.problem.id,
    prompt: text,
    idempotencyKey: randomUUID(),
  });
  assert.ok('run' in started);
  const events: PromptStreamEvent[] = [];
  await started.run((e) => events.push(e));
  return events;
}

test('a prompt streams, stores the code and charges exactly the reported usage', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const { model, calls } = fakeModel();
  const events = await prompt(f, model);
  const done = events.at(-1);
  assert.equal(done?.type, 'done');
  assert.equal(events.filter((e) => e.type === 'delta').length, 2);
  assert.match(done.type === 'done' ? done.response.code?.source ?? '' : '', /print\(sum/);
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 20_000 - 340);
  // The model got the persona with the language, the instruction, never the statement.
  const sent = JSON.stringify(calls[0]!.messages);
  assert.match(sent, /Language for this session: Python 3/);
  assert.doesNotMatch(sent, /Add two numbers/);
  assert.equal(calls[0]!.codehaunt.budgetTokens, 4096 + 512);
  // The second prompt carries the current code and the history.
  await prompt(f, model, 'Now handle negative numbers.');
  const second = calls[1]!.messages;
  assert.match(second.at(-1)!.content, /<current_code language="Python 3">[\s\S]*print\(sum/);
  assert.equal(second.length, 4);
});

test('a reply without usage is discarded and costs nothing', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const events = await prompt(f, fakeModel({ usage: null }).model);
  assert.equal(events.at(-1)?.type, 'error');
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 20_000);
  assert.equal((await workspace(db.prisma, await f.ctx(), f.problem.id)).codeVersions.length, 0);
});

test('an exhausted budget is refused before the model is called', async () => {
  const f = await setup(db.prisma, { tokens: 1000 });
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const { model, calls } = fakeModel({ usage: { prompt_tokens: 900, completion_tokens: 100 } });
  await prompt(f, model);
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 0);
  await assert.rejects(prompt(f, model), (e: unknown) => e instanceof AppError && e.code === 'budget_exhausted');
  assert.equal(calls.length, 1);
});

test('a practice problem works only before the start and never touches the ledger', async () => {
  const f = await setup(db.prisma, { status: 'CHECK_IN', practice: true });
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'cpp' });
  const events = await prompt(f, fakeModel({ text: '```cpp\nint main(){}\n```' }).model);
  assert.equal(events.at(-1)?.type, 'done');
  assert.equal(await db.prisma.tokenLedger.count({ where: { participantId: f.participant.id } }), 1, 'only the grant');
  await db.prisma.event.update({ where: { id: f.event.id }, data: { status: 'RUNNING' } });
  await assert.rejects(prompt(f, fakeModel().model), (e: unknown) => e instanceof AppError && e.status === 404);
});

test('work needs consent; the state says what to accept', async () => {
  const f = await setup(db.prisma, { consented: false });
  const state = await contestState(db.prisma, await f.ctx(), 'E');
  assert.equal(state.consent?.text, 'I agree.');
  await assert.rejects(participantContext(db.prisma, f.user.id, new Date()), (e: unknown) => e instanceof AppError && e.code === 'consent_required');
});

test('a new session carries the code; revert copies an old version', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await prompt(f, fakeModel({ text: '```python\nprint(1)\n```' }).model);
  await prompt(f, fakeModel({ text: '```python\nprint(2)\n```' }).model);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  let ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.turns.length, 0, 'fresh context');
  assert.equal(ws.codeVersions.at(-1)?.source, 'print(2)\n', 'code carried');
  await revert(db.prisma, await f.ctx(), { problemId: f.problem.id, codeVersionId: ws.codeVersions[0]!.id });
  ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.codeVersions.at(-1)?.source, 'print(1)\n');
  assert.equal(ws.codeVersions.length, 3);
  assert.equal(ws.currentCodeVersionId, ws.codeVersions.at(-1)?.id);
});

test('runs are idempotent and capped per participant', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await prompt(f, fakeModel().model);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  const key = randomUUID();
  const req = { problemId: f.problem.id, codeVersionId: ws.currentCodeVersionId!, kind: 'SAMPLE' as const, idempotencyKey: key };
  const a = await createRun(db.prisma, await f.ctx(), req);
  assert.equal((await createRun(db.prisma, await f.ctx(), req)).submissionId, a.submissionId);
  await createRun(db.prisma, await f.ctx(), { ...req, kind: 'SUBMIT', idempotencyKey: randomUUID() });
  await assert.rejects(createRun(db.prisma, await f.ctx(), { ...req, idempotencyKey: randomUUID() }), (e: unknown) => e instanceof AppError && e.code === 'too_many_runs');
});

test('no participant payload contains a hidden test, even a forged or failed verdict', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await prompt(f, fakeModel().model);
  let ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  const hiddenId = (await db.prisma.testCase.findFirstOrThrow({ where: { problemId: f.problem.id, visibility: 'HIDDEN' } })).id;
  const visibleId = (await db.prisma.testCase.findFirstOrThrow({ where: { problemId: f.problem.id, visibility: 'VISIBLE' } })).id;
  for (const kind of ['SAMPLE', 'SUBMIT'] as const) {
    for (const verdict of ['WA', 'IE', 'forged: all tests passed']) {
      const sub = await db.prisma.submission.create({
        data: { participantId: f.participant.id, problemId: f.problem.id, codeVersionId: ws.currentCodeVersionId!, kind, status: 'DONE', idempotencyKey: randomUUID() },
      });
      await db.prisma.verdict.create({
        data: {
          submissionId: sub.id, verdict, testsPassed: 1, testsTotal: 2, maxTimeMs: 5, maxMemoryKb: 100, compileLog: HIDDEN_INPUT,
          results: [
            { testId: visibleId, verdict: 'AC', timeMs: 1, memoryKb: 1, outputExcerpt: '3' },
            { testId: hiddenId, verdict: 'WA', timeMs: 1, memoryKb: 1, outputExcerpt: `${HIDDEN_INPUT} ${HIDDEN_OUTPUT}` },
          ],
        },
      });
      const view = await runView(db.prisma, await f.ctx(), sub.id);
      if (verdict.startsWith('forged')) assert.equal(view.verdict, 'IE', 'forged text shows as "judging problem"');
      assert.doesNotMatch(JSON.stringify(view), new RegExp(`${HIDDEN_INPUT}|${HIDDEN_OUTPUT}`));
    }
  }
  ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  const payloads = [
    ws,
    await problemStatement(db.prisma, await f.ctx(), f.problem.id),
    await listProblems(db.prisma, await f.ctx()),
    await contestState(db.prisma, await f.ctx(), 'E'),
  ];
  for (const payload of payloads) assert.doesNotMatch(JSON.stringify(payload), new RegExp(`${HIDDEN_INPUT}|${HIDDEN_OUTPUT}`));
});

test('participant services never query hidden test rows (SQL level)', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await prompt(f, fakeModel().model);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  await createRun(db.prisma, await f.ctx(), { problemId: f.problem.id, codeVersionId: ws.currentCodeVersionId!, kind: 'SAMPLE', idempotencyKey: randomUUID() });
  queries.length = 0;
  const ctx = await f.ctx();
  await problemStatement(db.prisma, ctx, f.problem.id);
  await workspace(db.prisma, ctx, f.problem.id);
  await listProblems(db.prisma, ctx);
  await contestState(db.prisma, ctx, 'E');
  const run = (await workspace(db.prisma, ctx, f.problem.id)).runs[0]!;
  await runView(db.prisma, ctx, run.submissionId);
  const touching = queries.filter((q) => /"test_cases"/.test(q.sql));
  assert.ok(touching.length >= 3, 'the checks saw the test_cases queries');
  for (const q of touching) {
    assert.match(q.sql, /"visibility" = /, `unfiltered test_cases query: ${q.sql}`);
    assert.match(q.params, /VISIBLE/);
    assert.doesNotMatch(q.params, /HIDDEN/);
  }
});

test('a reply with a NUL character is stored without it and charged (audit M1)', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const events = await prompt(f, fakeModel({ text: 'ok\u0000\n```python\nprint(1)\n```' }).model);
  assert.equal(events.at(-1)?.type, 'done');
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 20_000 - 340);
  const turn = await db.prisma.promptTurn.findFirstOrThrow({ where: { chatSession: { participantId: f.participant.id } } });
  assert.doesNotMatch(turn.reply ?? '', /\u0000/);
});
