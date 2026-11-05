/**
 * Participants in the admin console and at the desk (ADR-010, ADR-013): import, list, export, delete (anonymise).
 * Accounts start inactive; badges (checkin-service) carry the password and the check-in code.
 */
import { generatePassword, hashPassword } from '@codehaunt/auth';
import { toParticipantVerdict } from '@codehaunt/core';
import { EventConfig, ParticipantRow, type ImportIssue, type ParticipantImportRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { applyEventDefault } from './default-password-service.ts';
import { notFound } from './errors.ts';

type Actor = { id: string; requestId: string };
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type ParticipantRowT = ParticipantRow;

/** One row as the preview shows it: what will be created, and whether it lands on the waitlist (R8-Q5). */
export interface ImportPreviewRow {
  line: number | null;
  enrolmentNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'REGISTERED' | 'WAITLISTED';
  existingAccount: boolean;
}

export interface ImportResult {
  dryRun: boolean;
  /** True when no row has an issue: a commit imports every row. */
  ok: boolean;
  created: number;
  rows: ImportPreviewRow[];
  issues: ImportIssue[];
}

const COLUMN: Record<string, ImportIssue['column']> = { enrolmentNo: 'enrolment', name: 'name', email: 'email', phone: 'phone' };
const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());

/**
 * Strict import (ADR-044). Every row is checked (format, duplicates in the file, already in this event, staff
 * usernames, emails of other accounts, checked in at another live event) and every problem is reported with its line
 * and column. A dry run stops there. A commit re-checks inside one transaction serialised on the event row and writes
 * all rows or none: one bad row means nothing is imported. Rows beyond the check-in cap are waitlisted, not refused.
 * The username is the lower-cased enrolment number; the password comes from the badge or the event default (ADR-041).
 */
