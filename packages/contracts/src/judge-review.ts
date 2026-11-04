/**
 * Batch process-quality judge (WP-07, ADR-009): what the worker sends GPT-OSS and what must come back.
 * `judge-v1` (ADR-018, junior-developer game) is kept for history; `judge-v2` (ADR-033, tutor mode) is what runs.
 *
 * `JudgeInput` is built by the worker from the DB; every participant-written string in it is untrusted and
 * travels as data, never as instructions. `JudgeOutput` is the only shape accepted from the model: strict, bounded,
 * one entry per problem in the input. Anything else is retried, repaired once, then `needs_manual`.
 */
import { z } from 'zod';

import { Language, Verdict } from './judge.ts';

/** Per-string cap in the judge input; the worker truncates longer prompts, replies and code (marked `[truncated]`). */
export const JUDGE_TEXT_MAX = 8000;
export const JUDGE_TRANSCRIPT_MAX = 200;

export const JudgeTranscriptEntry = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prompt'), atMs: z.number().int().min(0), tokens: z.number().int().min(0), text: z.string().max(JUDGE_TEXT_MAX) }),
  z.object({ kind: z.literal('reply'), atMs: z.number().int().min(0), text: z.string().max(JUDGE_TEXT_MAX) }),
  z.object({ kind: z.literal('revert'), atMs: z.number().int().min(0) }),
  // Sample runs and submits: counts and verdict only. Hidden inputs/outputs never reach the judge's input.
  z.object({
    kind: z.enum(['run', 'submit']),
    atMs: z.number().int().min(0),
    verdict: Verdict.nullable(),
    testsPassed: z.number().int().min(0),
    testsTotal: z.number().int().min(0),
  }),
]);
export type JudgeTranscriptEntry = z.infer<typeof JudgeTranscriptEntry>;

export const JudgeProblemInput = z.object({
  problemId: z.string().min(1).max(64),
  title: z.string().max(200),
  /** Organizer-written (trusted); the participant's model never saw it (ADR-018). */
  statement: z.string().max(20000),
  language: Language.nullable(),
  /** Deterministic metrics (`computeProcessMetrics`), passed through as context for the rubric. */
  metrics: z.object({
    accepted: z.boolean(),
    prompts: z.number().int().min(0),
    tokens: z.number().int().min(0),
    attempts: z.number().int().min(0),
    rejectedBeforeAccept: z.number().int().min(0),
    timeToAcceptMs: z.number().int().min(0).nullable(),
    tokensAfterAccept: z.number().int().min(0),
    timeRatio: z.number().nullable(),
    memoryRatio: z.number().nullable(),
  }),
  transcript: z.array(JudgeTranscriptEntry).max(JUDGE_TRANSCRIPT_MAX),
  finalCode: z.string().max(JUDGE_TEXT_MAX).nullable(),
});
export type JudgeProblemInput = z.infer<typeof JudgeProblemInput>;

export const JudgeInput = z.object({
  /** Opaque, never a name or username: the judge has no reason to know who it is scoring. */
  participantRef: z.string().min(1).max(64),
  problems: z.array(JudgeProblemInput).min(1).max(20),
});
export type JudgeInput = z.infer<typeof JudgeInput>;

const Criterion = z.number().int().min(0).max(5);
const Rationale = z.string().min(1).max(1500);

/** ADR-018 rubric criteria, each 0–5. */
export const JudgeCriteria = z
  .object({
    specificity: Criterion,
    memoryAwareness: Criterion,
    mistakeCorrection: Criterion,
    debugging: Criterion,
    complexity: Criterion,
    tokenEconomy: Criterion,
  })
  .strict();
export type JudgeCriteria = z.infer<typeof JudgeCriteria>;

export const JudgeProblemReview = z
  .object({
    problemId: z.string().min(1).max(64),
    score: z.number().int().min(0).max(100),
    criteria: JudgeCriteria,
    /** Big-O of the final code and of the best known approach, e.g. "O(n log n)"; "n/a" when there is no code. */
    complexityAchieved: z.string().min(1).max(40),
    complexityOptimal: z.string().min(1).max(40),
    rationale: Rationale,
  })
  .strict();
export type JudgeProblemReview = z.infer<typeof JudgeProblemReview>;

