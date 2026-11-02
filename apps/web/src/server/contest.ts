/**
 * Participant context shared by the contest services: which event and participant a session user belongs to, and
 * whether a problem is open right now (ADR-006: one live event at a time; ADR-007: practice only before the start).
 */
import { contestClock, type ClockState } from '@codehaunt/core';
import { EventConfig } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { AppError, contestNotRunning, forbidden, notFound } from './errors.ts';

export interface ParticipantContext {
  participantId: string;
  userId: string;
  event: { id: string; status: string; config: EventConfig };
  clock: ClockState;
  consented: boolean;
}

/**
 * The participant's entry in the live event (the newest event they are checked in to that isn't a draft). Until they
 * have consented (ADR-010) only the state and consent routes work (`allowWithoutConsent`).
 */
export async function participantContext(
  prisma: PrismaClient,
  userId: string,
  now: Date,
  options: { allowWithoutConsent?: boolean } = {},
): Promise<ParticipantContext> {
  const participant = await prisma.participant.findFirst({
    where: { userId, status: 'CHECKED_IN', event: { status: { not: 'DRAFT' } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, consentAt: true, event: { select: { id: true, status: true, config: true } } },
  });
  if (!participant) throw forbidden('You are not checked in to an event.');
  if (!participant.consentAt && !options.allowWithoutConsent) {
    throw new AppError(403, 'consent_required', 'Please read and accept the consent text first.');
  }
  const config = EventConfig.parse(participant.event.config);
  const clock = contestClock(
    {
      status: participant.event.status as Parameters<typeof contestClock>[0]['status'],
      startsAt: config.schedule.startsAt,
      durationMinutes: config.schedule.durationMinutes,
      freezeMinutes: config.schedule.freezeMinutes,
    },
    now,
  );
  return { participantId: participant.id, userId, event: { ...participant.event, config }, clock, consented: participant.consentAt !== null };
}

/**
 * Problems a participant can open now: practice problems before the start, the others while it runs (and read-only
 * afterwards, for viewing). `forWork` is true for actions that cost or change something (prompt, run, submit).
 */
export async function openProblem(
  prisma: PrismaClient,
  ctx: ParticipantContext,
  problemId: string,
  forWork: boolean,
): Promise<{ id: string; practice: boolean; timeLimitMs: number; memoryLimitMb: number; checker: unknown }> {
  const problem = await prisma.problem.findFirst({
    where: { id: problemId, eventId: ctx.event.id },
    select: { id: true, practice: true, timeLimitMs: true, memoryLimitMb: true, checker: true },
  });
  if (!problem || !visible(problem.practice, ctx.clock.phase)) throw notFound('That problem');
  if (forWork) {
    if (problem.practice && ctx.clock.phase !== 'not_started') throw contestNotRunning('The warm-up problem is closed.');
    if (!problem.practice && ctx.clock.phase !== 'running') throw contestNotRunning();
  }
  return problem;
}

/** Practice problems are visible before the start only; contest problems from the start on. */
export function visible(practice: boolean, phase: ClockState['phase']): boolean {
  return practice ? phase === 'not_started' : phase !== 'not_started';
}
