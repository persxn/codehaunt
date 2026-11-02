/**
 * Participant contest screen shapes (WP-03). Everything a participant route returns is built from these (strict,
 * so an extra field such as a hidden test fails validation instead of leaking).
 */
import { z } from 'zod';

import { Language } from './judge.ts';
import { Difficulty } from './problem.ts';
import { ParticipantVerdict, SubmissionKind } from './submission.ts';

export const ContestPhase = z.enum(['not_started', 'running', 'paused', 'ended']);
export type ContestPhase = z.infer<typeof ContestPhase>;

export const ContestState = z.object({
  event: z.object({
    name: z.string(),
    phase: ContestPhase,
    startsAt: z.string(),
    endsAt: z.string(),
    msLeft: z.number().int().nonnegative(),
  }).strict(),
  tokens: z.object({ remaining: z.number().int(), total: z.number().int() }).strict(),
  languages: z.array(Language),
  contextWarnPercent: z.number().int(),
  /** Set until the participant accepts the consent text (ADR-010); then null. */
  consent: z.object({ text: z.string(), guardianRequired: z.boolean() }).strict().nullable(),
}).strict();
export type ContestState = z.infer<typeof ContestState>;

export const ProblemSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  difficulty: Difficulty,
  ord: z.number().int(),
  practice: z.boolean(),
  solved: z.boolean(),
}).strict();
export type ProblemSummary = z.infer<typeof ProblemSummary>;

export const CodeVersionView = z.object({
  id: z.string(),
  language: Language,
  source: z.string(),
  createdAt: z.string(),
  /** null for a revert (a copy of an older version). */
  turnId: z.string().nullable(),
}).strict();
export type CodeVersionView = z.infer<typeof CodeVersionView>;

export const TurnView = z.object({
  id: z.string(),
  prompt: z.string(),
  reply: z.string().nullable(),
  createdAt: z.string(),
}).strict();
export type TurnView = z.infer<typeof TurnView>;

export const RunView = ParticipantVerdict.extend({
  kind: SubmissionKind,
  codeVersionId: z.string(),
  createdAt: z.string(),
}).strict();
export type RunView = z.infer<typeof RunView>;

/** Everything the contest screen needs for one problem. */
export const Workspace = z.object({
  session: z.object({
    id: z.string(),
    language: Language,
    contextTokensUsed: z.number().int().nonnegative(),
    contextTokensLimit: z.number().int().positive(),
  }).strict().nullable(),
  turns: z.array(TurnView),
  codeVersions: z.array(CodeVersionView),
  currentCodeVersionId: z.string().nullable(),
  runs: z.array(RunView),
}).strict();
export type Workspace = z.infer<typeof Workspace>;

/** Start a session (first one, a new one carrying the code, or another language). */
export const NewSessionRequest = z.object({ problemId: z.string().min(1), language: Language }).strict();
export type NewSessionRequest = z.infer<typeof NewSessionRequest>;

export const RevertRequest = z.object({ problemId: z.string().min(1), codeVersionId: z.string().min(1) }).strict();
export type RevertRequest = z.infer<typeof RevertRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
}).strict();
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;
