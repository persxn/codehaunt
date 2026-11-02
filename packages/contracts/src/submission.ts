/**
 * Zod schemas for submission handling.
 */
import { z } from 'zod';
import { Verdict, RunTestResult } from './judge.ts';

/** Submission kind enum. */
export const SubmissionKind = z.enum(['SAMPLE', 'SUBMIT']);
export type SubmissionKind = z.infer<typeof SubmissionKind>;

/** Submission status enum. */
export const SubmissionStatus = z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED']);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

/** Request schema for creating a submission. */
export const SubmissionRequest = z.object({
  problemId: z.string().min(1),
  codeVersionId: z.string().min(1),
  kind: SubmissionKind,
  idempotencyKey: z.uuid(),
});
export type SubmissionRequest = z.infer<typeof SubmissionRequest>;

/** Participant-facing verdict schema. */
export const ParticipantVerdict = z.object({
  submissionId: z.string().min(1),
  status: SubmissionStatus,
  verdict: Verdict.optional(),
  testsPassed: z.number().int().nonnegative().optional(),
  testsTotal: z.number().int().nonnegative().optional(),
  maxTimeMs: z.number().int().nonnegative().optional(),
  maxMemoryKb: z.number().int().nonnegative().optional(),
  compileLog: z.string().optional(),
  sampleResults: z.array(RunTestResult).optional(),
}).strict();
export type ParticipantVerdict = z.infer<typeof ParticipantVerdict>;
