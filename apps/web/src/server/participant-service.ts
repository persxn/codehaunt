/**
 * Participant reads and the free actions: problem list and statement, workspace, sessions, revert, contest state.
 * Hidden tests: every test_cases query here filters `visibility: 'VISIBLE'` (WP-03; checked by a query-level test).
 */
import { fromDbLanguage, toDbLanguage, toParticipantVerdict } from '@codehaunt/core';
import {
  ContestState,
  ParticipantProblem,
  ProblemSummary,
  Workspace,
  type ConsentRequest,
  type NewSessionRequest,
  type RevertRequest,
} from '@codehaunt/contracts';
import { tokenBalance, type PrismaClient } from '@codehaunt/db';

import { badRequest, notFound } from './errors.ts';
import { openProblem, visible, type ParticipantContext } from './contest.ts';

export async function contestState(prisma: PrismaClient, ctx: ParticipantContext, eventName: string): Promise<ContestState> {
  const granted = await prisma.tokenLedger.aggregate({
    where: { participantId: ctx.participantId, kind: { in: ['GRANT', 'TOP_UP', 'ADJUSTMENT'] } },
    _sum: { delta: true },
  });
  return ContestState.parse({
    event: {
      name: eventName,
      phase: ctx.clock.phase,
      startsAt: ctx.clock.startsAt.toISOString(),
      endsAt: ctx.clock.endsAt.toISOString(),
      msLeft: ctx.clock.msLeft,
    },
    tokens: { remaining: await tokenBalance(prisma, ctx.participantId), total: granted._sum.delta ?? 0 },
    languages: ctx.event.config.languages,
    contextWarnPercent: ctx.event.config.budget.contextWarnPercent,
    consent: ctx.consented ? null : { text: ctx.event.config.consent.text, guardianRequired: ctx.event.config.access.allowMinors },
  });
}

/** Records consent once (ADR-010). Guardian consent is required when the event allows minors. */
export async function recordConsent(prisma: PrismaClient, ctx: ParticipantContext, input: ConsentRequest, requestId: string) {
  if (ctx.event.config.access.allowMinors && !input.guardianConsent) throw badRequest('Guardian consent is required for this event.');
  if (ctx.consented) return { ok: true };
  await prisma.$transaction([
    prisma.participant.update({
      where: { id: ctx.participantId },
      data: { consentAt: new Date(), reuseConsent: input.reuseConsent, guardianConsent: input.guardianConsent },
    }),
    prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: 'participant.consented',
        targetType: 'participant',
        targetId: ctx.participantId,
        after: { reuseConsent: input.reuseConsent, guardianConsent: input.guardianConsent },
        requestId,
      },
    }),
  ]);
  return { ok: true };
}

export async function listProblems(prisma: PrismaClient, ctx: ParticipantContext): Promise<ProblemSummary[]> {
  const problems = await prisma.problem.findMany({
    where: { eventId: ctx.event.id },
    orderBy: { ord: 'asc' },
    select: {
      id: true, slug: true, title: true, difficulty: true, ord: true, practice: true,
      submissions: {
        where: { participantId: ctx.participantId, kind: 'SUBMIT', verdict: { verdict: 'AC' } },
        select: { id: true },
        take: 1,
      },
    },
  });
  return problems
    .filter((p) => visible(p.practice, ctx.clock.phase))
    .map(({ submissions, ...p }) => ProblemSummary.parse({ ...p, solved: submissions.length > 0 }));
}

export async function problemStatement(prisma: PrismaClient, ctx: ParticipantContext, problemId: string): Promise<ParticipantProblem> {
  await openProblem(prisma, ctx, problemId, false);
  const p = await prisma.problem.findUniqueOrThrow({
    where: { id: problemId },
    select: {
      id: true, slug: true, title: true, statement: true, difficulty: true, ord: true,
      timeLimitMs: true, memoryLimitMb: true, practice: true,
      testCases: { where: { visibility: 'VISIBLE' }, orderBy: { ord: 'asc' }, select: { input: true, expectedOutput: true } },
    },
  });
  const { testCases, ...rest } = p;
  return ParticipantProblem.parse({ ...rest, visibleTests: testCases });
}

