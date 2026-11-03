/**
 * Participants in the admin console and at the desk (ADR-010, ADR-013): import, list, export, delete (anonymise).
 * Accounts start inactive; badges (checkin-service) carry the password and the check-in code.
 */
import { generatePassword, hashPassword } from '@codehaunt/auth';
import { toParticipantVerdict } from '@codehaunt/core';
import { EventConfig, type ParticipantImportRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { notFound } from './errors.ts';

type Actor = { id: string; requestId: string };

/**
 * Adds participants (skipping enrolment numbers already in the event). Registrations beyond the event's check-in cap
 * are waitlisted (R8-Q5). The username is the lower-cased enrolment number; the password is set when badges are issued.
 */
export async function importParticipants(prisma: PrismaClient, input: ParticipantImportRequest, actor: Actor) {
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, config: true } });
  if (!event) throw notFound('That event');
  const cap = EventConfig.parse(event.config).access.checkInCap;
  // A random, never-shown password: nobody can sign in before a badge is issued (and the account activated).
  const placeholderHash = await hashPassword(generatePassword(32));
  const created: string[] = [];
  const skipped: Array<{ enrolmentNo: string; reason: string }> = [];
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id} FOR NO KEY UPDATE`;
    let registered = await tx.participant.count({ where: { eventId: event.id, status: { in: ['REGISTERED', 'CHECKED_IN'] } } });
    for (const row of input.rows) {
      const username = row.enrolmentNo.toLowerCase();
      const existing = await tx.user.findUnique({ where: { username }, select: { id: true, role: true } });
      if (existing && existing.role !== 'PARTICIPANT') {
        skipped.push({ enrolmentNo: row.enrolmentNo, reason: 'username belongs to a staff account' });
        continue;
      }
      if (existing && (await tx.participant.findUnique({ where: { eventId_userId: { eventId: event.id, userId: existing.id } } }))) {
        skipped.push({ enrolmentNo: row.enrolmentNo, reason: 'already registered' });
        continue;
      }
      if (row.email && (await tx.user.findFirst({ where: { email: row.email.toLowerCase(), NOT: { username } } }))) {
        skipped.push({ enrolmentNo: row.enrolmentNo, reason: 'email used by another account' });
        continue;
      }
      if (existing) {
        const live = await tx.participant.findFirst({
          where: { userId: existing.id, status: 'CHECKED_IN', event: { status: { in: ['CHECK_IN', 'RUNNING', 'PAUSED'] } } },
          select: { id: true },
        });
        if (live) {
          // Signing them out would end their contest elsewhere (audit run-11 R11-3).
          skipped.push({ enrolmentNo: row.enrolmentNo, reason: 'checked in at another live event' });
          continue;
        }
        // Re-imported from an earlier event: inactive again until scanned at this event's desk (audit L4).
        await tx.user.update({ where: { id: existing.id }, data: { active: false } });
        await tx.authSession.deleteMany({ where: { userId: existing.id } });
      }
      const user = existing ?? (await tx.user.create({
        data: { username, name: row.name, email: row.email?.toLowerCase() ?? null, role: 'PARTICIPANT', passwordHash: placeholderHash, active: false },
        select: { id: true, role: true },
      }));
      const status = registered < cap ? 'REGISTERED' : 'WAITLISTED';
      if (status === 'REGISTERED') registered++;
      const p = await tx.participant.create({
        data: { eventId: event.id, userId: user.id, enrolmentNo: row.enrolmentNo, phone: row.phone ?? null, status },
        select: { id: true },
      });
      created.push(p.id);
    }
    await tx.auditLog.create({
      // Counts and reasons only: the audit log is append-only and outlives anonymisation (ADR-010).
      data: { actorId: actor.id, action: 'participant.imported', targetType: 'event', targetId: event.id, after: { created: created.length, skipped: skipped.map((s) => s.reason) }, requestId: actor.requestId },
    });
  });
  return { created: created.length, skipped };
}

/** Desk and console list. No prompts, scores or token data: volunteers see this too (ADR-013). */
export async function listParticipants(prisma: PrismaClient, eventId: string) {
  const rows = await prisma.participant.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { enrolmentNo: 'asc' }],
    select: {
      id: true, enrolmentNo: true, status: true, seatLabel: true, checkedInAt: true, checkInTokenHash: true, consentAt: true,
      user: { select: { id: true, name: true, username: true, active: true } },
    },
  });
  return rows.map(({ checkInTokenHash, user, checkedInAt, consentAt, ...p }) => ({
    ...p,
    userId: user.id,
    name: user.name,
    username: user.username,
    active: user.active,
    badgeIssued: checkInTokenHash !== null,
    checkedInAt: checkedInAt?.toISOString() ?? null,
    consented: consentAt !== null,
  }));
}

/** Everything held about one participant (ADR-010 export). Hidden-test output is projected out like everywhere else. */
export async function exportParticipant(prisma: PrismaClient, participantId: string, actor: Actor) {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      user: { select: { username: true, name: true, email: true, createdAt: true, lastLoginAt: true } },
      chatSessions: { include: { turns: { orderBy: { ord: 'asc' } }, codeVersions: { orderBy: { createdAt: 'asc' } } } },
      submissions: { include: { verdict: true } },
      judgeReviews: true,
      scoreOverrides: true,
      tokenLedger: { orderBy: { id: 'asc' } },
    },
  });
  if (!p) throw notFound('That participant');
  const authSessions = await prisma.authSession.findMany({ where: { userId: p.userId }, select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true } });
  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ targetType: 'participant', targetId: p.id }, { targetType: 'user', targetId: p.userId }, { actorId: p.userId }] },
    orderBy: { id: 'asc' },
    select: { action: true, createdAt: true, after: true, reason: true },
  });
  await prisma.auditLog.create({ data: { actorId: actor.id, action: 'participant.exported', targetType: 'participant', targetId: participantId, requestId: actor.requestId } });
  return {
    participant: {
      enrolmentNo: p.enrolmentNo, phone: p.phone, status: p.status, seatLabel: p.seatLabel, checkedInAt: p.checkedInAt,
      consentAt: p.consentAt, reuseConsent: p.reuseConsent, guardianConsent: p.guardianConsent, ...p.user,
    },
    sessions: p.chatSessions.map((s) => ({
      problemId: s.problemId, language: s.language, createdAt: s.createdAt, closedAt: s.closedAt,
      turns: s.turns.map((t) => ({ prompt: t.prompt, reply: t.reply, promptTokens: t.promptTokens, completionTokens: t.completionTokens, createdAt: t.createdAt })),
      codeVersions: s.codeVersions.map((v) => ({ language: v.language, source: v.source, createdAt: v.createdAt })),
    })),
    runs: p.submissions.map((s) => ({ problemId: s.problemId, createdAt: s.createdAt, ...toParticipantVerdict({ id: s.id, kind: s.kind, status: s.status, verdict: s.verdict }, new Set()) })),
    reviews: p.judgeReviews.map((r) => ({ problemId: r.problemId, score: r.score, rationale: r.rationale, createdAt: r.createdAt })),
    overrides: p.scoreOverrides.map((o) => ({ problemId: o.problemId, component: o.component, value: o.value, reason: o.reason, createdAt: o.createdAt })),
    tokens: p.tokenLedger.map((t) => ({ kind: t.kind, delta: t.delta, reason: t.reason, createdAt: t.createdAt })),
    signIns: authSessions,
    auditTrail: audit,
  };
}

/**
 * Deletion on request (ADR-010). The ledgers are append-only and reference the participant, so the rows stay and
 * everything identifying is erased: name, contact, enrolment number, prompts, replies and code. The account is
 * deactivated and signed out. Not reversible.
 */
export async function anonymiseParticipant(prisma: PrismaClient, participantId: string, actor: Actor & { reason: string }) {
  await prisma.$transaction(async (tx) => {
    const p = await tx.participant.findUnique({ where: { id: participantId }, select: { id: true, userId: true } });
    if (!p) throw notFound('That participant');
    const tag = `deleted-${p.id}`;
    await tx.promptTurn.updateMany({ where: { chatSession: { participantId: p.id } }, data: { prompt: '', reply: '' } });
    await tx.codeVersion.updateMany({ where: { chatSession: { participantId: p.id } }, data: { source: '' } });
    // Compiler logs and output excerpts come from their code; judge text and override reasons describe them.
    await tx.verdict.updateMany({ where: { submission: { participantId: p.id } }, data: { compileLog: '', results: [] } });
    await tx.judgeReview.updateMany({ where: { participantId: p.id }, data: { rationale: '', raw: {} } });
    await tx.scoreOverride.updateMany({ where: { participantId: p.id }, data: { reason: '' } });
    await tx.participant.update({ where: { id: p.id }, data: { enrolmentNo: tag, phone: null, seatLabel: null, checkInTokenHash: null } });
    // Signed out (and their sign-in records with IPs gone) in every case.
    await tx.authSession.deleteMany({ where: { userId: p.userId } });
    // A user may belong to several events; only a user with no other participation is erased.
    if ((await tx.participant.count({ where: { userId: p.userId } })) === 1) {
      await tx.user.update({ where: { id: p.userId }, data: { username: tag, name: 'Deleted participant', email: null, active: false } });
    }
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'participant.anonymised', targetType: 'participant', targetId: p.id, reason: actor.reason, requestId: actor.requestId },
    });
  });
  return { ok: true };
}
