/**
 * `[claude]` The batch judge (WP-07 task 5, ADR-035). One participant at a time: claim a QUEUED `judge_jobs` row,
 * build the `judge-v2` input, ask GPT-OSS, accept only a schema-valid reply that reviews exactly the input's
 * problems, and write `judge_reviews` (one row per problem plus the overall row, problemId null) in one transaction.
 * An invalid reply gets one repair turn, then one fresh try; after that the job is NEEDS_MANUAL (staff score it by
 * override). The model's injection flag is OR-ed with the deterministic `injectionHintsV2`.
 */
import { z } from 'zod';

import { JudgeOutputV2, judgeOutputMismatch, type JudgeInputV2 } from '@codehaunt/contracts';
import { buildJudgeMessagesV2, injectionHintsV2, JUDGE_RUBRIC_VERSION_V2 } from '@codehaunt/core';
import type { PrismaClient } from '@codehaunt/db';

import { buildJudgeInput, type BuiltInput } from './build-input.ts';
import type { JudgeMessage, JudgeModel } from './ollama.ts';

/** Model calls per participant: first try, one repair turn, one fresh try. */
export const MAX_CALLS = 3;
/** A RUNNING job older than this belongs to a container that died; it goes back to the queue. */
export const RUNNING_TIMEOUT_MS = 30 * 60_000;

const OUTPUT_SCHEMA = z.toJSONSchema(JudgeOutputV2);

export interface Log {
  (entry: Record<string, unknown>): void;
}

/** Parses the reply: the JSON object (a stray code fence or prose around it is tolerated), schema, problem coverage. */
export function parseJudgeReply(input: JudgeInputV2, text: string): { ok: true; output: JudgeOutputV2 } | { ok: false; error: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no JSON object in the reply' };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message.slice(0, 120)}` };
  }
  const parsed = JudgeOutputV2.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return { ok: false, error: `schema: ${issue.path.join('.')}: ${issue.message}`.slice(0, 200) };
  }
  const mismatch = judgeOutputMismatch(input, parsed.data);
  if (mismatch) return { ok: false, error: `problem ${mismatch} missing, unknown or reviewed twice` };
  return { ok: true, output: parsed.data };
}

/** Asks the model up to MAX_CALLS times; returns the valid output or the last error. */
export async function askJudge(model: JudgeModel, input: JudgeInputV2): Promise<{ ok: true; output: JudgeOutputV2; calls: number } | { ok: false; error: string; calls: number }> {
  const base = buildJudgeMessagesV2(input) as JudgeMessage[];
  let messages: JudgeMessage[] = base;
  let error = '';
  for (let call = 1; call <= MAX_CALLS; call++) {
    let text: string;
    try {
      text = await model.chat(messages, OUTPUT_SCHEMA);
    } catch (e) {
      error = `model call failed: ${(e as Error).message.slice(0, 200)}`;
      messages = base;
      continue;
    }
    const result = parseJudgeReply(input, text);
    if (result.ok) return { ok: true, output: result.output, calls: call };
    error = result.error;
    // Second call repairs the first reply; the third starts over (a confused conversation rarely repairs twice).
    messages = call === 1
      ? [...base, { role: 'assistant', content: text.slice(0, 20_000) }, { role: 'user', content: `That reply was not valid (${error}). Reply with the corrected JSON object only.` }]
      : base;
  }
  return { ok: false, error, calls: MAX_CALLS };
}

/** Claims the oldest QUEUED job (SKIP LOCKED), or null. */
export async function claimJudgeJob(prisma: PrismaClient): Promise<{ id: string; participantId: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string; participantId: string }>>`
    UPDATE judge_jobs SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = now(), error = NULL
    WHERE id = (SELECT id FROM judge_jobs WHERE status = 'QUEUED' AND "rubricVersion" = ${JUDGE_RUBRIC_VERSION_V2}
                ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id, "participantId"`;
  return rows[0] ?? null;
}

/** Jobs left RUNNING by a dead container go back to the queue. */
export async function requeueStuckJudgeJobs(prisma: PrismaClient, now: Date): Promise<number> {
  return prisma.judgeJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - RUNNING_TIMEOUT_MS) } },
    data: { status: 'QUEUED' },
  }).then((r) => r.count);
}

export interface ReviewDeps {
  prisma: PrismaClient;
  model: JudgeModel;
  log: Log;
  build?: (prisma: PrismaClient, participantId: string) => Promise<BuiltInput>;
}

/** Judges one claimed job to DONE or NEEDS_MANUAL. Never throws for a model problem; DB errors propagate. */
export async function judgeJob(deps: ReviewDeps, job: { id: string; participantId: string }): Promise<'DONE' | 'NEEDS_MANUAL'> {
  const started = Date.now();
  const { input, flags } = await (deps.build ?? buildJudgeInput)(deps.prisma, job.participantId);
  const result = await askJudge(deps.model, input);
  const durationMs = Date.now() - started;
  if (!result.ok) {
    // The error names schema paths and counts only, never participant text.
    await deps.prisma.judgeJob.update({ where: { id: job.id }, data: { status: 'NEEDS_MANUAL', error: result.error, durationMs, finishedAt: new Date() } });
    deps.log({ level: 'warn', msg: 'judge needs manual review', job: job.id, calls: result.calls, error: result.error, durationMs });
    return 'NEEDS_MANUAL';
  }
  const hints = injectionHintsV2(input);
  const injection = result.output.injectionFlag || hints.length > 0;
  const common = { participantId: job.participantId, rubricVersion: JUDGE_RUBRIC_VERSION_V2, model: deps.model.name, injectionFlag: injection };
  await deps.prisma.$transaction([
    ...result.output.problems.map((review) =>
      deps.prisma.judgeReview.create({ data: { ...common, problemId: review.problemId, score: review.score, rationale: review.rationale, raw: review } }),
    ),
    deps.prisma.judgeReview.create({
      data: {
        ...common, problemId: null, score: result.output.overall.score, rationale: result.output.overall.rationale,
        raw: { output: result.output, injectionHints: hints, flags, calls: result.calls },
      },
    }),
    deps.prisma.judgeJob.update({ where: { id: job.id }, data: { status: 'DONE', durationMs, finishedAt: new Date() } }),
  ]);
  deps.log({ level: 'info', msg: 'judged', job: job.id, calls: result.calls, durationMs, injection });
  return 'DONE';
}

/** Works the queue until it is empty (the one-shot container's whole life). Returns the counts. */
export async function drainJudgeQueue(deps: ReviewDeps): Promise<{ done: number; manual: number }> {
  await requeueStuckJudgeJobs(deps.prisma, new Date());
  const counts = { done: 0, manual: 0 };
  for (let job = await claimJudgeJob(deps.prisma); job; job = await claimJudgeJob(deps.prisma)) {
    const outcome = await judgeJob(deps, job);
    if (outcome === 'DONE') counts.done++;
    else counts.manual++;
  }
  return counts;
}
