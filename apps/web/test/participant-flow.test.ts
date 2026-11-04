/**
 * The participant flow's services on PGlite (WP-03, ADR-033): the participant saves their own code; a question to
 * the tutor sends no code and no statement, streams a filtered reply, settles exactly and never changes the code;
 * failures are never charged; budget exhaustion, sessions and revert; no hidden test in any participant payload or
 * participant query.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import type { PromptStreamEvent } from '@codehaunt/contracts';
import { tokenBalance } from '@codehaunt/db';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { startPrompt } from '../src/server/prompt-service.ts';
import {
  CODE_CHARS_PER_PARTICIPANT,
  CODE_SAVES_PER_MINUTE,
  contestState,
  listProblems,
  newSession,
  problemStatement,
  revert,
  saveCode,
  workspace,
} from '../src/server/participant-service.ts';
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

const F = '\x60\x60\x60';

async function save(f: Awaited<ReturnType<typeof setup>>, source = 'print(sum(map(int, input().split())))\n') {
  return saveCode(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python', source });
}

async function prompt(f: Awaited<ReturnType<typeof setup>>, model: ReturnType<typeof fakeModel>['model'], text = 'Why could int overflow here?') {
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

test('a question streams, charges exactly the reported usage and never sends or changes the code', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await save(f, 'SECRET_CODE = 1\n');
  const { model, calls } = fakeModel();
  const events = await prompt(f, model);
  const done = events.at(-1);
  assert.equal(done?.type, 'done');
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 20_000 - 340);
  // The model got the tutor prompt with the language and the question: never the code or the statement (ADR-033).
  const sent = JSON.stringify(calls[0]!.messages);
  assert.match(calls[0]!.messages[0]!.content, /programming tutor[\s\S]*at most 3 lines[\s\S]*writing Python 3/);
  assert.doesNotMatch(sent, /Add two numbers|SECRET_CODE|current_code/);
  assert.equal(calls[0]!.codehaunt.budgetTokens, 4096 + 512);
  // The second question carries the history only.
  await prompt(f, model, 'And for negative numbers?');
  const second = calls[1]!.messages;
  assert.equal(second.length, 4);
  assert.equal(second.at(-1)!.content, 'And for negative numbers?');
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.codeVersions.length, 1, 'replies never add code versions');
  assert.equal(ws.codeVersions[0]!.source, 'SECRET_CODE = 1\n');
});

test('long code in a reply never reaches the participant, but the log keeps it', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const long = Array.from({ length: 12 }, (_, i) => `x${i} = ${i}`).join('\n');
  const reply = `Think about it.\n${F}python\n${long}\n${F}\nGood luck.`;
  const { model, calls } = fakeModel({ text: reply });
  const events = await prompt(f, model);
  const streamed = events.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');
  assert.doesNotMatch(streamed, /x11 = 11/);
  assert.match(streamed, /example removed: too long/);
  const done = events.at(-1);
  assert.equal(done?.type === 'done' && done.response.reply, streamed);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.doesNotMatch(JSON.stringify(ws), /x11 = 11/);
  const stored = await db.prisma.promptTurn.findFirstOrThrow({ where: { chatSession: { participantId: f.participant.id } } });
  assert.match(stored.reply ?? '', /x11 = 11/, 'staff and the judge see the full reply');
  // The model gets back only what the participant saw, so it can't re-send the removed block in pieces.
  await prompt(f, model, 'Show the rest.');
  assert.doesNotMatch(JSON.stringify(calls[1]!.messages), /x11 = 11/);
});

test('the first question on a problem opens its chat in the saved code\'s language', async () => {
  const f = await setup(db.prisma);
  await saveCode(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'cpp', source: 'int main() {}\n' });
  await db.prisma.chatSession.updateMany({ where: { participantId: f.participant.id }, data: { closedAt: new Date() } });
  const { model, calls } = fakeModel();
  assert.equal((await prompt(f, model)).at(-1)?.type, 'done');
  assert.match(calls[0]!.messages[0]!.content, /writing C\+\+/);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.session?.language, 'cpp');
  assert.equal(ws.turns.length, 1);
});

test('saving code: unchanged saves add nothing; the first save opens a chat; languages must be enabled', async () => {
  const f = await setup(db.prisma);
  const a = await save(f, 'print(1)\n');
  assert.equal((await save(f, 'print(1)\n')).id, a.id);
  assert.notEqual((await save(f, 'print(2)\n')).id, a.id);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.ok(ws.session, 'a session exists after the first save');
  assert.equal(ws.codeVersions.length, 2);
  assert.ok(ws.codeVersions.every((v) => v.turnId === null));
  await db.prisma.event.update({ where: { id: f.event.id }, data: { config: { ...f.event.config as object, languages: ['cpp'] } } });
  await assert.rejects(save(f, 'print(3)\n'), (e: unknown) => e instanceof AppError && e.status === 400);
});

test('code saves and reverts are limited per minute and in total (audit R16-2)', async () => {
  const f = await setup(db.prisma);
  const first = await save(f, 'print(0)\n');
  for (let i = 1; i < CODE_SAVES_PER_MINUTE; i++) await save(f, `print(${i % 2})\n#${i}`);
  await assert.rejects(save(f, 'print(99)\n'), (e: unknown) => e instanceof AppError && e.status === 429);
  await assert.rejects(
    revert(db.prisma, await f.ctx(), { problemId: f.problem.id, codeVersionId: first.id }),
    (e: unknown) => e instanceof AppError && e.status === 429,
  );
  // Unchanged saves still answer: the editor saves before every run.
  assert.ok((await save(f, `print(${(CODE_SAVES_PER_MINUTE - 1) % 2})\n#${CODE_SAVES_PER_MINUTE - 1}`)).id);
  // Older than a minute: the rate limit clears, the total cap does not.
  const { participantId } = await f.ctx();
  await db.prisma.codeVersion.updateMany({ where: { chatSession: { participantId } }, data: { createdAt: new Date(Date.now() - 120_000) } });
  assert.ok((await save(f, 'print(100)\n')).id);
  const session = await db.prisma.chatSession.findFirstOrThrow({ where: { participantId } });
  await db.prisma.codeVersion.create({
    data: { chatSessionId: session.id, language: 'PYTHON', source: 'x'.repeat(CODE_CHARS_PER_PARTICIPANT), createdAt: new Date(Date.now() - 120_000) },
  });
  await assert.rejects(save(f, 'print(101)\n'), (e: unknown) => e instanceof AppError && e.status === 409 && e.code === 'code_storage_full');
});

test('a reply without usage is discarded and costs nothing', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  const events = await prompt(f, fakeModel({ usage: null }).model);
  assert.equal(events.at(-1)?.type, 'error');
  assert.equal(await tokenBalance(db.prisma, f.participant.id), 20_000);
  assert.equal((await workspace(db.prisma, await f.ctx(), f.problem.id)).turns[0]?.reply ?? null, null);
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
  const events = await prompt(f, fakeModel({ text: 'Think of a 64-bit type.' }).model);
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

test('a new session starts an empty chat and leaves the code alone; revert copies an old version', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await save(f, 'print(1)\n');
  await prompt(f, fakeModel().model);
  await save(f, 'print(2)\n');
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  let ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.turns.length, 0, 'fresh context');
  assert.equal(ws.codeVersions.at(-1)?.source, 'print(2)\n', 'code unaffected');
  await revert(db.prisma, await f.ctx(), { problemId: f.problem.id, codeVersionId: ws.codeVersions[0]!.id });
  ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.codeVersions.at(-1)?.source, 'print(1)\n');
  assert.equal(ws.codeVersions.length, 3);
  assert.equal(ws.currentCodeVersionId, ws.codeVersions.at(-1)?.id);
});

test('runs are idempotent and capped per participant', async () => {
  const f = await setup(db.prisma);
  await newSession(db.prisma, await f.ctx(), { problemId: f.problem.id, language: 'python' });
  await save(f);
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
  await save(f);
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
  await save(f);
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
