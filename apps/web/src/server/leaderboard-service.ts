/**
 * Leaderboard (WP-05; ADR-008, -009, -028): loads one event's rows and ranks them with `computeStandings`. The admin
 * board sees everything live; the projector (no login) sees rank, name and solved, cut at the freeze; the CSV export
 * is staff-only. Only SUBMITs on contest problems score: sample runs and practice never reach the scorer.
 */
import { computeStandings, type ReferenceResult, type ScoreComponentName, type ScoringParticipant, type Standing } from '@codehaunt/core';
import { EventConfig, ProjectorView, RunResult, ScoreComponent, type ScoreOverrideRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { eventClock } from './contest.ts';
import { conflict, notFound } from './errors.ts';
import { contestStatus, freezeCut, hashProjectorToken, type Actor } from './contest-ops-service.ts';

interface LoadOptions {
  /**
   * The projector's freeze: count only what was recorded before this instant — verdicts, prompts, overrides, penalty
   * reversals, judge reviews (R13-2). Disqualification is the exception: it takes someone off the board at once.
   */
  cutoff?: Date | null;
}

async function loadEvent(prisma: PrismaClient, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('That event');
  return { ...event, config: EventConfig.parse(event.config) };
}

type LoadedEvent = Awaited<ReturnType<typeof loadEvent>>;

export async function standingsFor(prisma: PrismaClient, event: LoadedEvent, options: LoadOptions = {}) {
  const cutoff = options.cutoff ?? null;
  const start = eventClock(event, new Date()).startsAt.getTime();
  const problems = await prisma.problem.findMany({
    where: { eventId: event.id, practice: false },
    orderBy: { ord: 'asc' },
    select: { id: true, slug: true, title: true, difficulty: true },
  });
  const participants = await prisma.participant.findMany({
    where: { eventId: event.id, status: { in: ['CHECKED_IN', 'DISQUALIFIED'] } },
    select: { id: true, status: true, enrolmentNo: true, user: { select: { name: true } } },
  });
  const submissions = await prisma.submission.findMany({
    where: { kind: 'SUBMIT', problem: { eventId: event.id, practice: false }, ...(cutoff ? { createdAt: { lt: cutoff } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: {
      participantId: true, problemId: true, contestMs: true, createdAt: true, status: true,
      codeVersion: { select: { language: true } },
      verdict: { select: { verdict: true, maxTimeMs: true, maxMemoryKb: true, createdAt: true } },
      incidents: { where: { penaltyReversed: true, ...(cutoff ? { resolvedAt: { lt: cutoff } } : {}) }, select: { id: true } },
    },
  });
  const tokenRows = await prisma.$queryRaw<Array<{ participantId: string; tokens: bigint | number | null }>>`
    SELECT cs."participantId", SUM(pt."promptTokens" + pt."completionTokens") AS tokens
    FROM prompt_turns pt
    JOIN chat_sessions cs ON cs.id = pt."chatSessionId"
    JOIN problems p ON p.id = cs."problemId"
    WHERE p."eventId" = ${event.id} AND p.practice = false AND (${cutoff}::timestamp IS NULL OR pt."createdAt" < ${cutoff}::timestamp)
    GROUP BY cs."participantId"`;
  const calibrations = await prisma.calibrationRun.findMany({
    where: { kind: 'REFERENCE', status: 'DONE', problem: { eventId: event.id, practice: false } },
    orderBy: { finishedAt: 'asc' },
    select: { problemId: true, language: true, result: true },
  });
  const reviews = await prisma.judgeReview.groupBy({
    by: ['participantId'], where: { participant: { eventId: event.id }, ...(cutoff ? { createdAt: { lt: cutoff } } : {}) }, _avg: { score: true },
  });
  const overrides = await prisma.scoreOverride.findMany({
    where: { participant: { eventId: event.id }, problemId: null, ...(cutoff ? { createdAt: { lt: cutoff } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { participantId: true, component: true, value: true },
  });

  const tokens = new Map(tokenRows.map((r) => [r.participantId, Number(r.tokens ?? 0)]));
  const references = new Map<string, ReferenceResult>();
  for (const c of calibrations) {
    const result = RunResult.safeParse(c.result);
    // Newest accepted calibration wins (ordered by finish).
    if (result.success && result.data.verdict === 'AC') {
      references.set(`${c.problemId}:${c.language.toLowerCase()}`, { maxTimeMs: result.data.maxTimeMs, maxMemoryKb: result.data.maxMemoryKb });
    }
  }
  const judge = new Map(reviews.map((r) => [r.participantId, r._avg.score]));
  const overrideMap = new Map<string, Partial<Record<ScoreComponentName, number>>>();
  for (const o of overrides) {
    const component = ScoreComponent.safeParse(o.component);
    if (!component.success) continue;
    overrideMap.set(o.participantId, { ...overrideMap.get(o.participantId), [component.data]: o.value });
  }
  const byParticipant = new Map<string, ScoringParticipant['submissions'][number][]>();
  for (const s of submissions) {
    // Before the freeze cut, a verdict recorded after it doesn't exist yet.
    const judged = s.status === 'DONE' && s.verdict && (!cutoff || s.verdict.createdAt < cutoff) ? s.verdict : null;
    const list = byParticipant.get(s.participantId) ?? [];
    list.push({
      problemId: s.problemId,
      language: s.codeVersion.language.toLowerCase(),
      verdict: judged?.verdict ?? null,
      contestMs: s.contestMs ?? Math.max(0, s.createdAt.getTime() - start),
      maxTimeMs: judged?.maxTimeMs ?? 0,
      maxMemoryKb: judged?.maxMemoryKb ?? 0,
      counts: s.incidents.length === 0,
    });
    byParticipant.set(s.participantId, list);
  }

  const standings = computeStandings({
    problems,
    references,
    rules: event.config.scoring,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.user.name,
      disqualified: p.status === 'DISQUALIFIED',
      submissions: byParticipant.get(p.id) ?? [],
      tokens: tokens.get(p.id) ?? 0,
      judgeScore: judge.get(p.id) ?? null,
      overrides: overrideMap.get(p.id) ?? {},
    })),
  });
  const enrolment = new Map(participants.map((p) => [p.id, p.enrolmentNo]));
  return { problems, standings, enrolment };
}

/** The organizers' live board: every component, every participant, no freeze. */
export async function adminLeaderboard(prisma: PrismaClient, eventId: string, now = new Date()) {
  const event = await loadEvent(prisma, eventId);
  const { problems, standings, enrolment } = await standingsFor(prisma, event);
  return {
    contest: contestStatus(event, now),
    weights: event.config.scoring.weights,
    problems,
    standings: standings.map((s) => ({ ...s, enrolmentNo: enrolment.get(s.participantId) ?? '' })),
  };
}

/** The public projector: 404 for an unknown token or a disabled projector, never a hint which. */
export async function projectorView(prisma: PrismaClient, token: string, now = new Date()): Promise<ProjectorView> {
  const event = await prisma.event.findUnique({ where: { projectorTokenHash: hashProjectorToken(token) } });
  if (!event) throw notFound('That page');
  const config = EventConfig.parse(event.config);
  if (!config.leaderboard.projectorEnabled) throw notFound('That page');
  const loaded = { ...event, config };
  const clock = eventClock(loaded, now);
  const final = event.resultsState === 'FINAL';
  const cut = final ? null : freezeCut(event, clock);
  // Store the cut the first time it is seen, so a later pause or extend can't move it (R13-1).
  if (cut && !event.frozenAt) await prisma.event.updateMany({ where: { id: event.id, frozenAt: null }, data: { frozenAt: cut } });
  const frozen = cut !== null;
  const { problems, standings } = await standingsFor(prisma, loaded, { cutoff: cut });
  return ProjectorView.parse({
    title: config.branding.title,
    phase: clock.phase,
    msLeft: clock.msLeft,
    frozen,
    final,
    problems: problems.length,
    rows: standings
      .filter((s): s is Standing & { rank: number } => s.rank !== null)
      .map((s) => ({ rank: s.rank, name: s.name, solved: s.solved, ...(final ? { total: s.total } : {}) })),
  });
}

/** A spreadsheet cell can't start a formula (CSV injection): names are participant-supplied. */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function resultsCsv(prisma: PrismaClient, eventId: string, actor: Actor): Promise<string> {
  const event = await loadEvent(prisma, eventId);
  const { standings, enrolment } = await standingsFor(prisma, event);
  await prisma.auditLog.create({
    data: { actorId: actor.id, action: 'results.exported', targetType: 'event', targetId: eventId, after: { rows: standings.length, resultsState: event.resultsState }, requestId: actor.requestId },
  });
  const header = ['rank', 'name', 'enrolment', 'disqualified', 'solved', 'tokens', 'correctness', 'token_efficiency', 'resource_efficiency', 'process_quality', 'total', 'results'];
  const rows = standings.map((s) => [
    s.rank, s.name, enrolment.get(s.participantId) ?? '', s.disqualified ? 'yes' : 'no', s.solved, s.tokens,
    s.correctness, s.tokenEfficiency, s.resourceEfficiency, s.processQuality, s.total, event.resultsState.toLowerCase(),
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/** An organizer override replaces one component (ADR-009); the newest wins. Refused once results are final. */
export async function overrideScore(prisma: PrismaClient, participantId: string, input: ScoreOverrideRequest, actor: Actor) {
  const p = await prisma.participant.findUnique({ where: { id: participantId }, select: { id: true, event: { select: { resultsState: true } } } });
  if (!p) throw notFound('That participant');
  if (p.event.resultsState === 'FINAL') throw conflict('results_final', 'The results are final.');
  await prisma.$transaction([
    prisma.scoreOverride.create({ data: { participantId, component: input.component, value: input.value, reason: input.reason, actorId: actor.id } }),
    prisma.auditLog.create({
      data: { actorId: actor.id, action: 'score.overridden', targetType: 'participant', targetId: participantId, after: { component: input.component, value: input.value }, reason: input.reason, requestId: actor.requestId },
    }),
  ]);
  return { ok: true };
}
