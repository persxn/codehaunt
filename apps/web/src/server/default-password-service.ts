/**
 * The event's default participant password (ADR-041). Security-critical: Claude-owned.
 *
 * Only an argon2 hash is stored on the event; the plaintext passes through once and is never logged. Accounts that
 * carry the default have `mustChangePassword`, so the route wrapper lets them do nothing but choose their own.
 * Accounts stay inactive until their check-in QR is scanned (ADR-013), whatever their password.
 */
import { checkPasswordStrength, hashPassword } from '@codehaunt/auth';
import type { PrismaClient } from '@codehaunt/db';

import { badRequest, conflict, notFound } from './errors.ts';

type Actor = { id: string; requestId: string };
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Participants of the event whose password the default may set: not yet checked in, or checked in but still on the
 * default. Never a participant checked in at another event that hasn't ended (that would change their live password).
 */
async function defaultTargets(tx: Tx, eventId: string, userIds?: string[]): Promise<string[]> {
  const rows = await tx.participant.findMany({
    where: {
      eventId,
      ...(userIds ? { userId: { in: userIds } } : {}),
      user: { role: 'PARTICIPANT' },
      OR: [{ status: { in: ['REGISTERED', 'WAITLISTED'] } }, { user: { mustChangePassword: true } }],
    },
    select: { userId: true },
  });
  const ids = rows.map((r) => r.userId);
  if (!ids.length) return [];
  const liveElsewhere = await tx.participant.findMany({
    where: { userId: { in: ids }, eventId: { not: eventId }, status: 'CHECKED_IN', event: { status: { notIn: ['ENDED', 'JUDGING', 'PUBLISHED'] } } },
    select: { userId: true },
  });
  const skip = new Set(liveElsewhere.map((r) => r.userId));
  return ids.filter((id) => !skip.has(id));
}

/** Gives these users the event's default password (when it has one) and the forced change; ends their sessions. */
export async function applyEventDefault(tx: Tx, eventId: string, hash: string, userIds?: string[]): Promise<number> {
  const targets = await defaultTargets(tx, eventId, userIds);
  if (!targets.length) return 0;
  await tx.user.updateMany({ where: { id: { in: targets } }, data: { passwordHash: hash, mustChangePassword: true } });
  await tx.authSession.deleteMany({ where: { userId: { in: targets } } });
  return targets.length;
}

/**
 * Sets (or with `null` clears) the event's default password. Setting it applies it to every participant it may
 * apply to (see `defaultTargets`). Clearing it leaves passwords alone; badges go back to per-person passwords.
 */
export async function setEventDefaultPassword(
  prisma: PrismaClient,
  eventId: string,
  password: string | null,
  actor: Actor & { reason?: string | undefined },
): Promise<{ ok: true; hasDefault: boolean; applied: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, slug: true } });
  if (!event) throw notFound('That event');
  let hash: string | null = null;
  if (password !== null) {
    const strength = checkPasswordStrength(password, event.slug);
    if (!strength.ok) throw badRequest(strength.reason);
    hash = await hashPassword(password);
  }
  const applied = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id} FOR NO KEY UPDATE`;
    await tx.event.update({ where: { id: event.id }, data: { defaultPasswordHash: hash } });
    const n = hash ? await applyEventDefault(tx, event.id, hash) : 0;
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: hash ? 'event.default_password_set' : 'event.default_password_cleared',
        targetType: 'event',
        targetId: event.id,
        // Never the password or its hash.
        after: { applied: n },
        reason: actor.reason ?? null,
        requestId: actor.requestId,
      },
    });
    return n;
  });
  return { ok: true, hasDefault: hash !== null, applied };
}

/** Staff put one participant back on the event's default password (forced change, sessions end). */
export async function resetToEventDefault(prisma: PrismaClient, userId: string, eventId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.participant.findFirst({
      where: { userId, eventId },
      select: { id: true, user: { select: { role: true } }, event: { select: { defaultPasswordHash: true } } },
    });
    if (!p || p.user.role !== 'PARTICIPANT') throw notFound('That participant');
    const hash = p.event.defaultPasswordHash;
    if (!hash) throw conflict('no_default_password', 'This event has no default password. Set one in the setup roadmap (step 06) first.');
    await tx.user.update({ where: { id: userId }, data: { passwordHash: hash, mustChangePassword: true } });
    const { count } = await tx.authSession.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'user.password_reset_to_default', targetType: 'user', targetId: userId, after: { eventId, endedSessions: count }, requestId: actor.requestId },
    });
    return { ok: true, endedSessions: count };
  });
}
