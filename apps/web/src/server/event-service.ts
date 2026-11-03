/**
 * The Event editor's backend (ADR-006). Admin only (route policy). Once the contest has started (`lockedAt`), only
 * the live-editable sections (`LIVE_EDITABLE_KEYS`: budget, schedule) may change; every change is audit-logged with
 * before/after. A change of `budget.tokensPerParticipant` adjusts every checked-in participant's balance by the
 * difference from that moment on (never retroactively; never below 0).
 */
import { isDeepStrictEqual } from 'node:util';

import { EventConfig, LIVE_EDITABLE_KEYS, type EventCreateRequest, type EventUpdateRequest } from '@codehaunt/contracts';
import { adjustTokensIn, type PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';

/**
 * Problems and scoring freeze once the contest starts (ADR-006). Started means any of: `lockedAt` set (WP-05's start
 * control), the status past check-in, or the configured start time passed — so nothing depends on one flag (audit M1).
 */
export function isLocked(event: { lockedAt: Date | null; status: string; config: unknown }, now = new Date()): boolean {
  if (event.lockedAt) return true;
  if (!['DRAFT', 'CHECK_IN'].includes(event.status)) return true;
  const parsed = EventConfig.safeParse(event.config);
  return parsed.success && new Date(parsed.data.schedule.startsAt).getTime() <= now.getTime();
}

export async function listEvents(prisma: PrismaClient) {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, name: true, status: true, lockedAt: true, _count: { select: { participants: true, problems: true } } },
  });
  return events.map(({ _count, lockedAt, ...e }) => ({ ...e, locked: lockedAt !== null || !['DRAFT', 'CHECK_IN'].includes(e.status), participants: _count.participants, problems: _count.problems }));
}

export async function getEvent(prisma: PrismaClient, id: string) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) throw notFound('That event');
  return { id: event.id, slug: event.slug, name: event.name, status: event.status, locked: isLocked(event), config: EventConfig.parse(event.config) };
}

export async function createEvent(prisma: PrismaClient, input: EventCreateRequest, actor: { id: string; requestId: string }) {
  if (await prisma.event.findUnique({ where: { slug: input.slug } })) throw conflict('slug_taken', 'An event with that short name exists.');
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({ data: { slug: input.slug, name: input.name, config: input.config } });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'event.created', targetType: 'event', targetId: event.id, after: { slug: input.slug, name: input.name, config: input.config }, requestId: actor.requestId },
    });
    return { id: event.id };
  });
}

export async function updateEvent(prisma: PrismaClient, id: string, input: EventUpdateRequest, actor: { id: string; requestId: string }) {
  await prisma.$transaction(async (tx) => {
    // NO KEY UPDATE, not UPDATE: token_ledger inserts take KEY SHARE on the event (foreign key) while holding a
    // participant lock; FOR UPDATE here would deadlock with them while this loop takes participant locks (R11-2).
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${id} FOR NO KEY UPDATE`;
    const event = await tx.event.findUnique({ where: { id } });
    if (!event) throw notFound('That event');
    const before = EventConfig.parse(event.config);
    const after = input.config;
    if (isLocked(event)) {
      const live = new Set<string>(LIVE_EDITABLE_KEYS);
      const frozen = (Object.keys(after) as Array<keyof EventConfig>).filter((k) => !live.has(k) && !isDeepStrictEqual(before[k], after[k]));
      if (frozen.length || (input.name && input.name !== event.name)) {
        throw conflict('event_locked', `The contest has started: only the budget and the schedule can change (tried: ${[...frozen, ...(input.name && input.name !== event.name ? ['name'] : [])].join(', ')}).`);
      }
    }
    await tx.event.update({ where: { id }, data: { config: after, ...(input.name ? { name: input.name } : {}) } });
    const audit = await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'event.config_updated',
        targetType: 'event',
        targetId: id,
        before: { name: event.name, config: before },
        after: { name: input.name ?? event.name, config: after },
        reason: input.reason ?? null,
        requestId: actor.requestId,
      },
    });
    // Everyone checked in gets the difference, in this same transaction (all or nothing; audit L1). Check-ins hold
    // the event lock too, so nobody is granted the old amount and then missed, or adjusted twice.
    const delta = after.budget.tokensPerParticipant - before.budget.tokensPerParticipant;
    if (delta !== 0) {
      const participants = await tx.participant.findMany({ where: { eventId: id, status: 'CHECKED_IN' }, select: { id: true } });
      for (const p of participants) {
        await adjustTokensIn(tx, {
          eventId: id,
          participantId: p.id,
          kind: 'ADJUSTMENT',
          delta,
          actorId: actor.id,
          reason: 'event budget changed',
          idempotencyKey: `budget:${audit.id}:${p.id}`,
        });
      }
    }
  }, { timeout: 30_000 });
  return getEvent(prisma, id);
}
