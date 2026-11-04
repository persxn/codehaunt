/**
 * GPT-OSS problem drafts (WP-07 task 8, R8-Q6): edge-case test inputs with a proposed output, and a naive solution,
 * written by the one-shot judge container. Admin only (they become hidden tests). Approving one adds a HIDDEN test or
 * sets the problem's NAIVE solution for that language, under the same lock as the problem editor (before the start
 * only). The proposed output is the model's guess: calibrate afterwards, and a REFERENCE that fails shows a bad one.
 */
import { fromDbLanguage } from '@codehaunt/core';
import type { DraftDecision } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';
import { isLocked } from './event-service.ts';

type Actor = { id: string; requestId: string };

/** Same bound as `ProblemInput.hiddenTests` in @codehaunt/contracts. */
export const MAX_HIDDEN_TESTS = 200;

export async function listDrafts(prisma: PrismaClient, problemId: string) {
  const drafts = await prisma.problemDraft.findMany({ where: { problemId }, orderBy: { createdAt: 'asc' } });
  return drafts.map((d) => ({
    id: d.id, kind: d.kind, status: d.status, input: d.input, expectedOutput: d.expectedOutput,
    language: d.language ? fromDbLanguage(d.language) : null, source: d.source, note: d.note, model: d.model,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function decideDraft(prisma: PrismaClient, problemId: string, draftId: string, input: DraftDecision, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.problemDraft.findFirst({ where: { id: draftId, problemId }, include: { problem: { select: { eventId: true } } } });
    if (!draft) throw notFound('That draft');
    // Same lock as the editor: the event row, then the lock check (problem-admin-service).
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${draft.problem.eventId} FOR NO KEY UPDATE`;
    const event = await tx.event.findUniqueOrThrow({ where: { id: draft.problem.eventId }, select: { lockedAt: true, status: true, config: true } });
    if (isLocked(event)) throw conflict('event_locked', 'The contest has started: problems can no longer change.');
    if (draft.status !== 'DRAFT') throw conflict('draft_decided', 'That draft was already decided.');
    if (input.decision === 'approve') {
      if (draft.kind === 'TEST') {
        if (draft.input === null || draft.expectedOutput === null) throw conflict('draft_incomplete', 'That draft has no input or output.');
        // ProblemInput allows at most 200 hidden tests; an approval must not push past it (audit R14-7).
        if ((await tx.testCase.count({ where: { problemId, visibility: 'HIDDEN' } })) >= MAX_HIDDEN_TESTS) {
          throw conflict('too_many_tests', `A problem has at most ${MAX_HIDDEN_TESTS} hidden tests.`);
        }
        const last = await tx.testCase.findFirst({ where: { problemId, visibility: 'HIDDEN' }, orderBy: { ord: 'desc' }, select: { ord: true } });
        await tx.testCase.create({ data: { problemId, visibility: 'HIDDEN', ord: (last?.ord ?? -1) + 1, input: draft.input, expectedOutput: draft.expectedOutput } });
      } else {
        if (!draft.language || !draft.source) throw conflict('draft_incomplete', 'That draft has no solution.');
        await tx.referenceSolution.upsert({
          where: { problemId_language_kind: { problemId, language: draft.language, kind: 'NAIVE' } },
          create: { problemId, language: draft.language, kind: 'NAIVE', source: draft.source },
          update: { source: draft.source },
        });
      }
    }
    await tx.problemDraft.update({
      where: { id: draftId },
      data: { status: input.decision === 'approve' ? 'APPROVED' : 'REJECTED', decidedAt: new Date(), decidedById: actor.id },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: `problem.draft_${input.decision === 'approve' ? 'approved' : 'rejected'}`, targetType: 'problem', targetId: problemId, after: { draftId, kind: draft.kind }, reason: input.reason, requestId: actor.requestId },
    });
    return { ok: true };
  });
}
