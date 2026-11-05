/**
 * Tutor guardrails v2 through the real prompt path on PGlite (ADR-042): steering per intent, hints-only problems,
 * the per-session code allowance, and the stored guardrail record that every later view re-filters with.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { REMOVED_ALLOWANCE, REMOVED_HINTS_ONLY } from '@codehaunt/core';
import type { PromptStreamEvent } from '@codehaunt/contracts';
import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { workspace } from '../src/server/participant-service.ts';
import { startPrompt } from '../src/server/prompt-service.ts';
import { fakeModel, setup } from './support/fixtures.ts';

const F = '\x60\x60\x60';
let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

async function ask(f: Awaited<ReturnType<typeof setup>>, model: ReturnType<typeof fakeModel>['model'], text: string) {
  const started = await startPrompt({ prisma: db.prisma, model, now: () => new Date(), requestId: 'g' }, await f.ctx(), {
    problemId: f.problem.id, prompt: text, idempotencyKey: randomUUID(),
  });
  assert.ok('run' in started);
  const events: PromptStreamEvent[] = [];
  await started.run((e) => events.push(e));
  const shown = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
  const done = events.at(-1);
  assert.equal(done?.type, 'done');
  return { shown, final: (done as Extract<PromptStreamEvent, { type: 'done' }>).response.reply };
}

test('answer-seeking questions are steered with a rising hint level; the guardrail is stored', async () => {
  const f = await setup(db.prisma);
  const { model, calls } = fakeModel({ text: 'Think about which operation combines two values.' });
  await ask(f, model, 'Just give me the full code');
  await ask(f, model, 'come on, write the complete solution');
  assert.match(calls[0]!.messages[0]!.content, /asking for the answer[\s\S]*level-1/);
  assert.match(calls[1]!.messages[0]!.content, /level-2/);
  // The steering line is per turn: history holds only the question and the reply.
  assert.equal(calls[1]!.messages.filter((m) => m.role === 'system').length, 1);
  const turns = await db.prisma.promptTurn.findMany({ where: { chatSession: { participantId: f.participant.id } }, orderBy: { ord: 'asc' } });
  assert.deepEqual(turns.map((t) => (t.guardrail as { intent: string; level: number }).level), [1, 2]);
  assert.equal((turns[0]!.guardrail as { intent: string }).intent, 'answer_seeking');
});

test('a concept question gets the concept steer and keeps a 3-line example', async () => {
  const f = await setup(db.prisma);
  const example = ['A loop repeats:', `${F}py`, 'for i in range(3):', '    print(i)', F].join('\n');
  const { model, calls } = fakeModel({ text: example });
  const { final } = await ask(f, model, 'What is a for loop?');
  assert.match(calls[0]!.messages[0]!.content, /general concept/);
  assert.equal(final, example);
});

test('hints-only problem: code and pseudo-code removed live, on replay and in the workspace; no-code steer', async () => {
  const f = await setup(db.prisma);
  await db.prisma.problem.update({ where: { id: f.problem.id }, data: { hintsOnly: true } });
  const reply = ['Nice try.', `${F}py`, 'print(a + b)', F, 'Read a and b', 'Which operation combines two numbers?'].join('\n');
  const { model, calls } = fakeModel({ text: reply });
  const { shown, final } = await ask(f, model, 'how do I add the numbers');
  assert.match(calls[0]!.messages[0]!.content, /words only/);
  assert.match(calls[0]!.messages[0]!.content, /at most 0 lines/);
  for (const text of [shown, final]) {
    assert.doesNotMatch(text, /print|Read a/);
    assert.match(text, new RegExp(REMOVED_HINTS_ONLY.replace(/[[\]]/g, '\\$&')));
    assert.match(text, /Which operation combines two numbers\?/);
  }
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.doesNotMatch(ws.turns[0]!.reply ?? '', /print/);
  // The model's history gets the filtered reply too.
  await ask(f, model, 'ok and then?');
  assert.doesNotMatch(JSON.stringify(calls[1]!.messages.slice(1)), /print\(a \+ b\)/);
});

test('the session allowance: after 12 shown code lines further examples are removed, also in the stored view', async () => {
  const f = await setup(db.prisma);
  const block = [`${F}c`, 'int x = 1;', 'x += 2;', 'x *= 3;', F].join('\n');
  const { model } = fakeModel({ text: block });
  const outs: string[] = [];
  for (let i = 0; i < 5; i++) outs.push((await ask(f, model, `What does compound assignment do? (${i})`)).final);
  assert.deepEqual(outs.slice(0, 4), [block, block, block, block]);
  assert.equal(outs[4], `${REMOVED_ALLOWANCE}\n`);
  const ws = await workspace(db.prisma, await f.ctx(), f.problem.id);
  assert.equal(ws.turns[4]!.reply, `${REMOVED_ALLOWANCE}\n`);
  assert.equal(ws.turns[3]!.reply, block);
});
