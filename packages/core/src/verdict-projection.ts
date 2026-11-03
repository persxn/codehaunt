/**
 * What a participant may see of a run (WP-03; ADR-021). Security-critical: Claude-owned.
 *
 * Stored verdicts carry per-test results whose `outputExcerpt` is the program's stdout (it can echo a hidden input)
 * and, for IE, judge internals. Participants get the verdict and counts; per-test detail only for tests whose ids
 * the caller lists as visible; the compiler log only for CE. Never `internalError`, never hidden-test output.
 * Peak time and memory of a submission are measured on hidden tests and controlled by the program, so they are a
 * side channel: shown only for an Accepted submission, and always for sample runs (ADR-027, audit M2).
 */
import { ParticipantVerdict, RunTestResult, Verdict, type SubmissionKind, type SubmissionStatus } from '@codehaunt/contracts';

/** Compiler output is the participant's own code's diagnostics; bounded so it can't flood the page. */
export const MAX_COMPILE_LOG_CHARS = 8000;

export interface StoredRun {
  id: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  verdict?: {
    verdict: string;
    testsPassed: number;
    testsTotal: number;
    maxTimeMs: number;
    maxMemoryKb: number;
    compileLog: string;
    results: unknown;
  } | null;
}

export function toParticipantVerdict(run: StoredRun, visibleTestIds: ReadonlySet<string>): ParticipantVerdict {
  const base = { submissionId: run.id, status: run.status };
  const v = run.verdict;
  if (run.status !== 'DONE' || !v) return ParticipantVerdict.parse(base);

  const verdict = Verdict.safeParse(v.verdict);
  // An unknown stored verdict is a judge fault: show it as IE ("judging problem"), never the raw text.
  const shown = verdict.success ? verdict.data : 'IE';
  const out: ParticipantVerdict = { ...base, verdict: shown, testsPassed: v.testsPassed, testsTotal: v.testsTotal };
  if (run.kind === 'SAMPLE' || shown === 'AC') {
    out.maxTimeMs = Math.round(v.maxTimeMs);
    out.maxMemoryKb = Math.round(v.maxMemoryKb);
  }
  if (shown === 'CE') out.compileLog = v.compileLog.slice(0, MAX_COMPILE_LOG_CHARS);
  if (run.kind === 'SAMPLE' && shown !== 'IE') {
    const parsed = RunTestResult.array().safeParse(v.results);
    if (parsed.success) out.sampleResults = parsed.data.filter((r) => visibleTestIds.has(r.testId));
  }
  return ParticipantVerdict.parse(out);
}
