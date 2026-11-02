/**
 * Judge orchestration: turns raw sandbox observations into verdicts and scores.
 *
 * This runs entirely outside the sandbox. The expected outputs live here and
 * never cross into the execution environment.
 */

import { check } from './comparator.ts';
import type { ExecutionBackend, JudgeJob, RawRunResult } from './backends/types.ts';
import {
  DEFAULT_CHECKER,
  DEFAULT_COMPILE_LIMITS,
  DEFAULT_LIMITS,
  type CheckerConfig,
  type CompileLimits,
  type ExecutionLimits,
  type JudgeResult,
  type ScoringMode,
  type SourceProgram,
  type TestCase,
  type TestResult,
  type Verdict,
  type Language,
  MIN_MEMORY_MB,
  STARTUP_ALLOWANCE_MS,
  TIME_MULTIPLIER,
} from './types.ts';

/** Excerpt of student output retained per test for debugging and sample diffs. */
const OUTPUT_EXCERPT_BYTES = 4096;

/**
 * Memory usage at or above this fraction of the ceiling is read as MLE rather
 * than RE. RLIMIT_AS makes a failed allocation look like an ordinary crash —
 * malloc returns NULL and the program dereferences it — so telling a student
 * "you ran out of memory" instead of "segfault" needs this heuristic.
 */
const MLE_THRESHOLD = 0.9;

export interface JudgeRequest {
  /**
   * The language the student wrote in. Absent means C, so every existing caller
   * keeps meaning what it meant.
   */
  language?: Language;
  program: SourceProgram;
  tests: TestCase[];
  limits?: Partial<ExecutionLimits>;
  compileLimits?: Partial<CompileLimits>;
  checker?: CheckerConfig;
  scoring?: ScoringMode;
  compileArgs?: string[];
}

/** Classifies a single execution against its expected output. */
export function verdictForRun(
  raw: RawRunResult,
  expectedOutput: string,
  checker: CheckerConfig,
  limits: ExecutionLimits,
): Verdict {
  if (raw.timedOut) return 'TLE';
  if (raw.truncated || raw.signal === 'SIGXFSZ') return 'OLE';

  const memoryCeilingKb = limits.memoryLimitMb * 1024;
  const nearCeiling = raw.memoryKb >= memoryCeilingKb * MLE_THRESHOLD;

  if (raw.signal !== null) {
    // SIGKILL with high memory is the cgroup OOM killer; a crash with high
    // memory is almost always a dereferenced NULL from a failed malloc.
    if (nearCeiling) return 'MLE';
    return 'RE';
  }
  if (raw.exitCode !== 0) {
    return nearCeiling ? 'MLE' : 'RE';
  }
  return check(raw.stdout, expectedOutput, checker) ? 'AC' : 'WA';
}

/**
 * Rewrites gcc diagnostics so line numbers refer to the student's editor.
 *
 * For classic problems the source *is* the student's file and this is a no-op.
 * For function problems the harness supplies a mapper; diagnostics that fall
 * outside the student's region are replaced with a neutral message, because a
 * broken driver is the teacher's bug and leaking it would both confuse the
 * student and reveal the hidden harness.
 */
export function remapCompileLog(log: string, program: SourceProgram): {
  studentLog: string;
  harnessError: boolean;
} {
  if (!program.mapLine) return { studentLog: sanitizePaths(log), harnessError: false };

  let harnessError = false;
  const lines = log.split('\n').map((line) => {
    // Positional diagnostic: `file.c:LINE:COL: severity: message`
    const positional = /^([^\s:]+\.[ch]):(\d+):(\d+:)?\s*(.*)$/.exec(line);
    if (positional) {
      const [, file, lineNo, col, rest] = positional;
      const mapped = program.mapLine!(file!, Number(lineNo));
      if (mapped === null) {
        if (/\berror\b/i.test(rest ?? '')) harnessError = true;
        return null;
      }
      return `solution.c:${mapped}:${col ?? ''} ${rest}`;
    }

    // Context line without a position: `file.c: In function 'f':`, `file.c: At top level:`.
    // These carry no line number but still name the file, so they leak harness
    // internals just as readily and have to be filtered the same way.
    const contextual = /^([^\s:]+\.[ch]):\s*(.*)$/.exec(line);
    if (contextual) {
      const [, file, rest] = contextual;
      if (program.mapLine!(file!, 1) === null) {
        if (/\berror\b/i.test(rest ?? '')) harnessError = true;
        return null;
      }
      return `solution.c: ${rest}`;
    }

    return line;
  });

  const studentLines = lines.filter((line): line is string => line !== null);
  const studentLog = sanitizePaths(studentLines.join('\n').trim());

  return {
    studentLog: harnessError && !studentLog
      ? 'The problem setup for this question failed to build. Your teacher has been notified.'
      : studentLog,
    harnessError,
  };
}

/**
 * Strips judge-internal paths out of compiler diagnostics.
 *
 * Every compiler reports the absolute path of the file it was given, which is a
 * scratch directory inside the sandbox. Students should see the bare filename,
 * and the layout of the judge's filesystem is not theirs to learn.
 *
 * All three toolchains are listed because all three do it and each says it
 * differently: gcc writes `/box/judge-xxxx/sol.c:3:`, javac writes
 * `/box/judge-xxxx/Main.java:1:`, and CPython writes `File
 * "/box/judge-xxxx/sol.py", line 1`. The C form was the only one handled, so
 * Java and Python submissions showed students a sandbox path and a random
 * directory name on every compile error.
 */
