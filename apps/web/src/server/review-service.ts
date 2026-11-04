/**
 * Batch-judge review (WP-07 task 6, ADR-009/033/035): staff queue judging after the contest, read every participant's
 * judge scores, rationale and integrity flags, and override process quality (`overrideScore`, audited, reason
 * required). Flags never change a score by themselves. Judge rationale can quote participant text: render as text.
 */
import { JUDGE_RUBRIC_VERSION_V2, similarityFlags, type SimilarityFlag } from '@codehaunt/core';
import type { PrismaClient } from '@codehaunt/db';

import { conflict, notFound } from './errors.ts';

export interface Actor {
  id: string;
  requestId: string;
}

/** Queues one judge job per checked-in participant who hasn't one for this rubric yet. Only once the contest ended. */
export async function queueJudging(prisma: PrismaClient, eventId: string, reason: string, actor: Actor): Promise<{ queued: number }> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, status: true, resultsState: true } });
  if (!event) throw notFound('That event');
  if (event.status !== 'ENDED' && event.status !== 'JUDGING') throw conflict('contest_not_ended', 'Judging starts after the contest has ended.');
  if (event.resultsState === 'FINAL') throw conflict('results_final', 'The results are final.');
  const participants = await prisma.participant.findMany({ where: { eventId, status: 'CHECKED_IN' }, select: { id: true } });
  return prisma.$transaction(async (tx) => {
    const created = await tx.judgeJob.createMany({
      data: participants.map((p) => ({ eventId, participantId: p.id, rubricVersion: JUDGE_RUBRIC_VERSION_V2 })),
      skipDuplicates: true,
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'judge.queued', targetType: 'event', targetId: eventId, after: { queued: created.count, rubric: JUDGE_RUBRIC_VERSION_V2 }, reason, requestId: actor.requestId },
    });
    return { queued: created.count };
  });
}

/** Puts one participant's job back in the queue (after NEEDS_MANUAL, or to judge again). */
export async function requeueJudgeJob(prisma: PrismaClient, jobId: string, reason: string, actor: Actor): Promise<{ ok: true }> {
  const job = await prisma.judgeJob.findUnique({ where: { id: jobId }, select: { id: true, status: true, participantId: true, event: { select: { resultsState: true } } } });
  if (!job) throw notFound('That judge job');
  if (job.event.resultsState === 'FINAL') throw conflict('results_final', 'The results are final.');
  // One atomic status check (audit R14-6): two staff clicking at once requeue it once, never a RUNNING job.
  return prisma.$transaction(async (tx) => {
    const moved = await tx.judgeJob.updateMany({
      where: { id: jobId, status: { in: ['DONE', 'NEEDS_MANUAL'] } },
      data: { status: 'QUEUED', error: null, startedAt: null, finishedAt: null },
    });
    if (moved.count === 0) throw conflict('judge_busy', 'That participant is already queued or being judged.');
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'judge.requeued', targetType: 'participant', targetId: job.participantId, reason, requestId: actor.requestId } });
    return { ok: true as const };
  });
}

export interface ReviewRow {
  participantId: string;
  name: string;
  enrolmentNo: string;
  job: { id: string; status: string; attempts: number; error: string | null; durationMs: number | null } | null;
  overall: { score: number; rationale: string; model: string; createdAt: string } | null;
  /** How many times this participant was judged (each run writes one overall row): re-judging shows (R14-6). */
  runs: number;
  problems: Array<{ problemId: string; score: number; rationale: string; criteria: Record<string, number> | null; complexityAchieved: string | null; complexityOptimal: string | null }>;
  injection: { flagged: boolean; evidence: string; hints: string[] };
  flags: Array<{ problemId: string; saveBursts: number; aiCopiedLines: number; codeHeavyQuestions: number }>;
  similarity: Array<{ problemId: string; kind: string; other: string; score: number }>;
  processOverride: number | null;
}