export const JudgeOutput = z
  .object({
    problems: z.array(JudgeProblemReview).min(1).max(20),
    overall: z.object({ score: z.number().int().min(0).max(100), rationale: Rationale }).strict(),
    /** True when any participant text tries to instruct or address the judge/grader (integrity flag, ADR-009). */
    injectionFlag: z.boolean(),
    /** Short quote or description of the attempt; empty when `injectionFlag` is false. */
    injectionEvidence: z.string().max(500),
  })
  .strict();
export type JudgeOutput = z.infer<typeof JudgeOutput>;

/** Output must review exactly the input's problems, once each; returns the problem of the first mismatch, or null. */
export function judgeOutputMismatch(
  input: { problems: ReadonlyArray<{ problemId: string }> },
  output: { problems: ReadonlyArray<{ problemId: string }> },
): string | null {
  const expected = new Set(input.problems.map((p) => p.problemId));
  const seen = new Set<string>();
  for (const review of output.problems) {
    if (!expected.has(review.problemId) || seen.has(review.problemId)) return review.problemId;
    seen.add(review.problemId);
  }
  for (const id of expected) if (!seen.has(id)) return id;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// judge-v2 (ADR-033): the participant wrote the code; the AI was a tutor that never saw it.

/** Most code snapshots per problem in the input (first, evenly spaced, final), each capped at JUDGE_TEXT_MAX. */
export const JUDGE_SNAPSHOTS_MAX = 4;

export const JudgeTranscriptEntryV2 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('question'), atMs: z.number().int().min(0), tokens: z.number().int().min(0), text: z.string().max(JUDGE_TEXT_MAX) }),
  /** What the participant saw: the reply after the reply filter (long code removed). */
  z.object({ kind: z.literal('reply'), atMs: z.number().int().min(0), text: z.string().max(JUDGE_TEXT_MAX) }),
  /** A code save: size only (snapshots carry the code). `burst`: grew faster than typing (ADR-033 flag). */
  z.object({ kind: z.literal('save'), atMs: z.number().int().min(0), chars: z.number().int().min(0), burst: z.boolean() }),
  z.object({
    kind: z.enum(['run', 'submit']),
    atMs: z.number().int().min(0),
    verdict: Verdict.nullable(),
    testsPassed: z.number().int().min(0),
    testsTotal: z.number().int().min(0),
  }),
]);
export type JudgeTranscriptEntryV2 = z.infer<typeof JudgeTranscriptEntryV2>;

export const JudgeProblemInputV2 = JudgeProblemInput.omit({ transcript: true }).extend({
  transcript: z.array(JudgeTranscriptEntryV2).max(JUDGE_TRANSCRIPT_MAX),
  codeSnapshots: z.array(z.object({ atMs: z.number().int().min(0), code: z.string().max(JUDGE_TEXT_MAX) })).max(JUDGE_SNAPSHOTS_MAX),
  /** Deterministic integrity signals (`@codehaunt/core` integrity-flags); context for the rubric, never a verdict. */
  flags: z.object({
    saveBursts: z.number().int().min(0),
    aiCopiedLines: z.number().int().min(0),
    codeHeavyQuestions: z.number().int().min(0),
  }),
});
export type JudgeProblemInputV2 = z.infer<typeof JudgeProblemInputV2>;

export const JudgeInputV2 = z.object({
  participantRef: z.string().min(1).max(64),
  problems: z.array(JudgeProblemInputV2).min(1).max(20),
});
export type JudgeInputV2 = z.infer<typeof JudgeInputV2>;

/** ADR-033 rubric criteria, each 0–5. */
export const JudgeCriteriaV2 = z
  .object({
    questionQuality: Criterion,
    independence: Criterion,
    debugging: Criterion,
    improvement: Criterion,
    complexity: Criterion,
    tokenEconomy: Criterion,
  })
  .strict();
export type JudgeCriteriaV2 = z.infer<typeof JudgeCriteriaV2>;

export const JudgeProblemReviewV2 = JudgeProblemReview.extend({ criteria: JudgeCriteriaV2 }).strict();
export type JudgeProblemReviewV2 = z.infer<typeof JudgeProblemReviewV2>;

export const JudgeOutputV2 = JudgeOutput.extend({ problems: z.array(JudgeProblemReviewV2).min(1).max(20) }).strict();
export type JudgeOutputV2 = z.infer<typeof JudgeOutputV2>;

