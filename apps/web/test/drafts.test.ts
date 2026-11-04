/**
 * GPT-OSS drafts (WP-07 task 8): approving a test adds a HIDDEN test, approving a naive solution sets NAIVE for that
 * language, rejecting changes nothing; a draft is decided once; everything is refused once the contest has started.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createTestDatabase, type TestDatabase } from '@codehaunt/db/testing';

import { decideDraft, listDrafts } from '../src/server/draft-service.ts';
import { AppError } from '../src/server/errors.ts';
import { setup } from './support/fixtures.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;

test('approve, reject, decide once, refused after the start', async () => {
  const f = await setup(db.prisma, { status: 'CHECK_IN' });
  // setup() puts the start a minute in the past; push it out so the event isn't locked.
  const config = { ...(f.event.config as Record<string, unknown>), schedule: { checkInAt: new Date().toISOString(), startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 180 } };
  await db.prisma.event.update({ where: { id: f.event.id }, data: { config } });
  const actor = { id: f.admin.id, requestId: 'r' };
  const test1 = await db.prisma.problemDraft.create({ data: { problemId: f.problem.id, kind: 'TEST', input: '0 0', expectedOutput: '0', note: 'zeros', model: 'gpt-oss:120b' } });
  const test2 = await db.prisma.problemDraft.create({ data: { problemId: f.problem.id, kind: 'TEST', input: '-1 1', expectedOutput: '0', note: 'signs', model: 'gpt-oss:120b' } });
  const naive = await db.prisma.problemDraft.create({ data: { problemId: f.problem.id, kind: 'NAIVE', language: 'PYTHON', source: 'print(0)', note: 'brute', model: 'gpt-oss:120b' } });

  const hiddenBefore = await db.prisma.testCase.count({ where: { problemId: f.problem.id, visibility: 'HIDDEN' } });
  await decideDraft(db.prisma, f.problem.id, test1.id, { decision: 'approve' }, actor);
  const hidden = await db.prisma.testCase.findMany({ where: { problemId: f.problem.id, visibility: 'HIDDEN' }, orderBy: { ord: 'asc' } });
  assert.equal(hidden.length, hiddenBefore + 1);
  assert.equal(hidden.at(-1)!.input, '0 0');
  await assert.rejects(decideDraft(db.prisma, f.problem.id, test1.id, { decision: 'reject' }, actor), code('draft_decided'));

  await decideDraft(db.prisma, f.problem.id, naive.id, { decision: 'approve' }, actor);
  const solution = await db.prisma.referenceSolution.findUniqueOrThrow({ where: { problemId_language_kind: { problemId: f.problem.id, language: 'PYTHON', kind: 'NAIVE' } } });
  assert.equal(solution.source, 'print(0)');

  await decideDraft(db.prisma, f.problem.id, test2.id, { decision: 'reject' }, actor);
  assert.equal(await db.prisma.testCase.count({ where: { problemId: f.problem.id, visibility: 'HIDDEN' } }), hiddenBefore + 1);
  assert.deepEqual((await listDrafts(db.prisma, f.problem.id)).map((d) => d.status), ['APPROVED', 'REJECTED', 'APPROVED']);
  assert.equal(await db.prisma.auditLog.count({ where: { targetId: f.problem.id, action: { startsWith: 'problem.draft_' } } }), 3);

  const late = await db.prisma.problemDraft.create({ data: { problemId: f.problem.id, kind: 'TEST', input: '1 1', expectedOutput: '2', note: 'x', model: 'm' } });
  await db.prisma.event.update({ where: { id: f.event.id }, data: { lockedAt: new Date(), status: 'RUNNING' } });
  await assert.rejects(decideDraft(db.prisma, f.problem.id, late.id, { decision: 'approve' }, actor), code('event_locked'));
});
