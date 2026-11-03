/**
 * Problems inside the Event editor (ADR-006): statement, visible and hidden tests, reference/naive solutions per
 * language, limits, practice flag. Admin only (route policy). Problems freeze when the contest starts. "Calibrate"
 * queues each solution against every test (ADR-005, ADR-018, ADR-025); results are organizer-facing.
 */
import { fromDbLanguage, toDbLanguage } from '@codehaunt/core';
import { ProblemInput, type ProblemInput as ProblemInputT } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';
import { isLocked } from './event-service.ts';

type Actor = { id: string; requestId: string };

async function assertEditable(prisma: Pick<PrismaClient, 'event'>, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { lockedAt: true, status: true, config: true } });
  if (!event) throw notFound('That event');
  if (isLocked(event)) throw conflict('event_locked', 'The contest has started: problems can no longer change.');
}

export async function listProblems(prisma: PrismaClient, eventId: string) {
  const problems = await prisma.problem.findMany({
    where: { eventId },
    orderBy: { ord: 'asc' },
    select: {
      id: true, slug: true, title: true, difficulty: true, ord: true, practice: true, timeLimitMs: true, memoryLimitMb: true,
      testCases: { select: { visibility: true } },
      solutions: { select: { language: true, kind: true } },
    },
  });
  return problems.map(({ testCases, solutions, ...p }) => ({
    ...p,
    visibleTests: testCases.filter((t) => t.visibility === 'VISIBLE').length,
    hiddenTests: testCases.filter((t) => t.visibility === 'HIDDEN').length,
    solutions: solutions.map((s) => ({ language: fromDbLanguage(s.language), kind: s.kind })),
  }));
}

/** The full problem as the editor needs it, hidden tests included. Admin routes only. */
export async function getProblem(prisma: PrismaClient, id: string): Promise<ProblemInputT & { id: string; eventId: string }> {
  const p = await prisma.problem.findUnique({
    where: { id },
    include: { testCases: { orderBy: { ord: 'asc' } }, solutions: true },
  });
  if (!p) throw notFound('That problem');
  const tests = (v: 'VISIBLE' | 'HIDDEN') => p.testCases.filter((t) => t.visibility === v).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput }));
  return {
    id: p.id,
    eventId: p.eventId,
    ...ProblemInput.parse({
      slug: p.slug, title: p.title, statement: p.statement, difficulty: p.difficulty, ord: p.ord,
      timeLimitMs: p.timeLimitMs, memoryLimitMb: p.memoryLimitMb, checker: p.checker, practice: p.practice,
      solutions: p.solutions.map((s) => ({ language: fromDbLanguage(s.language), kind: s.kind, source: s.source })),
      visibleTests: tests('VISIBLE'),
      hiddenTests: tests('HIDDEN'),
    }),
  };
}

function rows(problemId: string, input: ProblemInputT) {
  return {
    tests: [
      ...input.visibleTests.map((t, ord) => ({ problemId, visibility: 'VISIBLE' as const, ord, ...t })),
      ...input.hiddenTests.map((t, ord) => ({ problemId, visibility: 'HIDDEN' as const, ord, ...t })),
    ],
    solutions: input.solutions.map((s) => ({ problemId, language: toDbLanguage(s.language), kind: s.kind, source: s.source })),
  };
}

const fields = (input: ProblemInputT) => ({
  slug: input.slug, title: input.title, statement: input.statement, difficulty: input.difficulty, ord: input.ord,
  timeLimitMs: input.timeLimitMs, memoryLimitMb: input.memoryLimitMb, checker: input.checker, practice: input.practice,
});

/** Audit entries record counts and lengths, not the tests or solutions themselves. */
const summary = (input: ProblemInputT) => ({
  ...fields(input), statement: `${input.statement.length} chars`,
  visibleTests: input.visibleTests.length, hiddenTests: input.hiddenTests.length,
  solutions: input.solutions.map((s) => `${s.language}:${s.kind}`),
});

