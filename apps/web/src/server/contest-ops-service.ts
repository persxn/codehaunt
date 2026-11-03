/**
 * Contest operations (WP-05, ADR-028): the clock controls, extend, per-participant top-ups, extra time and
 * disqualification, results states and the projector link. ADMIN and ORGANIZER (route policy). Every action writes an
 * audit_log row with actor, before/after and reason in the same transaction as the change.
 */
import { createHash, randomBytes } from 'node:crypto';

import {
  EventConfig,
  type ContestControlRequest,
  type ExtendRequest,
  type ExtraTimeRequest,
  type ParticipantActionRequest,
  type ResultsRequest,
  type TopUpRequest,
} from '@codehaunt/contracts';
import { adjustTokensIn, type PrismaClient, type Tx } from '@codehaunt/db';

import { eventClock } from './contest.ts';
import { conflict, notFound } from './errors.ts';

export interface Actor {
  id: string;
  requestId: string;
}

/** Event row lock: NO KEY UPDATE, never UPDATE (ledger inserts hold KEY SHARE on the event; see the services README). */
async function lockEvent(tx: Tx, eventId: string) {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR NO KEY UPDATE`;
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('That event');
  return { ...event, config: EventConfig.parse(event.config) };
}

const clockFields = (e: { status: string; lockedAt: Date | null; pausedAt: Date | null; pausedMs: number }) =>
  ({ status: e.status, lockedAt: e.lockedAt?.toISOString() ?? null, pausedAt: e.pausedAt?.toISOString() ?? null, pausedMs: e.pausedMs });

/** open_checkin · start (sets lockedAt = the actual start) · pause · resume · end. */
export async function controlContest(prisma: PrismaClient, eventId: string, input: ContestControlRequest, actor: Actor, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    const clock = eventClock(event, now);
    let data: { status: 'CHECK_IN' | 'RUNNING' | 'PAUSED' | 'ENDED'; lockedAt?: Date; pausedAt?: null | Date; pausedMs?: number };
    switch (input.action) {
      case 'open_checkin':
        if (event.status !== 'DRAFT') throw conflict('wrong_state', 'Check-in is already open.');
        data = { status: 'CHECK_IN' };
        break;
      case 'start':
        if (!['DRAFT', 'CHECK_IN'].includes(event.status)) throw conflict('wrong_state', 'The contest has already started.');
        data = { status: 'RUNNING', lockedAt: now, pausedAt: null, pausedMs: 0 };
        break;
      case 'pause':
        if (event.status !== 'RUNNING' || clock.phase !== 'running') throw conflict('wrong_state', 'Only a running contest can be paused.');
        data = { status: 'PAUSED', pausedAt: now };
        break;
      case 'resume':
        if (event.status !== 'PAUSED' || !event.pausedAt) throw conflict('wrong_state', 'The contest is not paused.');
        data = { status: 'RUNNING', pausedAt: null, pausedMs: event.pausedMs + Math.max(0, now.getTime() - event.pausedAt.getTime()) };
        break;
      case 'end':
        if (!['RUNNING', 'PAUSED'].includes(event.status)) throw conflict('wrong_state', 'The contest is not running.');
        data = event.pausedAt
          ? { status: 'ENDED', pausedAt: null, pausedMs: event.pausedMs + Math.max(0, now.getTime() - event.pausedAt.getTime()) }
          : { status: 'ENDED' };
        break;
    }
    const updated = await tx.event.update({ where: { id: eventId }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: `contest.${input.action}`, targetType: 'event', targetId: eventId,
        before: clockFields(event), after: clockFields(updated), reason: input.reason, requestId: actor.requestId,
      },
    });
    return contestStatus({ ...updated, config: event.config }, now);
  });
}

/** Adds minutes for everyone: `schedule.durationMinutes` grows (one source of truth for the length). */
export async function extendContest(prisma: PrismaClient, eventId: string, input: ExtendRequest, actor: Actor, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    if (!['RUNNING', 'PAUSED'].includes(event.status)) throw conflict('wrong_state', 'Only a running or paused contest can be extended.');
    const before = event.config.schedule.durationMinutes;
    const after = before + input.minutes;
    if (after > 1440) throw conflict('too_long', 'A contest can last at most 24 hours.');
    const config = EventConfig.parse({ ...event.config, schedule: { ...event.config.schedule, durationMinutes: after } });
    const updated = await tx.event.update({ where: { id: eventId }, data: { config } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: 'contest.extended', targetType: 'event', targetId: eventId,
        before: { durationMinutes: before }, after: { durationMinutes: after }, reason: input.reason, requestId: actor.requestId,
      },
    });
    return contestStatus({ ...updated, config }, now);
  });
}

export function contestStatus(
  event: { id: string; name: string; status: string; config: EventConfig; lockedAt: Date | null; pausedAt: Date | null; pausedMs: number; resultsState: string; provisionalAt: Date | null; projectorTokenHash: string | null },
  now = new Date(),
) {
  const clock = eventClock(event, now);
  const appealEndsAt = event.provisionalAt ? new Date(event.provisionalAt.getTime() + event.config.leaderboard.appealMinutes * 60_000) : null;
  return {
    id: event.id,
    name: event.name,
    status: event.status,
    phase: clock.phase,
    startedAt: clock.startsAt.toISOString(),
    endsAt: clock.endsAt.toISOString(),
    freezesAt: clock.freezesAt.toISOString(),
    msLeft: clock.msLeft,
    frozen: clock.frozen,
    durationMinutes: event.config.schedule.durationMinutes,
    resultsState: event.resultsState,
    appealEndsAt: appealEndsAt?.toISOString() ?? null,
    projectorLink: event.projectorTokenHash !== null,
    projectorEnabled: event.config.leaderboard.projectorEnabled,
  };
}

export async function getContestStatus(prisma: PrismaClient, eventId: string, now = new Date()) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('That event');
  return contestStatus({ ...event, config: EventConfig.parse(event.config) }, now);
}

/** A participant of this event, or 404 (ids from the URL are never trusted to belong to the event). */
async function participantIn(tx: Tx | PrismaClient, participantId: string) {
  const p = await tx.participant.findUnique({ where: { id: participantId }, select: { id: true, eventId: true, userId: true, status: true, extraMinutes: true, checkedInAt: true } });
  if (!p) throw notFound('That participant');
  return p;
}

/** Idempotent per key: a retried top-up returns 0 added and writes nothing new. */
export async function topUp(prisma: PrismaClient, participantId: string, input: TopUpRequest, actor: Actor) {
  const p = await participantIn(prisma, participantId);
  if (p.status !== 'CHECKED_IN') throw conflict('not_checked_in', 'Only checked-in participants can get tokens.');
  const key = `topup:${participantId}:${input.idempotencyKey}`;
  return prisma.$transaction(async (tx) => {
    const added = await adjustTokensIn(tx, {
      eventId: p.eventId, participantId, kind: 'TOP_UP', delta: input.tokens, actorId: actor.id, reason: input.reason, idempotencyKey: key,
    });
    if (added > 0) {
      await tx.auditLog.create({
        data: { actorId: actor.id, action: 'participant.topped_up', targetType: 'participant', targetId: participantId, after: { tokens: added }, reason: input.reason, requestId: actor.requestId },
      });
    }
    return { added };
  });
}

/** Sets the participant's extra minutes (time extension or accommodation); applies from now on. */
export async function setExtraTime(prisma: PrismaClient, participantId: string, input: ExtraTimeRequest, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const p = await participantIn(tx, participantId);
    await tx.participant.update({ where: { id: participantId }, data: { extraMinutes: input.minutes } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: 'participant.extra_time', targetType: 'participant', targetId: participantId,
        before: { extraMinutes: p.extraMinutes }, after: { extraMinutes: input.minutes }, reason: input.reason, requestId: actor.requestId,
      },
    });
    return { extraMinutes: input.minutes };
  });
}

/**
 * Disqualify (out of the ranking) and deactivate (account off) both end the participant's sessions at once;
 * end_session only signs them out; reinstate undoes disqualify and deactivate. Exported for the incident actions.
 */
export async function participantActionIn(tx: Tx, participantId: string, input: ParticipantActionRequest, actor: Actor) {
  const p = await participantIn(tx, participantId);
  const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId }, select: { active: true } });
  const before = { status: p.status, active: user.active };
  const after = { ...before };
  switch (input.action) {
    case 'disqualify':
      if (p.status !== 'CHECKED_IN') throw conflict('wrong_state', 'Only a checked-in participant can be disqualified.');
      after.status = 'DISQUALIFIED';
      break;
    case 'deactivate':
      if (!user.active) throw conflict('wrong_state', 'The account is already deactivated.');
      after.active = false;
      break;
    case 'reinstate':
      if (!p.checkedInAt || (p.status !== 'DISQUALIFIED' && user.active)) throw conflict('wrong_state', 'Nothing to reinstate.');
      after.status = 'CHECKED_IN';
      after.active = true;
      break;
    case 'end_session':
      break;
  }
  if (input.action !== 'reinstate') await tx.authSession.deleteMany({ where: { userId: p.userId } });
  if (after.status !== before.status) await tx.participant.update({ where: { id: participantId }, data: { status: after.status } });
  if (after.active !== before.active) await tx.user.update({ where: { id: p.userId }, data: { active: after.active } });
  await tx.auditLog.create({
    data: {
      actorId: actor.id, action: `participant.${input.action}`, targetType: 'participant', targetId: participantId,
      before, after, reason: input.reason, requestId: actor.requestId,
    },
  });
  return after;
}

export async function participantAction(prisma: PrismaClient, participantId: string, input: ParticipantActionRequest, actor: Actor) {
  return prisma.$transaction((tx) => participantActionIn(tx, participantId, input, actor));
}

/** Provisional (after the end) starts the appeal window; final needs the window to have passed (ADR-009). */
export async function publishResults(prisma: PrismaClient, eventId: string, input: ResultsRequest, actor: Actor, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    let data: { resultsState: 'PROVISIONAL' | 'FINAL'; provisionalAt?: Date; status?: 'PUBLISHED' };
    if (input.action === 'provisional') {
      if (!['ENDED', 'JUDGING'].includes(event.status)) throw conflict('wrong_state', 'End the contest first.');
      if (event.resultsState !== 'NONE') throw conflict('wrong_state', 'Provisional results are already out.');
      data = { resultsState: 'PROVISIONAL', provisionalAt: now };
    } else {
      if (event.resultsState !== 'PROVISIONAL' || !event.provisionalAt) throw conflict('wrong_state', 'Publish provisional results first.');
      const endsAt = event.provisionalAt.getTime() + event.config.leaderboard.appealMinutes * 60_000;
      if (now.getTime() < endsAt) throw conflict('appeal_window', `The appeal window is open until ${new Date(endsAt).toISOString()}.`);
      data = { resultsState: 'FINAL', status: 'PUBLISHED' };
    }
    const updated = await tx.event.update({ where: { id: eventId }, data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: `results.${input.action}`, targetType: 'event', targetId: eventId,
        before: { resultsState: event.resultsState, status: event.status }, after: { resultsState: updated.resultsState, status: updated.status },
        reason: input.reason, requestId: actor.requestId,
      },
    });
    return contestStatus({ ...updated, config: event.config }, now);
  });
}

export const hashProjectorToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A new projector link; the old one stops working. The token is returned once and only its hash is stored. */
export async function newProjectorLink(prisma: PrismaClient, eventId: string, actor: Actor) {
  const token = randomBytes(32).toString('base64url');
  await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, eventId);
    await tx.event.update({ where: { id: eventId }, data: { projectorTokenHash: hashProjectorToken(token) } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: 'projector.link_created', targetType: 'event', targetId: eventId,
        after: { replaced: event.projectorTokenHash !== null }, requestId: actor.requestId,
      },
    });
  });
  return { path: `/projector/${token}` };
}
