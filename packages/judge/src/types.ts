/**
 * Core judge types: verdicts, limits, test cases, and results.
 *
 * Verdict semantics follow Codeforces conventions so students who later use
 * competitive-programming sites find the vocabulary familiar.
 */

export const VERDICTS = [
  'AC', // Accepted — output matched on this test
  'WA', // Wrong Answer — ran cleanly, output did not match
  'TLE', // Time Limit Exceeded — exceeded the per-test wall clock
  'MLE', // Memory Limit Exceeded — hit the address-space / cgroup cap
  'RE', // Runtime Error — non-zero exit or fatal signal
  'CE', // Compile Error — gcc rejected the source
  'OLE', // Output Limit Exceeded — wrote more than the stdout cap
  'IE', // Internal Error — the judge itself failed; never the student's fault
] as const;

export type Verdict = (typeof VERDICTS)[number];

/** Verdicts that mean "the student's code is fine on this test". */
export const PASSING_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(['AC']);

/** Human-facing labels, used in the UI and CLI output. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
  OLE: 'Output Limit Exceeded',
  IE: 'Internal Error',
};

/** Resource ceilings applied to a single execution of the student's program. */
export interface ExecutionLimits {
  /** Wall-clock limit for one test case. */
  timeLimitMs: number;
  /** Address-space / cgroup memory ceiling. */
  memoryLimitMb: number;
  /** Bytes of stdout beyond which the run is killed as OLE. */
  outputLimitBytes: number;
  /** Max processes/threads — the fork-bomb defence. */
  pidLimit: number;
}

export const DEFAULT_LIMITS: ExecutionLimits = {
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  outputLimitBytes: 64 * 1024,
  pidLimit: 64,
};

/** Compilation is given a longer, separate budget from execution. */
export interface CompileLimits {
  timeLimitMs: number;
  memoryLimitMb: number;
  /** Bytes of compiler diagnostics retained; the rest is truncated. */
  logLimitBytes: number;
  /**
   * File-size ceiling for anything gcc writes. This must accommodate a
   * statically linked binary (~1MB), not just the diagnostics — too small and
   * the linker dies with "File too large".
   */
  binaryLimitBytes: number;
}

export const DEFAULT_COMPILE_LIMITS: CompileLimits = {
  timeLimitMs: 10_000,
  memoryLimitMb: 512,
  logLimitBytes: 16 * 1024,
  binaryLimitBytes: 64 * 1024 * 1024,
};

/**
 * How a produced output is compared against the expected one.
 *
 * `caseInsensitive` is the classroom default: "Hello World" and "hello world"
 * are the same answer, matching the behaviour requested for this platform.
 */
export type CheckerKind = 'caseInsensitive' | 'strictWhitespace' | 'float';

export interface CheckerConfig {
  kind: CheckerKind;
  /** Absolute/relative tolerance for the `float` checker. */
  tolerance?: number;
}

export const DEFAULT_CHECKER: CheckerConfig = { kind: 'caseInsensitive' };

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  /** Sample tests are shown to students with their expected I/O; others are hidden. */
  isSample: boolean;
  ord: number;
}

/** Result of running the compiled program against one test case. */
export interface TestResult {
  testCaseId: string;
  verdict: Verdict;
  timeMs: number;
  memoryKb: number;
  /** Truncated stdout, retained for debugging and for showing sample-test diffs. */
  outputExcerpt: string;
  /** Populated for RE — e.g. "SIGSEGV". */
  signal?: string;
  /** Populated for IE — judge-side failure detail, never shown to students. */
  internalError?: string;
}

/** Scoring mode: practice sets give partial credit, graded tests do not. */
export type ScoringMode = 'partial' | 'allOrNothing';

export interface JudgeResult {
  verdict: Verdict;
  testsPassed: number;
  testsTotal: number;
  /** 0..1 fraction of max points earned; all-or-nothing yields only 0 or 1. */
  score: number;
  /** Slowest single test, which is what a time limit is really judged on. */
  maxTimeMs: number;
  maxMemoryKb: number;
  /** Compiler diagnostics; line numbers already remapped for function problems. */
  compileLog: string;
  results: TestResult[];
  /**
   * Set when the judge itself failed rather than the submission.
   *
   * Deliberately separate from `compileLog`: this text names containers, paths
   * and exit codes, and it used to travel in the log field, which is rendered
   * straight to the student. It is for the worker log and the teacher. A caller
   * seeing this should treat the run as not having happened — the verdict is
   * `IE`, and `IE` is never the student's fault.
   */
  internalError?: string;
}

/**
 * The languages a submission can be written in.
 *
 * Lower-case strings rather than an enum so the value crossing the JSON
 * boundary into the sandbox is the same value used here, with nothing to keep
 * in step. The database has its own enum; `languageFromDb` converts once, at
 * the edge.
 */
export type Language = 'c' | 'cpp' | 'java' | 'python';

export const LANGUAGES: Language[] = ['c', 'cpp', 'java', 'python'];

export const LANGUAGE_LABEL: Record<Language, string> = {
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  python: 'Python',
};

/**
 * How much longer a language needs for the same algorithm.
 *
 * Every problem in the bank was given a time limit chosen against gcc. Python
 * is routinely an order of magnitude slower on identical logic and the JVM
 * spends time starting before any student code runs, so without these a correct
 * solution times out on almost every existing question — and to the student that
 * looks like a wrong answer, not a limit.
 *
 * Applied by the judge rather than stored per problem: a teacher setting a
 * question should be thinking about the algorithm, not about three runtimes.
 */
/*
 * C++ is given the same budget as C, deliberately.
 *
 * Optimised g++ output is within noise of gcc for the kind of program a course
 * sets, and the standard library containers a student reaches for are the same
 * ones a C answer hand-rolls. A multiplier here would quietly make C++ the
 * easier language to pass a tight limit in, which is a thumb on the scale
 * rather than a fairness correction.
 */
export const TIME_MULTIPLIER: Record<Language, number> = { c: 1, cpp: 1, java: 2.5, python: 5 };

/**
 * Milliseconds of startup that are not the student's fault.
 *
 * A JVM takes roughly a tenth of a second to reach `main`, every run, on an
 * empty program. Charging that to a two-second limit is charging them for the
 * runtime's cost of existing.
 */
export const STARTUP_ALLOWANCE_MS: Record<Language, number> = { c: 0, cpp: 0, java: 300, python: 80 };

/** Java will not start in some of the tighter limits set for C. */
/*
 * A statically linked C++ binary carries the whole standard library, so it needs
 * more headroom than C before it has done anything — but nothing like a JVM.
 */
export const MIN_MEMORY_MB: Record<Language, number> = { c: 0, cpp: 32, java: 320, python: 96 };

export interface SourceProgram {
  /** Complete C translation unit ready to hand to gcc. */
  source: string;
  /**
   * Maps a gcc-reported line back to a line in the student's editor.
   * Returns null when the diagnostic points at harness code, which means the
   * teacher's driver is broken rather than the student's submission.
   */
  mapLine?: (reportedFile: string, reportedLine: number) => number | null;
}
