/**
 * Badges and QR check-in (ADR-013). Security-critical: Claude-owned.
 *
 * A badge carries a fresh password and a check-in code: 256 random bits, of which only the SHA-256 is stored, so
 * the code can't be forged or recovered from the database. Scanning it (staff only) checks the event's cap,
 * activates the account, records seat and time, grants the event's token budget once, clears the hash (single use)
 * and writes the audit log, all in one transaction serialised on the event row.
 */
import { createHash, randomBytes } from 'node:crypto';

import { generatePassword, hashPassword } from '@codehaunt/auth';
import { EventConfig } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { AppError, conflict, notFound } from './errors.ts';

const PREFIX = 'CH1:';
const TOKEN_PATTERN = /^CH1:([A-Za-z0-9_-]{43})$/;

const usedCode = () => new AppError(404, 'invalid_code', 'This check-in code is not valid or was already used.');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export interface Badge {
  participantId: string;
  name: string;
  enrolmentNo: string;
  username: string;
  password: string;
  /** What the QR encodes. Shown once, for printing; only its hash is kept. */
  checkInCode: string;
}

/**
 * (Re)issues badges for not-yet-checked-in participants of an event (all, or the listed ones). Reissuing replaces
 * the password and the code, so a lost badge stops working. Returned values are never stored or logged.
 */
export async function issueBadges(
  prisma: PrismaClient,
  input: { eventId: string; participantIds?: string[] | undefined; actorId: string; requestId: string },
): Promise<Badge[]> {
  const participants = await prisma.participant.findMany({
    where: {
      eventId: input.eventId,
      status: { in: ['REGISTERED', 'WAITLISTED'] },
      ...(input.participantIds ? { id: { in: input.participantIds } } : {}),
    },
    orderBy: { enrolmentNo: 'asc' },
    select: { id: true, enrolmentNo: true, user: { select: { id: true, name: true, username: true } } },
  });
  const badges: Badge[] = [];
  for (const p of participants) {
    const token = randomBytes(32).toString('base64url');
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.participant.update({ where: { id: p.id }, data: { checkInTokenHash: hash(token) } }),
      prisma.user.update({ where: { id: p.user.id }, data: { passwordHash } }),
      prisma.authSession.deleteMany({ where: { userId: p.user.id } }),
    ]);
    badges.push({
      participantId: p.id,
      name: p.user.name,
      enrolmentNo: p.enrolmentNo,
      username: p.user.username,
      password,
      checkInCode: `${PREFIX}${token}`,
    });
  }
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: 'checkin.badges_issued',
      targetType: 'event',
      targetId: input.eventId,
      after: { participantIds: badges.map((b) => b.participantId) },
      requestId: input.requestId,
    },
  });
  return badges;
}

export interface CheckInResult {
  participantId: string;
  name: string;
  enrolmentNo: string;
  seatLabel: string;
}

export async function checkIn(
  prisma: PrismaClient,
  input: { code: string; seatLabel: string; actorId: string; requestId: string },
): Promise<CheckInResult> {
  const match = TOKEN_PATTERN.exec(input.code.trim());
  if (!match) throw new AppError(400, 'invalid_code', 'That is not a CodeHaunt check-in code.');
  const tokenHash = hash(match[1]!);
  return prisma.$transaction(async (tx) => {
    const found = await tx.participant.findUnique({ where: { checkInTokenHash: tokenHash }, select: { id: true, eventId: true } });
    if (!found) throw usedCode();
    // Event row lock: concurrent scans see each other's check-ins, so the cap holds.
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${found.eventId} FOR UPDATE`;
    const p = await tx.participant.findUniqueOrThrow({
      where: { id: found.id },
      include: { user: { select: { id: true, name: true } }, event: { select: { config: true, status: true } } },
    });
    if (p.checkInTokenHash !== tokenHash) throw usedCode();
    if (p.status === 'WAITLISTED') throw conflict('waitlisted', 'This person is on the waitlist. Promote them at the desk first.');
    if (p.status !== 'REGISTERED') throw conflict('not_registered', 'This person cannot be checked in (status: ' + p.status.toLowerCase() + ').');
    const config = EventConfig.parse(p.event.config);
    const checkedIn = await tx.participant.count({ where: { eventId: p.eventId, status: 'CHECKED_IN' } });
    if (checkedIn >= config.access.checkInCap) throw conflict('at_capacity', `The event is full (${config.access.checkInCap} checked in).`);

    const now = new Date();
    await tx.participant.update({
      where: { id: p.id },
      data: { status: 'CHECKED_IN', checkedInAt: now, seatLabel: input.seatLabel, checkInTokenHash: null },
    });
    await tx.user.update({ where: { id: p.user.id }, data: { active: true } });
    await tx.tokenLedger.upsert({
      where: { idempotencyKey: `grant:${p.id}` },
      create: {
        eventId: p.eventId,
        participantId: p.id,
        kind: 'GRANT',
        delta: config.budget.tokensPerParticipant,
        actorId: input.actorId,
        reason: 'check-in',
        idempotencyKey: `grant:${p.id}`,
      },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'checkin.scanned',
        targetType: 'participant',
        targetId: p.id,
        after: { seatLabel: input.seatLabel, userActivated: p.user.id, granted: config.budget.tokensPerParticipant },
        requestId: input.requestId,
      },
    });
    return { participantId: p.id, name: p.user.name, enrolmentNo: p.enrolmentNo, seatLabel: input.seatLabel };
  });
}

/** Desk: move a waitlisted person up once a place is free (ADR-006, R8-Q5). */
export async function promoteFromWaitlist(
  prisma: PrismaClient,
  input: { participantId: string; actorId: string; requestId: string },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.participant.findUnique({ where: { id: input.participantId }, select: { status: true } });
    if (!p) throw notFound('That participant');
    if (p.status !== 'WAITLISTED') throw conflict('not_waitlisted', 'This person is not on the waitlist.');
    await tx.participant.update({ where: { id: input.participantId }, data: { status: 'REGISTERED' } });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'participant.promoted',
        targetType: 'participant',
        targetId: input.participantId,
        before: { status: 'WAITLISTED' },
        after: { status: 'REGISTERED' },
        requestId: input.requestId,
      },
    });
  });
}
