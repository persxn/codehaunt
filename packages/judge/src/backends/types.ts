/**
 * Execution backend contract.
 *
 * A backend's only job is to run `runner.py` in isolation and hand back its raw
 * observations. All judgement — comparing output, assigning verdicts, scoring —
 * happens outside the sandbox, on data the sandbox never had access to.
 */

import type { CompileLimits, ExecutionLimits, Language } from '../types.ts';

export interface SandboxTest {
  id: string;
  input: string;
}

export interface JudgeJob {
  /** Complete program, in whatever language `language` names. */
  source: string;
  /**
   * Which toolchain to use. Absent means C, so a job written before there were
   * any languages still means what it meant.
   */
  language?: Language;
  /** Extra compiler flags for this problem, if any. */
  compileArgs?: string[];
  compileLimits: CompileLimits;
  limits: ExecutionLimits;
  /**
   * Inputs only. Expected outputs are deliberately absent: even a full sandbox
   * escape into the runner's own memory would not reveal the answer key.
   */
  tests: SandboxTest[];
}

/** Raw, un-judged facts about one execution. */
export interface RawRunResult {
  testId: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  timeMs: number;
  memoryKb: number;
  truncated: boolean;
  timedOut: boolean;
}

export interface SandboxOutcome {
  compiled: boolean;
  compileLog: string;
  runs: RawRunResult[];
  /** Set when the backend itself failed — surfaces as IE, never blamed on the student. */
  internalError?: string;
}

export interface ExecutionBackend {
  readonly name: string;
  /** Whether this backend can run on the current host right now. */
  isAvailable(): Promise<boolean>;
  execute(job: JudgeJob): Promise<SandboxOutcome>;
}

/**
 * Wall-clock budget for the whole sandbox invocation: compilation, every test,
 * plus slack for process startup. Exceeding it means the backend wedged, which
 * is an internal error rather than a student-visible verdict.
 */
export function totalBudgetMs(job: JudgeJob): number {
  const perTest = job.limits.timeLimitMs + 500;
  return job.compileLimits.timeLimitMs + perTest * job.tests.length + 5000;
}