export async function importParticipants(prisma: PrismaClient, input: ParticipantImportRequest, actor: Actor): Promise<ImportResult> {
  const event = await prisma.event.findUnique({ where: { id: input.eventId }, select: { id: true, config: true, defaultPasswordHash: true } });
  if (!event) throw notFound('That event');
  const cap = EventConfig.parse(event.config).access.checkInCap;
  const dryRun = input.dryRun === true;
  // A random, never-shown password: nobody can sign in before a badge is issued (and the account activated).
  const placeholderHash = dryRun || event.defaultPasswordHash ? null : await hashPassword(generatePassword(32));

  const run = async (tx: Tx): Promise<ImportResult> => {
    if (!dryRun) await tx.$queryRaw`SELECT id FROM events WHERE id = ${event.id} FOR NO KEY UPDATE`;
    const issues: ImportIssue[] = [];
    const valid: Array<{ line: number | null; row: ParticipantRowT }> = [];
    const seenEnrol = new Map<string, number | null>();
    const seenEmail = new Map<string, number | null>();
    input.rows.forEach((raw, i) => {
      const line = raw.line ?? null;
      const label = raw.enrolmentNo.trim() || `row ${i + 1}`;
      const parsed = ParticipantRow.safeParse({
        name: raw.name, enrolmentNo: raw.enrolmentNo, email: blank(raw.email), phone: blank(raw.phone),
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          issues.push({ line, enrolmentNo: label, column: COLUMN[key] ?? null, message: rowMessage(key, raw) });
        }
        return;
      }
      const row = parsed.data;
      const enrol = row.enrolmentNo.toLowerCase();
      if (seenEnrol.has(enrol)) {
        issues.push({ line, enrolmentNo: label, column: 'enrolment', message: `Enrolment number appears twice in the file${at(seenEnrol.get(enrol))}.` });
        return;
      }
      seenEnrol.set(enrol, line);
      if (row.email) {
        const email = row.email.toLowerCase();
        if (seenEmail.has(email)) {
          issues.push({ line, enrolmentNo: label, column: 'email', message: `Email appears twice in the file${at(seenEmail.get(email))}.` });
          return;
        }
        seenEmail.set(email, line);
      }
      valid.push({ line, row });
    });

    const preview: ImportPreviewRow[] = [];
    let registered = await tx.participant.count({ where: { eventId: event.id, status: { in: ['REGISTERED', 'CHECKED_IN'] } } });
    const plan: Array<{ row: ParticipantRowT; existing: { id: string } | null; status: 'REGISTERED' | 'WAITLISTED' }> = [];
    for (const { line, row } of valid) {
      const username = row.enrolmentNo.toLowerCase();
      const issue = (column: ImportIssue['column'], message: string) => issues.push({ line, enrolmentNo: row.enrolmentNo, column, message });
      const existing = await tx.user.findUnique({ where: { username }, select: { id: true, role: true } });
      if (existing && existing.role !== 'PARTICIPANT') {
        issue('enrolment', 'This enrolment number is a staff username. Use a different one.');
        continue;
      }
      if (existing && (await tx.participant.findUnique({ where: { eventId_userId: { eventId: event.id, userId: existing.id } } }))) {
        issue('enrolment', 'Already registered for this event. Remove the row.');
        continue;
      }
      if (row.email && (await tx.user.findFirst({ where: { email: row.email.toLowerCase(), NOT: { username } }, select: { id: true } }))) {
        issue('email', 'This email belongs to another account. Use the person’s own email or leave it empty.');
        continue;
      }
      if (existing) {
        const live = await tx.participant.findFirst({
          // Any event that hasn't ended counts, including a draft already checking in (run-12 R12-2).
          where: { userId: existing.id, status: 'CHECKED_IN', event: { status: { notIn: ['ENDED', 'JUDGING', 'PUBLISHED'] } } },
          select: { id: true },
        });
        if (live) {
          // Signing them out would end their contest elsewhere (audit run-11 R11-3).
          issue('enrolment', 'Checked in at another event that has not ended. Import them after it ends.');
          continue;
        }
      }
      const status = registered < cap ? 'REGISTERED' : 'WAITLISTED';
      if (status === 'REGISTERED') registered++;
      plan.push({ row, existing, status });
      preview.push({ line, enrolmentNo: row.enrolmentNo, name: row.name, email: row.email ?? null, phone: row.phone ?? null, status, existingAccount: existing !== null });
    }
    issues.sort((x, y) => (x.line ?? 0) - (y.line ?? 0));
    if (dryRun || issues.length) return { dryRun, ok: issues.length === 0, created: 0, rows: preview, issues };

    const userIds: string[] = [];
    for (const { row, existing, status } of plan) {
      const username = row.enrolmentNo.toLowerCase();
      if (existing) {
        // Re-imported from an earlier event: inactive again until scanned at this event's desk (audit L4).
        await tx.user.update({ where: { id: existing.id }, data: { active: false } });
        await tx.authSession.deleteMany({ where: { userId: existing.id } });
      }
      const user = existing ?? (await tx.user.create({
        data: {
          username, name: row.name, email: row.email?.toLowerCase() ?? null, role: 'PARTICIPANT',
          passwordHash: event.defaultPasswordHash ?? placeholderHash!, mustChangePassword: event.defaultPasswordHash !== null, active: false,
        },
        select: { id: true },
      }));
      await tx.participant.create({ data: { eventId: event.id, userId: user.id, enrolmentNo: row.enrolmentNo, phone: row.phone ?? null, status } });
      userIds.push(user.id);
    }
    // ADR-041: re-imported accounts get the event default too.
    if (event.defaultPasswordHash) await applyEventDefault(tx, event.id, event.defaultPasswordHash, userIds);
    await tx.auditLog.create({
      // Counts only: the audit log is append-only and outlives anonymisation (ADR-010).
      data: { actorId: actor.id, action: 'participant.imported', targetType: 'event', targetId: event.id, after: { created: plan.length, waitlisted: plan.filter((p) => p.status === 'WAITLISTED').length }, requestId: actor.requestId },
    });
    return { dryRun, ok: true, created: plan.length, rows: preview, issues: [] };
  };

  return dryRun ? run(prisma as unknown as Tx) : prisma.$transaction(run, { timeout: 60_000 });
}

