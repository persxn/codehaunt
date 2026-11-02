/**
 * The judge queue (ADR-025): QUEUED rows of `submissions` and `calibration_runs` are the jobs. A worker claims one
 * with FOR UPDATE SKIP LOCKED, runs it through CodeRunner and writes the verdict. A row left RUNNING (worker crash)
 * is requeued after RUNNING_TIMEOUT_MS; after MAX_ATTEMPTS it is FAILED (the dead letters, shown to staff in WP-05).
 */
import { EventConfig, type Checker, type Language, type RunResult } from '@codehaunt/contracts';
import { fromDbLanguage } from '@codehaunt/core';
import type { PrismaClient } from '@codehaunt/db';

import type { CodeRunner } from './sandbox/code-runner.ts';

export const MAX_ATTEMPTS = 2;
/** Longer than the slowest possible run (200 tests × 10 s is capped by the judge far below this). */
export const RUNNING_TIMEOUT_MS = 15 * 60 * 1000;
/** RunLimits allows at most 10 s per test, whatever the multiplier. */
const MAX_TIME_LIMIT_MS = 10_000;

type Table = 'submissions' | 'calibration_runs';

export interface Log {
  (entry: Record<string, unknown>): void;
}

/** Claims the oldest QUEUED row of a table, or returns null. */
export async function claim(prisma: PrismaClient, table: Table): Promise<string | null> {
  // Table names come from the closed `Table` union, never from input.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `UPDATE ${table} SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = now()
     WHERE id = (SELECT id FROM ${table} WHERE status = 'QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id`,
  );
  return rows[0]?.id ?? null;
}

/** Requeues rows stuck in RUNNING (crashed worker); rows out of attempts become FAILED. Returns how many moved. */
export async function requeueStuck(prisma: PrismaClient, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RUNNING_TIMEOUT_MS);
  let moved = 0;
  for (const table of ['submissions', 'calibration_runs'] as const) {
    moved += await prisma.$executeRawUnsafe(
      `UPDATE ${table} SET status = CASE WHEN attempts >= $1 THEN 'FAILED'::"SubmissionStatus" ELSE 'QUEUED'::"SubmissionStatus" END,
         "finishedAt" = CASE WHEN attempts >= $1 THEN now() ELSE NULL END
       WHERE status = 'RUNNING' AND "startedAt" < $2`,
      MAX_ATTEMPTS,
      cutoff,
    );
  }
  return moved;
}

function limitsFor(problem: { timeLimitMs: number; memoryLimitMb: number; event: { config: unknown } }, language: Language) {
  const config = EventConfig.parse(problem.event.config);
  return {
    timeLimitMs: Math.min(MAX_TIME_LIMIT_MS, Math.round(problem.timeLimitMs * config.timeMultiplier[language])),
    memoryLimitMb: problem.memoryLimitMb,
  };
}