export async function createProblem(prisma: PrismaClient, eventId: string, input: ProblemInputT, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR NO KEY UPDATE`;
    await assertEditable(tx, eventId);
    if (await tx.problem.findUnique({ where: { eventId_slug: { eventId, slug: input.slug } } })) {
      throw conflict('slug_taken', 'A problem with that short name exists in this event.');
    }
    const p = await tx.problem.create({ data: { eventId, ...fields(input) } });
    const r = rows(p.id, input);
    await tx.testCase.createMany({ data: r.tests });
    if (r.solutions.length) await tx.referenceSolution.createMany({ data: r.solutions });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'problem.created', targetType: 'problem', targetId: p.id, after: summary(input), requestId: actor.requestId } });
    return { id: p.id };
  });
}

/** Replaces the problem's fields, tests and solutions as a whole (the editor saves the full form). */
export async function updateProblem(prisma: PrismaClient, id: string, input: ProblemInputT, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.problem.findUnique({ where: { id } });
    if (!existing) throw notFound('That problem');
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${existing.eventId} FOR NO KEY UPDATE`;
    await assertEditable(tx, existing.eventId);
    // Code versions and submissions point at the problem, not at tests, so replacing tests is safe before the start.
    await tx.problem.update({ where: { id }, data: fields(input) });
    await tx.testCase.deleteMany({ where: { problemId: id } });
    await tx.referenceSolution.deleteMany({ where: { problemId: id } });
    const r = rows(id, input);
    await tx.testCase.createMany({ data: r.tests });
    if (r.solutions.length) await tx.referenceSolution.createMany({ data: r.solutions });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'problem.updated', targetType: 'problem', targetId: id, after: summary(input), requestId: actor.requestId } });
    return { id };
  });
}

export async function deleteProblem(prisma: PrismaClient, id: string, actor: Actor) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.problem.findUnique({ where: { id }, select: { eventId: true, slug: true, _count: { select: { submissions: true } } } });
    if (!existing) throw notFound('That problem');
    await assertEditable(tx, existing.eventId);
    if (existing._count.submissions) throw conflict('problem_used', 'This problem already has runs (warm-up or test runs); it cannot be deleted.');
    await tx.problem.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'problem.deleted', targetType: 'problem', targetId: id, before: { slug: existing.slug }, requestId: actor.requestId } });
  });
  return { ok: true };
}

/**
 * Queues one calibration run per stored solution, audit-logged. Refused once the contest has started: calibration
 * shares the judge (≤ 16 sandboxes) with participants (audit M3).
 */
export async function calibrate(prisma: PrismaClient, problemId: string, actor: Actor) {
  await prisma.$transaction(async (tx) => {
    const problem = await tx.problem.findUnique({ where: { id: problemId }, select: { eventId: true } });
    if (!problem) throw notFound('That problem');
    await assertEditable(tx, problem.eventId);
    const solutions = await tx.referenceSolution.findMany({ where: { problemId } });
    if (!solutions.length) throw conflict('no_solutions', 'Add a reference solution first.');
    await tx.calibrationRun.createMany({
      data: solutions.map((s) => ({ problemId, language: s.language, kind: s.kind, source: s.source, requestedBy: actor.id })),
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'problem.calibration_requested', targetType: 'problem', targetId: problemId, after: { runs: solutions.map((s) => `${s.language}:${s.kind}`) }, requestId: actor.requestId },
    });
  });
  return calibrationRuns(prisma, problemId);
}

/** Latest run per language and kind, with the verdict and the slowest/most memory-hungry test. */
export async function calibrationRuns(prisma: PrismaClient, problemId: string) {
  const runs = await prisma.calibrationRun.findMany({ where: { problemId }, orderBy: { createdAt: 'desc' }, take: 40 });
  return runs.map((r) => {
    const result = r.result as { verdict?: string; testsPassed?: number; testsTotal?: number; maxTimeMs?: number; maxMemoryKb?: number; compileLog?: string; internalError?: string } | null;
    return {
      id: r.id, language: fromDbLanguage(r.language), kind: r.kind, status: r.status, createdAt: r.createdAt.toISOString(),
      verdict: result?.verdict ?? null, testsPassed: result?.testsPassed ?? null, testsTotal: result?.testsTotal ?? null,
      maxTimeMs: result?.maxTimeMs ?? null, maxMemoryKb: result?.maxMemoryKb ?? null,
      compileLog: result?.compileLog?.slice(0, 8000) ?? null, internalError: result?.internalError?.slice(0, 2000) ?? null,
    };
  });
}