export interface ReviewBoard {
  event: { id: string; name: string; status: string; resultsState: string };
  rubric: string;
  counts: Record<'QUEUED' | 'RUNNING' | 'DONE' | 'NEEDS_MANUAL' | 'none', number>;
  problems: Array<{ id: string; title: string }>;
  rows: ReviewRow[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);

export async function reviewBoard(prisma: PrismaClient, eventId: string): Promise<ReviewBoard> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, status: true, resultsState: true } });
  if (!event) throw notFound('That event');
  const problems = await prisma.problem.findMany({ where: { eventId, practice: false }, orderBy: { ord: 'asc' }, select: { id: true, title: true } });
  const participants = await prisma.participant.findMany({
    where: { eventId, status: { in: ['CHECKED_IN', 'DISQUALIFIED'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, enrolmentNo: true, user: { select: { name: true } } },
  });
  const ids = participants.map((p) => p.id);
  const jobs = await prisma.judgeJob.findMany({ where: { participantId: { in: ids }, rubricVersion: JUDGE_RUBRIC_VERSION_V2 } });
  const reviews = await prisma.judgeReview.findMany({ where: { participantId: { in: ids }, rubricVersion: JUDGE_RUBRIC_VERSION_V2 }, orderBy: { createdAt: 'asc' } });
  const overrides = await prisma.scoreOverride.findMany({ where: { participantId: { in: ids }, component: 'processQuality', problemId: null }, orderBy: { createdAt: 'asc' } });

  // Cross-participant similarity on questions and final code, per problem (ADR-009 integrity flag).
  const turns = await prisma.promptTurn.findMany({
    where: { chatSession: { participantId: { in: ids }, problem: { eventId, practice: false } } },
    select: { prompt: true, chatSession: { select: { participantId: true, problemId: true } } },
  });
  const versions = await prisma.codeVersion.findMany({
    where: { chatSession: { participantId: { in: ids }, problem: { eventId, practice: false } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { source: true, chatSession: { select: { participantId: true, problemId: true } } },
  });
  // The code the judge scores (audit R14-8): the first accepted submission's version, else the newest save.
  const finalCode = new Map<string, string>();
  for (const v of versions) finalCode.set(`${v.chatSession.participantId}\u0000${v.chatSession.problemId}`, v.source);
  const accepted = await prisma.submission.findMany({
    where: { participantId: { in: ids }, kind: 'SUBMIT', verdict: { verdict: 'AC' }, problem: { eventId, practice: false } },
    orderBy: { createdAt: 'desc' },
    select: { participantId: true, problemId: true, codeVersion: { select: { source: true } } },
  });
  // Newest first, so the earliest AC is written last and wins.
  for (const s of accepted) finalCode.set(`${s.participantId}\u0000${s.problemId}`, s.codeVersion.source);
  const similar: SimilarityFlag[] = similarityFlags([
    ...turns.map((t) => ({ participantId: t.chatSession.participantId, problemId: t.chatSession.problemId, kind: 'prompt' as const, text: t.prompt })),
    ...[...finalCode].map(([key, text]) => {
      const [participantId, problemId] = key.split('\u0000') as [string, string];
      return { participantId, problemId, kind: 'code' as const, text };
    }),
  ]);
  const names = new Map(participants.map((p) => [p.id, p.user.name]));

  const counts: ReviewBoard['counts'] = { QUEUED: 0, RUNNING: 0, DONE: 0, NEEDS_MANUAL: 0, none: 0 };
  const rows = participants.map((p): ReviewRow => {
    const job = jobs.find((j) => j.participantId === p.id) ?? null;
    counts[job ? job.status : 'none'] += 1;
    const mine = reviews.filter((r) => r.participantId === p.id);
    const overall = mine.filter((r) => r.problemId === null).at(-1) ?? null;
    const raw = obj(overall?.raw);
    const output = obj(raw?.output);
    const perProblem = new Map<string, (typeof mine)[number]>();
    for (const r of mine) if (r.problemId) perProblem.set(r.problemId, r);
    return {
      participantId: p.id,
      name: p.user.name,
      enrolmentNo: p.enrolmentNo,
      job: job && { id: job.id, status: job.status, attempts: job.attempts, error: job.error, durationMs: job.durationMs },
      overall: overall && { score: overall.score, rationale: overall.rationale, model: overall.model, createdAt: overall.createdAt.toISOString() },
      runs: mine.filter((r) => r.problemId === null).length,
      problems: [...perProblem.values()].map((r) => {
        const review = obj(r.raw);
        return {
          problemId: r.problemId!,
          score: r.score,
          rationale: r.rationale,
          criteria: (obj(review?.criteria) as Record<string, number> | null) ?? null,
          complexityAchieved: typeof review?.complexityAchieved === 'string' ? review.complexityAchieved : null,
          complexityOptimal: typeof review?.complexityOptimal === 'string' ? review.complexityOptimal : null,
        };
      }),
      injection: {
        flagged: overall?.injectionFlag ?? false,
        evidence: typeof output?.injectionEvidence === 'string' ? output.injectionEvidence : '',
        hints: Array.isArray(raw?.injectionHints) ? (raw.injectionHints as unknown[]).filter((h): h is string => typeof h === 'string') : [],
      },
      flags: Array.isArray(raw?.flags)
        ? (raw.flags as unknown[]).flatMap((f) => {
            const x = obj(f);
            if (!x || typeof x.problemId !== 'string') return [];
            const bursts = Array.isArray(x.saveBursts) ? x.saveBursts.length : 0;
            return [{ problemId: x.problemId, saveBursts: bursts, aiCopiedLines: Number(x.aiCopiedLines) || 0, codeHeavyQuestions: Number(x.codeHeavyQuestions) || 0 }];
          })
        : [],
      similarity: similar
        .filter((s) => s.a === p.id || s.b === p.id)
        .map((s) => ({ problemId: s.problemId, kind: s.kind, other: names.get(s.a === p.id ? s.b : s.a) ?? '?', score: s.score })),
      processOverride: overrides.filter((o) => o.participantId === p.id).at(-1)?.value ?? null,
    };
  });
  return { event, rubric: JUDGE_RUBRIC_VERSION_V2, counts, problems, rows };
}
