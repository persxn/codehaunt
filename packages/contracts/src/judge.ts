/**
 * Judge I/O: what the worker hands to `CodeRunner` and what comes back.
 *
 * Mirrors the vendored `@cjudge/judge` vocabulary (verdicts, languages) so the
 * runner adapter is a mapping, not a translation. Expected outputs appear only in
 * `RunRequest`, which never leaves the worker; `RunResult` carries no expected output.
 */
import { z } from 'zod';

export const Language = z.enum(['c', 'cpp', 'java', 'python']);
export type Language = z.infer<typeof Language>;

export const Verdict = z.enum(['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'OLE', 'IE']);
export type Verdict = z.infer<typeof Verdict>;

export const Checker = z.object({
  kind: z.enum(['caseInsensitive', 'strictWhitespace', 'float']),
  tolerance: z.number().positive().optional(),
});
export type Checker = z.infer<typeof Checker>;

/** 64 KiB of source is far beyond any contest answer and bounds what we store and compile. */
export const MAX_SOURCE_BYTES = 64 * 1024;

export const RunTest = z.object({
  id: z.string().min(1).max(64),
  input: z.string().max(4 * 1024 * 1024),
  expectedOutput: z.string().max(4 * 1024 * 1024),
});
export type RunTest = z.infer<typeof RunTest>;

export const RunLimits = z.object({
  timeLimitMs: z.number().int().min(100).max(10_000),
  memoryLimitMb: z.number().int().min(16).max(1024),
});
export type RunLimits = z.infer<typeof RunLimits>;

export const RunRequest = z.object({
  language: Language,
  source: z.string().min(1).refine((s) => Buffer.byteLength(s, 'utf8') <= MAX_SOURCE_BYTES, {
    message: `source exceeds ${MAX_SOURCE_BYTES} bytes`,
  }),
  tests: z.array(RunTest).min(1).max(200),
  limits: RunLimits,
  checker: Checker.default({ kind: 'caseInsensitive' }),
});
export type RunRequest = z.input<typeof RunRequest>;

export const RunTestResult = z.object({
  testId: z.string(),
  verdict: Verdict,
  timeMs: z.number().nonnegative(),
  memoryKb: z.number().nonnegative(),
  /** Truncated program stdout. Callers strip it for hidden tests before anything participant-facing. */
  outputExcerpt: z.string(),
});
export type RunTestResult = z.infer<typeof RunTestResult>;

export const RunResult = z.object({
  verdict: Verdict,
  testsPassed: z.number().int().nonnegative(),
  testsTotal: z.number().int().nonnegative(),
  maxTimeMs: z.number().nonnegative(),
  maxMemoryKb: z.number().nonnegative(),
  compileLog: z.string(),
  results: z.array(RunTestResult),
  /** Judge-side failure detail (verdict IE). Operator logs only, never shown to participants. */
  internalError: z.string().optional(),
});
export type RunResult = z.infer<typeof RunResult>;