export function sanitizePaths(log: string): string {
  return log
    .replace(/(^|\s)\/\S*?\/(sol|solution)\.c\b/g, '$1solution.c')
    .replace(/(^|\s|")\/\S*?\/Main\.java\b/g, '$1Main.java')
    .replace(/(^|\s|")\/\S*?\/sol\.py\b/g, '$1solution.py');
}

export async function judge(
  backend: ExecutionBackend,
  request: JudgeRequest,
): Promise<JudgeResult> {
  const limits: ExecutionLimits = { ...DEFAULT_LIMITS, ...request.limits };
  const compileLimits: CompileLimits = { ...DEFAULT_COMPILE_LIMITS, ...request.compileLimits };
  const checker = request.checker ?? DEFAULT_CHECKER;
  const scoring: ScoringMode = request.scoring ?? 'partial';
  const tests = [...request.tests].sort((a, b) => a.ord - b.ord);

  /*
   * The limits the sandbox actually enforces, adjusted for the runtime.
   *
   * Every problem in the bank has a limit chosen against gcc. Handing the same
   * two seconds to Python means a correct solution times out on almost all of
   * them, and the student sees a verdict that looks like a wrong answer. The
   * multiplier and the startup allowance are applied here, once, rather than
   * asked of the teacher three times per question.
   *
   * The memory floor exists because a JVM will not start at all in some of the
   * tighter limits that are perfectly reasonable for C.
   */
  const language = request.language ?? 'c';
  const effectiveLimits: ExecutionLimits = {
    ...limits,
    timeLimitMs: Math.round(limits.timeLimitMs * TIME_MULTIPLIER[language]) +
      STARTUP_ALLOWANCE_MS[language],
    memoryLimitMb: Math.max(limits.memoryLimitMb, MIN_MEMORY_MB[language]),
  };

  const job: JudgeJob = {
    source: request.program.source,
    language,
    compileLimits,
    limits: effectiveLimits,
    tests: tests.map((t) => ({ id: t.id, input: t.input })),
    ...(request.compileArgs ? { compileArgs: request.compileArgs } : {}),
  };

  const outcome = await backend.execute(job);

  if (outcome.internalError) {
    return emptyResult('IE', tests, outcome.internalError);
  }

  if (!outcome.compiled) {
    const { studentLog } = remapCompileLog(outcome.compileLog, request.program);
    return { ...emptyResult('CE', tests), compileLog: studentLog };
  }

  const byId = new Map(outcome.runs.map((run) => [run.testId, run]));
  const results: TestResult[] = tests.map((test) => {
    const raw = byId.get(test.id);
    if (!raw) {
      return {
        testCaseId: test.id,
        verdict: 'IE' as Verdict,
        timeMs: 0,
        memoryKb: 0,
        outputExcerpt: '',
        internalError: 'sandbox returned no result for this test',
      };
    }
    const verdict = verdictForRun(raw, test.expectedOutput, checker, effectiveLimits);
    return {
      testCaseId: test.id,
      verdict,
      timeMs: raw.timeMs,
      memoryKb: raw.memoryKb,
      outputExcerpt: raw.stdout.slice(0, OUTPUT_EXCERPT_BYTES),
      ...(raw.signal ? { signal: raw.signal } : {}),
    };
  });

  const testsPassed = results.filter((r) => r.verdict === 'AC').length;
  const allPassed = testsPassed === results.length && results.length > 0;
  // Codeforces convention: report the first test that failed, not the last.
  const firstFailure = results.find((r) => r.verdict !== 'AC');

  return {
    verdict: allPassed ? 'AC' : (firstFailure?.verdict ?? 'IE'),
    testsPassed,
    testsTotal: results.length,
    score: scoreFor(scoring, testsPassed, results.length),
    maxTimeMs: results.reduce((max, r) => Math.max(max, r.timeMs), 0),
    maxMemoryKb: results.reduce((max, r) => Math.max(max, r.memoryKb), 0),
    compileLog: remapCompileLog(outcome.compileLog, request.program).studentLog,
    results,
  };
}

/**
 * Practice sets award credit per passing test so a struggling student sees
 * progress; graded tests are all-or-nothing so ratings stay meaningful.
 */
export function scoreFor(mode: ScoringMode, passed: number, total: number): number {
  if (total === 0) return 0;
  if (mode === 'allOrNothing') return passed === total ? 1 : 0;
  return passed / total;
}

function emptyResult(verdict: Verdict, tests: TestCase[], internalError?: string): JudgeResult {
  return {
    verdict,
    testsPassed: 0,
    testsTotal: tests.length,
    score: 0,
    maxTimeMs: 0,
    maxMemoryKb: 0,
    // Never the internal error: that text is for the log, and this field is
    // rendered to the student. `internalError` below carries it instead.
    compileLog: '',
    ...(internalError ? { internalError } : {}),
    results: tests.map((test) => ({
      testCaseId: test.id,
      verdict,
      timeMs: 0,
      memoryKb: 0,
      outputExcerpt: '',
      ...(internalError ? { internalError } : {}),
    })),
  };
}
