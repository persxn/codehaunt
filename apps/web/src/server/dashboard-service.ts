/**
 * Admin overview numbers (ADR-044): counts straight from the database, nothing invented or cached. No personal data
 * leaves here: counts, event names and statuses only. ADMIN and ORGANIZER (route policy).
 */
import type { PrismaClient } from '@codehaunt/db';

import { notFound } from './errors.ts';
import { getSetup } from './setup-service.ts';

const HOUR = 3_600_000;

export async function platformDashboard(prisma: PrismaClient, now = new Date()) {
  const since = new Date(now.getTime() - HOUR);
  const [byStatus, participants, checkedIn, liveSessions, questions, submissions, recent] = await Promise.all([
    prisma.event.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.participant.count(),
    prisma.participant.count({ where: { status: 'CHECKED_IN' } }),
    prisma.authSession.count({ where: { expiresAt: { gt: now }, user: { role: 'PARTICIPANT' } } }),
    prisma.promptTurn.count({ where: { createdAt: { gte: since } } }),
    prisma.submission.count({ where: { createdAt: { gte: since } } }),
    prisma.event.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, slug: true, name: true, status: true, updatedAt: true, config: true, _count: { select: { participants: true, problems: true } } },
    }),
  ]);
  const count = (statuses: string[]) => byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  const events = await Promise.all(recent.map(async (e) => {
    const setup = await getSetup(prisma, e.id, now);
    const startsAt = (e.config as { schedule?: { startsAt?: string } } | null)?.schedule?.startsAt ?? null;
    return {
      id: e.id, slug: e.slug, name: e.name, status: e.status, updatedAt: e.updatedAt.toISOString(), startsAt,
      participants: e._count.participants, problems: e._count.problems, setupDone: setup.done, setupTotal: setup.total,
    };
  }));
  return {
    generatedAt: now.toISOString(),
    events: {
      total: count(['DRAFT', 'CHECK_IN', 'RUNNING', 'PAUSED', 'ENDED', 'JUDGING', 'PUBLISHED']),
      draft: count(['DRAFT']),
      live: count(['CHECK_IN', 'RUNNING', 'PAUSED']),
      finished: count(['ENDED', 'JUDGING', 'PUBLISHED']),
    },
    participants: { total: participants, checkedIn, liveSessions },
    lastHour: { questions, submissions },
    recent: events,
  };
}

export async function eventDashboard(prisma: PrismaClient, eventId: string, now = new Date()) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw notFound('That event');
  const recentCut = new Date(now.getTime() - 10 * 60_000);
  const onEvent = { chatSession: { participant: { eventId } } };
  const [byStatus, liveSessions, questions, recentQuestions, answerSeeking, removed, submissions, accepted, usage, openIncidents, setup] = await Promise.all([
    prisma.participant.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
    prisma.authSession.count({ where: { expiresAt: { gt: now }, user: { role: 'PARTICIPANT', participants: { some: { eventId } } } } }),
    prisma.promptTurn.count({ where: onEvent }),
    prisma.promptTurn.count({ where: { ...onEvent, createdAt: { gte: recentCut } } }),
    prisma.promptTurn.count({ where: { ...onEvent, guardrail: { path: ['intent'], equals: 'answer_seeking' } } }),
    prisma.promptTurn.count({ where: { ...onEvent, guardrail: { path: ['removed'], gt: 0 } } }),
    prisma.submission.count({ where: { participant: { eventId }, kind: 'SUBMIT' } }),
    prisma.verdict.count({ where: { verdict: 'AC', submission: { participant: { eventId }, kind: 'SUBMIT' } } }),
    // Usage = reservations minus what was released (ADR-022); a reply still streaming counts its whole reservation.
    prisma.tokenLedger.aggregate({ where: { eventId, kind: { in: ['RESERVE', 'RELEASE'] } }, _sum: { delta: true } }),
    prisma.incident.count({ where: { eventId, status: 'OPEN' } }),
    getSetup(prisma, eventId, now),
  ]);
  const by = (s: string) => byStatus.find((c) => c.status === s)?._count._all ?? 0;
  return {
    generatedAt: now.toISOString(),
    event: setup.event,
    setup: { done: setup.done, total: setup.total, canLaunch: setup.canLaunch, launched: setup.launched, next: setup.steps.find((s) => s.state !== 'done') ?? null },
    participants: {
      total: byStatus.reduce((n, c) => n + c._count._all, 0),
      registered: by('REGISTERED'), waitlisted: by('WAITLISTED'), checkedIn: by('CHECKED_IN'), disqualified: by('DISQUALIFIED'),
      liveSessions,
    },
    tutor: { questions, last10Minutes: recentQuestions, answerSeeking, repliesTrimmed: removed },
    judge: { submissions, accepted },
    tokensUsed: Math.max(0, -(usage._sum.delta ?? 0)),
    openIncidents,
  };
}
