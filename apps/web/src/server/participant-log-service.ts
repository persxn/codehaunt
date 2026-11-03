/**
 * Per-participant log for organizers (WP-05): prompts and replies, code versions, runs with verdicts, token ledger and
 * the staff actions on them. ADMIN and ORGANIZER. Organizers may not see hidden tests (problem pages are ADMIN-only),
 * so per-test output excerpts are returned for visible tests only. Prompts, replies and code are participant/model
 * text: the UI renders them as plain text.
 */
import { RunTestResult } from '@codehaunt/contracts';
import { tokenBalance, type PrismaClient } from '@codehaunt/db';

import { notFound } from './errors.ts';

export async function participantLog(prisma: PrismaClient, participantId: string) {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true, eventId: true, userId: true, enrolmentNo: true, status: true, seatLabel: true, checkedInAt: true, extraMinutes: true,
      user: { select: { name: true, username: true, active: true, lastLoginAt: true } },
    },
  });
  if (!p) throw notFound('That participant');

  const sessions = await prisma.chatSession.findMany({
    where: { participantId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, language: true, createdAt: true, closedAt: true,
      problem: { select: { id: true, title: true, practice: true } },
      turns: { orderBy: { ord: 'asc' }, select: { id: true, ord: true, prompt: true, reply: true, promptTokens: true, completionTokens: true, latencyMs: true, node: true, createdAt: true } },
      codeVersions: { orderBy: { createdAt: 'asc' }, select: { id: true, promptTurnId: true, language: true, source: true, createdAt: true } },
    },
  });
  const submissions = await prisma.submission.findMany({
    where: { participantId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, kind: true, status: true, codeVersionId: true, contestMs: true, createdAt: true, attempts: true, firstInternalError: true,
      problem: { select: { title: true } },
      verdict: { select: { verdict: true, testsPassed: true, testsTotal: true, maxTimeMs: true, maxMemoryKb: true, compileLog: true, results: true } },
      incidents: { select: { id: true, kind: true, status: true, penaltyReversed: true } },
    },
  });
  const visible = new Set(
    (await prisma.testCase.findMany({ where: { visibility: 'VISIBLE', problem: { eventId: p.eventId } }, select: { id: true } })).map((t) => t.id),
  );
  const ledger = await prisma.tokenLedger.findMany({
    where: { participantId, kind: { in: ['GRANT', 'TOP_UP', 'ADJUSTMENT'] } },
    orderBy: { id: 'asc' },
    select: { kind: true, delta: true, reason: true, createdAt: true },
  });
  const actions = await prisma.auditLog.findMany({
    where: { OR: [{ targetType: 'participant', targetId: participantId }, { targetType: 'user', targetId: p.userId }] },
    orderBy: { id: 'desc' },
    take: 200,
    select: { action: true, reason: true, after: true, createdAt: true, actor: { select: { name: true } } },
  });

  return {
    participant: {
      id: p.id, name: p.user.name, username: p.user.username, enrolmentNo: p.enrolmentNo, status: p.status, active: p.user.active,
      seatLabel: p.seatLabel, checkedInAt: p.checkedInAt?.toISOString() ?? null, lastLoginAt: p.user.lastLoginAt?.toISOString() ?? null,
      extraMinutes: p.extraMinutes, tokensRemaining: await tokenBalance(prisma, participantId),
    },
    sessions: sessions.map((s) => ({
      id: s.id, language: s.language, problem: s.problem.title, practice: s.problem.practice,
      createdAt: s.createdAt.toISOString(), closedAt: s.closedAt?.toISOString() ?? null,
      turns: s.turns.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
      codeVersions: s.codeVersions.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    })),
    submissions: submissions.map((s) => {
      const results = RunTestResult.array().safeParse(s.verdict?.results);
      return {
        id: s.id, kind: s.kind, status: s.status, problem: s.problem.title, codeVersionId: s.codeVersionId, contestMs: s.contestMs,
        createdAt: s.createdAt.toISOString(), attempts: s.attempts, rechecked: s.firstInternalError !== null,
        verdict: s.verdict
          ? {
              verdict: s.verdict.verdict, testsPassed: s.verdict.testsPassed, testsTotal: s.verdict.testsTotal,
              maxTimeMs: s.verdict.maxTimeMs, maxMemoryKb: s.verdict.maxMemoryKb, compileLog: s.verdict.compileLog.slice(0, 8000),
              tests: results.success
                ? results.data.map((r) => ({
                    hidden: !visible.has(r.testId), verdict: r.verdict, timeMs: r.timeMs, memoryKb: r.memoryKb,
                    ...(visible.has(r.testId) ? { outputExcerpt: r.outputExcerpt } : {}),
                  }))
                : [],
            }
          : null,
        incidents: s.incidents,
      };
    }),
    ledger: ledger.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    actions: actions.map((a) => ({ action: a.action, reason: a.reason, after: a.after, actor: a.actor?.name ?? null, createdAt: a.createdAt.toISOString() })),
  };
}

/** Participants of an event with live status for the ops table (search, tokens, extra time). */
export async function opsParticipants(prisma: PrismaClient, eventId: string) {
  const rows = await prisma.participant.findMany({
    where: { eventId, status: { in: ['CHECKED_IN', 'DISQUALIFIED'] } },
    orderBy: { enrolmentNo: 'asc' },
    select: { id: true, enrolmentNo: true, status: true, seatLabel: true, extraMinutes: true, user: { select: { name: true, active: true } } },
  });
  const balances = await prisma.tokenLedger.groupBy({ by: ['participantId'], where: { eventId }, _sum: { delta: true } });
  const balance = new Map(balances.map((b) => [b.participantId, b._sum.delta ?? 0]));
  return rows.map((r) => ({
    id: r.id, name: r.user.name, enrolmentNo: r.enrolmentNo, status: r.status, active: r.user.active, seatLabel: r.seatLabel,
    extraMinutes: r.extraMinutes, tokensRemaining: balance.get(r.id) ?? 0,
  }));
}
