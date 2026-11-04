/**
 * Incident dashboard (ADR-021, ADR-028). Staff-only. Sources: the `incidents` table (judge IE after the re-check,
 * docker-proxy refusals; written by the worker), replaced participant sessions (audit_log), accounts whose logins are
 * being slowed (in memory, ADR-020) and dead-letter runs (FAILED). `detail.internalError` can hold participant output:
 * it is returned as a plain string and the UI renders it as text, never HTML.
 */
import { slowedUsernames } from '@codehaunt/auth';
import type { IncidentActionRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';
import { participantActionIn, type Actor } from './contest-ops-service.ts';

const MAX_TEXT = 4000;
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : null);

/**
 * `internalError` can echo program output, and through it a hidden-test input: only admins (who may see hidden tests)
 * get the text; organizers see that an incident happened (audit run-13 needs-validation item).
 */
export async function listIncidents(prisma: PrismaClient, eventId: string, viewer: { role: string }) {
  const showText = viewer.role === 'ADMIN';
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, createdAt: true } });
  if (!event) throw notFound('That event');
  const participantSelect = { id: true, enrolmentNo: true, user: { select: { name: true, username: true } } } as const;

  const rows = await prisma.incident.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      participant: { select: participantSelect },
      submission: { select: { id: true, kind: true, status: true, problem: { select: { title: true } }, verdict: { select: { verdict: true } } } },
    },
  });
  const participants = await prisma.participant.findMany({ where: { eventId }, select: { ...participantSelect, userId: true } });
  const byUser = new Map(participants.map((p) => [p.userId, p]));
  const byUsername = new Map(participants.map((p) => [p.user.username, p]));
  const who = (p: { id: string; enrolmentNo: string; user: { name: string } } | null | undefined) =>
    p ? { participantId: p.id, name: p.user.name, enrolmentNo: p.enrolmentNo } : null;

  const replaced = await prisma.auditLog.findMany({
    where: { action: 'auth.session_replaced', targetId: { in: [...byUser.keys()] }, createdAt: { gte: event.createdAt } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, targetId: true, after: true, createdAt: true },
  });
  const sebRefused = await prisma.auditLog.findMany({
    where: { action: 'auth.seb_refused', targetId: { in: [...byUser.keys()] }, createdAt: { gte: event.createdAt } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, targetId: true, createdAt: true },
  });
  const failed = await prisma.submission.findMany({
    where: { status: 'FAILED', problem: { eventId } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, kind: true, createdAt: true, problem: { select: { title: true } }, participant: { select: participantSelect } },
  });

  return {
    incidents: rows.map((i) => {
      const detail = (i.detail ?? {}) as Record<string, unknown>;
      return {
        id: i.id,
        kind: i.kind,
        status: i.status,
        createdAt: i.createdAt.toISOString(),
        participant: who(i.participant),
        submission: i.submission
          ? { id: i.submission.id, kind: i.submission.kind, status: i.submission.status, problem: i.submission.problem.title, verdict: i.submission.verdict?.verdict ?? null }
          : null,
        internalError: showText ? text(detail.internalError) : null,
        firstInternalError: showText ? text(detail.firstInternalError) : null,
        textHidden: !showText && (detail.internalError !== undefined || detail.firstInternalError !== undefined),
        penaltyReversed: i.penaltyReversed,
        resolution: i.resolution,
        resolvedAt: i.resolvedAt?.toISOString() ?? null,
      };
    }),
    sessionsReplaced: replaced.map((a) => ({
      id: String(a.id),
      createdAt: a.createdAt.toISOString(),
      participant: who(byUser.get(a.targetId ?? '')),
      ipChanged: Boolean((a.after as { ipChanged?: unknown } | null)?.ipChanged),
    })),
    sebRefusals: sebRefused.map((a) => ({ id: String(a.id), createdAt: a.createdAt.toISOString(), participant: who(byUser.get(a.targetId ?? '')) })),
    loginSlowdowns: slowedUsernames().map((s) => ({ ...s, participant: who(byUsername.get(s.username)) })),
    deadLetters: failed.map((f) => ({ id: f.id, kind: f.kind, createdAt: f.createdAt.toISOString(), problem: f.problem.title, participant: who(f.participant) })),
  };
}

/** Every action resolves the incident and writes an audit_log row with actor and reason. */
export async function actOnIncident(prisma: PrismaClient, incidentId: string, input: IncidentActionRequest, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({ where: { id: incidentId }, include: { event: { select: { resultsState: true } } } });
    if (!incident) throw notFound('That incident');
    if (incident.event.resultsState === 'FINAL' && (input.action === 'reverse_penalty' || input.action === 'rejudge')) {
      throw conflict('results_final', 'The results are final.');
    }
    let penaltyReversed = incident.penaltyReversed;
    switch (input.action) {
      case 'reverse_penalty':
        if (incident.kind !== 'JUDGE_IE' || !incident.submissionId) throw conflict('wrong_kind', 'Only a judge-error incident carries a penalty.');
        penaltyReversed = true;
        break;
      case 'rejudge': {
        if (!incident.submissionId) throw conflict('wrong_kind', 'This incident has no submission.');
        const sub = await tx.submission.findUniqueOrThrow({ where: { id: incident.submissionId }, select: { status: true } });
        if (sub.status === 'QUEUED' || sub.status === 'RUNNING') throw conflict('wrong_state', 'It is being judged already.');
        // A fresh judgement: the old verdict goes, the re-check-once rule applies again, and an earlier penalty
        // reversal no longer holds: a genuine wrong answer from the new run must count (R13-3).
        await tx.verdict.deleteMany({ where: { submissionId: incident.submissionId } });
        await tx.incident.updateMany({ where: { submissionId: incident.submissionId }, data: { penaltyReversed: false } });
        penaltyReversed = false;
        await tx.submission.update({
          where: { id: incident.submissionId },
          data: { status: 'QUEUED', attempts: 0, startedAt: null, finishedAt: null, firstInternalError: null },
        });
        break;
      }
      case 'end_session':
      case 'deactivate':
        if (!incident.participantId) throw conflict('wrong_kind', 'This incident has no participant.');
        await participantActionIn(tx, incident.participantId, { action: input.action, reason: input.reason }, actor);
        break;
      case 'dismiss':
        break;
    }
    const updated = await tx.incident.update({
      where: { id: incidentId },
      data: { status: 'RESOLVED', resolution: input.action, resolvedBy: actor.id, resolvedAt: new Date(), penaltyReversed },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id, action: `incident.${input.action}`, targetType: 'incident', targetId: incidentId,
        before: { status: incident.status, penaltyReversed: incident.penaltyReversed },
        after: { status: updated.status, penaltyReversed: updated.penaltyReversed, submissionId: incident.submissionId },
        reason: input.reason, requestId: actor.requestId,
      },
    });
    return { id: updated.id, status: updated.status, penaltyReversed: updated.penaltyReversed };
  });
}