/** A failed attempt: back to QUEUED, or FAILED once out of attempts. */
async function giveBack(prisma: PrismaClient, table: Table, id: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET status = CASE WHEN attempts >= $1 THEN 'FAILED'::"SubmissionStatus" ELSE 'QUEUED'::"SubmissionStatus" END,
       "finishedAt" = CASE WHEN attempts >= $1 THEN now() ELSE NULL END
     WHERE id = $2 AND status = 'RUNNING'`,
    MAX_ATTEMPTS,
    id,
  );
}

/** Judges one claimed submission: SAMPLE against the visible tests, SUBMIT against visible + hidden. */
export async function judgeSubmission(prisma: PrismaClient, runner: CodeRunner, id: string, log: Log): Promise<void> {
  try {
    const sub = await prisma.submission.findUniqueOrThrow({
      where: { id },
      include: {
        codeVersion: { select: { language: true, source: true } },
        problem: {
          select: {
            timeLimitMs: true, memoryLimitMb: true, checker: true, event: { select: { config: true } },
            testCases: {
              orderBy: [{ visibility: 'desc' }, { ord: 'asc' }],
              select: { id: true, visibility: true, input: true, expectedOutput: true },
            },
          },
        },
      },
    });
    const language = fromDbLanguage(sub.codeVersion.language);
    const tests = sub.problem.testCases
      .filter((t) => sub.kind === 'SUBMIT' || t.visibility === 'VISIBLE')
      .map((t) => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput }));
    const result = await runner.run({
      language,
      source: sub.codeVersion.source,
      tests,
      limits: limitsFor(sub.problem, language),
      checker: sub.problem.checker as Checker,
    });
    if (result.internalError) log({ level: 'warn', msg: 'judge internal error', submissionId: id, internalError: result.internalError.slice(0, 2000) });
    await prisma.$transaction([
      prisma.verdict.create({ data: verdictRow(id, result) }),
      prisma.submission.update({ where: { id }, data: { status: 'DONE', finishedAt: new Date() } }),
    ]);
  } catch (error) {
    log({ level: 'error', msg: 'submission run failed', submissionId: id, error: String(error) });
    await giveBack(prisma, 'submissions', id);
  }
}

function verdictRow(submissionId: string, r: RunResult) {
  return {
    submissionId,
    verdict: r.verdict,
    testsPassed: r.testsPassed,
    testsTotal: r.testsTotal,
    maxTimeMs: Math.round(r.maxTimeMs),
    maxMemoryKb: Math.round(r.maxMemoryKb),
    compileLog: r.compileLog,
    results: r.results,
  };
}

/** Runs a reference/naive solution against every test; the RunResult is organizer-facing. */
export async function runCalibration(prisma: PrismaClient, runner: CodeRunner, id: string, log: Log): Promise<void> {
  try {
    const run = await prisma.calibrationRun.findUniqueOrThrow({
      where: { id },
      include: {
        problem: {
          select: {
            timeLimitMs: true, memoryLimitMb: true, checker: true, event: { select: { config: true } },
            testCases: { orderBy: [{ visibility: 'desc' }, { ord: 'asc' }], select: { id: true, input: true, expectedOutput: true } },
          },
        },
      },
    });
    const language = fromDbLanguage(run.language);
    const result = await runner.run({
      language,
      source: run.source,
      tests: run.problem.testCases,
      limits: limitsFor(run.problem, language),
      checker: run.problem.checker as Checker,
    });
    await prisma.calibrationRun.update({ where: { id }, data: { status: 'DONE', result, finishedAt: new Date() } });
  } catch (error) {
    log({ level: 'error', msg: 'calibration run failed', calibrationRunId: id, error: String(error) });
    await giveBack(prisma, 'calibration_runs', id);
  }
}

export interface JudgeLoopOptions {
  concurrency: number;
  pollMs?: number;
  log: Log;
  now?: () => Date;
}

/** Keeps up to `concurrency` runs going until `signal` aborts; then waits for the runs in progress. */
export async function judgeLoop(prisma: PrismaClient, runner: CodeRunner, options: JudgeLoopOptions, signal: AbortSignal): Promise<void> {
  const pollMs = options.pollMs ?? 250;
  const now = options.now ?? (() => new Date());
  const active = new Set<Promise<void>>();
  let lastSweep = 0;
  while (!signal.aborted) {
    if (now().getTime() - lastSweep > 30_000) {
      lastSweep = now().getTime();
      const moved = await requeueStuck(prisma, now()).catch(() => 0);
      if (moved) options.log({ level: 'warn', msg: 'requeued stuck runs', count: moved });
    }
    let claimed = false;
    while (active.size < options.concurrency) {
      // Submissions first: participants are waiting on them; calibration only fills idle slots.
      const sub = await claim(prisma, 'submissions').catch(() => null);
      const cal = sub ? null : await claim(prisma, 'calibration_runs').catch(() => null);
      const job = sub ? judgeSubmission(prisma, runner, sub, options.log) : cal ? runCalibration(prisma, runner, cal, options.log) : null;
      if (!job) break;
      claimed = true;
      const tracked: Promise<void> = job.finally(() => active.delete(tracked));
      active.add(tracked);
    }
    if (!claimed) await sleep(pollMs, signal);
    else if (active.size >= options.concurrency) await Promise.race(active);
  }
  await Promise.allSettled(active);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