const at = (line: number | null | undefined) => (line ? ` (first on line ${line})` : '');

function rowMessage(key: string, raw: { name: string; enrolmentNo: string }): string {
  switch (key) {
    case 'name':
      return raw.name.trim() ? 'Name is too long (at most 120 characters).' : 'Name is missing.';
    case 'enrolmentNo':
      return raw.enrolmentNo.trim()
        ? 'Enrolment number may use only letters, digits, / _ - (at most 40 characters).'
        : 'Enrolment number is missing.';
    case 'email':
      return 'Not a valid email address (or leave it empty).';
    case 'phone':
      return 'Phone must be 6–20 digits (spaces, + and - allowed), or empty.';
    default:
      return 'This row does not match the template.';
  }
}

/** Desk and console list. No prompts, scores or token data: volunteers see this too (ADR-013). */
export async function listParticipants(prisma: PrismaClient, eventId: string) {
  const rows = await prisma.participant.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { enrolmentNo: 'asc' }],
    select: {
      id: true, enrolmentNo: true, status: true, seatLabel: true, checkedInAt: true, checkInTokenHash: true, consentAt: true,
      user: { select: { id: true, name: true, username: true, active: true, mustChangePassword: true, sessions: { where: { expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 } } },
    },
  });
  return rows.map(({ checkInTokenHash, user, checkedInAt, consentAt, ...p }) => ({
    ...p,
    userId: user.id,
    name: user.name,
    username: user.username,
    active: user.active,
    /** Has a live sign-in session now (WP-11 participant management). */
    signedIn: user.sessions.length > 0,
    /** Still on the event's default password (ADR-041). */
    mustChangePassword: user.mustChangePassword,
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
 * Remove a participant (ADR-044). Without any activity (no token ledger rows, chats, submissions, reviews, overrides,
 * incidents or judge jobs) the participant row is deleted, and the account too when it belongs to no other event and
 * has never acted (append-only audit rows reference actors). With activity the data is anonymised instead
 * (`anonymiseParticipant`), because the ledgers are append-only. Admin only; audit-logged; not reversible.
 */
export async function removeParticipant(prisma: PrismaClient, participantId: string, actor: Actor & { reason: string }) {
  const mode = await prisma.$transaction(async (tx) => {
    const p = await tx.participant.findUnique({
      where: { id: participantId },
      select: {
        id: true, eventId: true, userId: true,
        _count: { select: { tokenLedger: true, chatSessions: true, submissions: true, judgeReviews: true, scoreOverrides: true, incidents: true, judgeJobs: true } },
      },
    });
    if (!p) throw notFound('That participant');
    if (Object.values(p._count).some((c) => c > 0)) return 'anonymise' as const;
    await tx.participant.delete({ where: { id: p.id } });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: p.userId },
      select: { role: true, _count: { select: { participants: true, auditEntries: true } } },
    });
    await tx.authSession.deleteMany({ where: { userId: p.userId } });
    const userDeleted = user.role === 'PARTICIPANT' && user._count.participants === 0 && user._count.auditEntries === 0;
    if (userDeleted) await tx.user.delete({ where: { id: p.userId } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: 'participant.deleted', targetType: 'participant', targetId: p.id,
        after: { eventId: p.eventId, userDeleted }, reason: actor.reason, requestId: actor.requestId,
      },
    });
    return 'deleted' as const;
  });
  if (mode === 'deleted') return { ok: true, mode };
  await anonymiseParticipant(prisma, participantId, actor);
  return { ok: true, mode: 'anonymised' as const };
}

/** What `removeParticipant` will do, for the confirm dialog. */
export async function removalMode(prisma: PrismaClient, participantId: string): Promise<'deleted' | 'anonymised'> {
  const p = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { _count: { select: { tokenLedger: true, chatSessions: true, submissions: true, judgeReviews: true, scoreOverrides: true, incidents: true, judgeJobs: true } } },
  });
  if (!p) throw notFound('That participant');
  return Object.values(p._count).some((c) => c > 0) ? 'anonymised' : 'deleted';
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
