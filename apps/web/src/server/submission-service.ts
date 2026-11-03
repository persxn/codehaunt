/**
 * Sample runs and submissions (ADR-007, ADR-025): the web only queues a row; the worker runs it through CodeRunner.
 * Idempotent per key. Results go out only through the verdict projection.
 */
import { toParticipantVerdict } from '@codehaunt/core';
import { RunView, type SubmissionRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { AppError, conflict, notFound } from './errors.ts';
import { openProblem, type ParticipantContext } from './contest.ts';
import { visibleTestIds } from './participant-service.ts';

/** Queued or running runs per participant: enough for "sample, then submit", not enough to hog the judge. */
export const MAX_ACTIVE_RUNS = 2;

export async function createRun(prisma: PrismaClient, ctx: ParticipantContext, input: SubmissionRequest): Promise<RunView> {
  const existing = await prisma.submission.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, participantId: true } });
  if (existing) {
    if (existing.participantId !== ctx.participantId) throw conflict('idempotency_conflict', 'Try again.');
    return runView(prisma, ctx, existing.id);
  }
  const problem = await openProblem(prisma, ctx, input.problemId, true);
  const version = await prisma.codeVersion.findFirst({
    where: { id: input.codeVersionId, chatSession: { participantId: ctx.participantId, problemId: problem.id } },
    select: { id: true },
  });
  if (!version) throw notFound('That code version');

  const id = await prisma.$transaction(async (tx) => {
    // Concurrent retries with one key serialise on the participant lock, then find the row the first one created.

    await tx.$queryRaw`SELECT id FROM participants WHERE id = ${ctx.participantId} FOR UPDATE`;
    const again = await tx.submission.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, participantId: true } });
    if (again) {
      if (again.participantId !== ctx.participantId) throw conflict('idempotency_conflict', 'Try again.');
      return again.id;
    }
    const active = await tx.submission.count({ where: { participantId: ctx.participantId, status: { in: ['QUEUED', 'RUNNING'] } } });
    if (active >= MAX_ACTIVE_RUNS) throw new AppError(429, 'too_many_runs', 'Wait for your current runs to finish.');
    const created = await tx.submission.create({
      data: {
        participantId: ctx.participantId,
        problemId: problem.id,
        codeVersionId: version.id,
        kind: input.kind,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true },
    });
    return created.id;
  });
  return runView(prisma, ctx, id);
}

export async function runView(prisma: PrismaClient, ctx: ParticipantContext, submissionId: string): Promise<RunView> {
  const run = await prisma.submission.findFirst({
    where: { id: submissionId, participantId: ctx.participantId },
    include: { verdict: true },
  });
  if (!run) throw notFound('That run');
  const projected = toParticipantVerdict(
    { id: run.id, kind: run.kind, status: run.status, verdict: run.verdict },
    run.kind === 'SAMPLE' ? await visibleTestIds(prisma, run.problemId) : new Set(),
  );
  return RunView.parse({ ...projected, kind: run.kind, codeVersionId: run.codeVersionId, createdAt: run.createdAt.toISOString() });
}
