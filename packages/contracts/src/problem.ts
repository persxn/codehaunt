/**
 * Zod schemas for problem definitions.
 */
import { z } from 'zod';
import { Language, Checker } from './judge.ts';

/** Difficulty enum. */
export const Difficulty = z.enum(['EASY', 'MEDIUM', 'HARD']);
export type Difficulty = z.infer<typeof Difficulty>;

/** Shape of a test case (visible or hidden). */
const TestCase = z.object({
  input: z.string(),
  expectedOutput: z.string(),
});
export type TestCase = z.infer<typeof TestCase>;

export const SolutionKind = z.enum(['REFERENCE', 'NAIVE']);
export type SolutionKind = z.infer<typeof SolutionKind>;

/** Organizer-only solution in one language: REFERENCE must pass, NAIVE should fail on memory/time. */
export const SolutionInput = z.object({
  language: Language,
  kind: SolutionKind,
  source: z.string().min(1).max(65536),
}).strict();
export type SolutionInput = z.infer<typeof SolutionInput>;

/** Problem input for organizers. */
export const ProblemInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(120),
  statement: z.string().min(1).max(20000),
  difficulty: Difficulty,
  ord: z.number().int().min(0),
  timeLimitMs: z.number().int().min(100).max(10000),
  memoryLimitMb: z.number().int().min(16).max(1024),
  checker: Checker.default({ kind: 'caseInsensitive' }),
  practice: z.boolean().default(false),
  solutions: z.array(SolutionInput).max(8).default([]).refine(
    (list) => new Set(list.map((s) => `${s.language}:${s.kind}`)).size === list.length,
    { message: 'one solution per language and kind' },
  ),
  visibleTests: z.array(TestCase).min(1).max(20),
  hiddenTests: z.array(TestCase).min(1).max(200),
});
export type ProblemInput = z.infer<typeof ProblemInput>;

/** Participant-facing problem definition. */
export const ParticipantProblem = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(120),
  statement: z.string().min(1).max(20000),
  difficulty: Difficulty,
  ord: z.number().int().min(0),
  timeLimitMs: z.number().int().min(100).max(10000),
  memoryLimitMb: z.number().int().min(16).max(1024),
  practice: z.boolean(),
  visibleTests: z.array(TestCase).min(1).max(20),
}).strict();
export type ParticipantProblem = z.infer<typeof ParticipantProblem>;

/** Approve or reject one GPT-OSS draft (WP-07 task 8). */
export const DraftDecision = z.object({ decision: z.enum(['approve', 'reject']) }).strict();
export type DraftDecision = z.infer<typeof DraftDecision>;

/** What GPT-OSS must return when drafting for one problem (validated before anything is stored). */
export const DraftReply = z.object({
  tests: z.array(z.object({
    input: z.string().min(1).max(2000),
    expectedOutput: z.string().max(2000),
    why: z.string().min(1).max(300),
  }).strict()).min(1).max(8),
  naive: z.object({ language: Language, source: z.string().min(1).max(8000), why: z.string().min(1).max(300) }).strict(),
}).strict();
export type DraftReply = z.infer<typeof DraftReply>;