export async function visibleTestIds(prisma: PrismaClient, problemId: string): Promise<Set<string>> {
  const rows = await prisma.testCase.findMany({ where: { problemId, visibility: 'VISIBLE' }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export async function workspace(prisma: PrismaClient, ctx: ParticipantContext, problemId: string): Promise<Workspace> {
  await openProblem(prisma, ctx, problemId, false);
  const session = await prisma.chatSession.findFirst({
    where: { participantId: ctx.participantId, problemId, closedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const turns = session
    ? await prisma.promptTurn.findMany({ where: { chatSessionId: session.id }, orderBy: { ord: 'asc' } })
    : [];
  const versions = await prisma.codeVersion.findMany({
    where: { chatSession: { participantId: ctx.participantId, problemId } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const runs = await prisma.submission.findMany({
    where: { participantId: ctx.participantId, problemId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { verdict: true },
  });
  const visibleIds = await visibleTestIds(prisma, problemId);
  const lastAnswered = turns.filter((t) => t.reply !== null).at(-1);
  return Workspace.parse({
    session: session && {
      id: session.id,
      language: fromDbLanguage(session.language),
      contextTokensUsed: lastAnswered ? lastAnswered.promptTokens + lastAnswered.completionTokens : 0,
      contextTokensLimit: ctx.event.config.budget.contextTokens,
    },
    turns: turns.map((t) => ({ id: t.id, prompt: t.prompt, reply: t.reply, createdAt: t.createdAt.toISOString() })),
    codeVersions: versions.map((v) => ({
      id: v.id,
      language: fromDbLanguage(v.language),
      source: v.source,
      createdAt: v.createdAt.toISOString(),
      turnId: v.promptTurnId,
    })),
    currentCodeVersionId: versions.at(-1)?.id ?? null,
    runs: runs.map((r) => ({
      ...toParticipantVerdict({ id: r.id, kind: r.kind, status: r.status, verdict: r.verdict }, visibleIds),
      kind: r.kind,
      codeVersionId: r.codeVersionId,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/**
 * Closes the open session (if any) and starts a new one in the chosen language. The code carries over because the
 * current code is the newest version across sessions. Free, but only while the problem is open for work.
 */
export async function newSession(prisma: PrismaClient, ctx: ParticipantContext, input: NewSessionRequest): Promise<{ id: string }> {
  if (!ctx.event.config.languages.includes(input.language)) throw badRequest('That language is not enabled for this event.');
  const problem = await openProblem(prisma, ctx, input.problemId, true);
  return prisma.$transaction(async (tx) => {
    // Serialise per participant so two clicks can't leave two open sessions.
    await tx.$queryRaw`SELECT id FROM participants WHERE id = ${ctx.participantId} FOR UPDATE`;
    await tx.chatSession.updateMany({
      where: { participantId: ctx.participantId, problemId: problem.id, closedAt: null },
      data: { closedAt: new Date() },
    });
    const created = await tx.chatSession.create({
      data: { participantId: ctx.participantId, problemId: problem.id, language: toDbLanguage(input.language) },
      select: { id: true },
    });
    return created;
  });
}

/** Revert = a new version copying an older one, so history stays append-only and "current" is always the newest. */
export async function revert(prisma: PrismaClient, ctx: ParticipantContext, input: RevertRequest): Promise<{ id: string }> {
  const problem = await openProblem(prisma, ctx, input.problemId, true);
  const old = await prisma.codeVersion.findFirst({
    where: { id: input.codeVersionId, chatSession: { participantId: ctx.participantId, problemId: problem.id } },
  });
  if (!old) throw notFound('That code version');
  const session = await prisma.chatSession.findFirst({
    where: { participantId: ctx.participantId, problemId: problem.id, closedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return prisma.codeVersion.create({
    data: { chatSessionId: session?.id ?? old.chatSessionId, promptTurnId: null, language: old.language, source: old.source },
    select: { id: true },
  });
}
