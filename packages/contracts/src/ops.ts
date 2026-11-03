/** Contest operations shapes (WP-05, ADR-028): controls, participant actions, incidents, results, projector. */
import { z } from 'zod';

const Reason = z.string().trim().min(1).max(500);

/** Open check-in, start, pause, resume and end; every one carries a reason for the audit log. */
export const ContestControlRequest = z.object({
  action: z.enum(['open_checkin', 'start', 'pause', 'resume', 'end']),
  reason: Reason,
}).strict();
export type ContestControlRequest = z.infer<typeof ContestControlRequest>;

/** Adds minutes to `schedule.durationMinutes` for everyone. */
export const ExtendRequest = z.object({ minutes: z.number().int().min(1).max(240), reason: Reason }).strict();
export type ExtendRequest = z.infer<typeof ExtendRequest>;

/** Idempotent per key (standards §2): a retried top-up adds nothing. */
export const TopUpRequest = z.object({
  tokens: z.number().int().min(1).max(1_000_000),
  reason: Reason,
  idempotencyKey: z.string().min(8).max(100),
}).strict();
export type TopUpRequest = z.infer<typeof TopUpRequest>;

/** Sets (not adds) a participant's extra minutes: extensions and accommodation. */
export const ExtraTimeRequest = z.object({ minutes: z.number().int().min(0).max(600), reason: Reason }).strict();
export type ExtraTimeRequest = z.infer<typeof ExtraTimeRequest>;

/** Disqualify/deactivate end the sessions too; reinstate undoes either. */
export const ParticipantAction = z.enum(['disqualify', 'reinstate', 'end_session', 'deactivate']);
export type ParticipantAction = z.infer<typeof ParticipantAction>;

export const ParticipantActionRequest = z.object({ action: ParticipantAction, reason: Reason }).strict();
export type ParticipantActionRequest = z.infer<typeof ParticipantActionRequest>;

/** Incident actions (ADR-021): its own three, or a participant action on the incident's participant. */
export const IncidentAction = z.enum(['reverse_penalty', 'rejudge', 'dismiss', 'end_session', 'deactivate']);
export type IncidentAction = z.infer<typeof IncidentAction>;

export const IncidentActionRequest = z.object({ action: IncidentAction, reason: Reason }).strict();
export type IncidentActionRequest = z.infer<typeof IncidentActionRequest>;

export const ScoreComponent = z.enum(['correctness', 'tokenEfficiency', 'resourceEfficiency', 'processQuality']);
export type ScoreComponent = z.infer<typeof ScoreComponent>;

export const ScoreOverrideRequest = z.object({
  component: ScoreComponent,
  value: z.number().min(0).max(100),
  reason: Reason,
}).strict();
export type ScoreOverrideRequest = z.infer<typeof ScoreOverrideRequest>;

export const ResultsRequest = z.object({ action: z.enum(['provisional', 'final']), reason: Reason }).strict();
export type ResultsRequest = z.infer<typeof ResultsRequest>;

/** The public projector (ADR-008): rank, name, solved, nothing else. Strict so nothing extra can leak. */
export const ProjectorView = z.object({
  title: z.string(),
  phase: z.enum(['not_started', 'running', 'paused', 'ended']),
  msLeft: z.number().int().nonnegative(),
  frozen: z.boolean(),
  final: z.boolean(),
  problems: z.number().int().nonnegative(),
  rows: z.array(z.object({
    rank: z.number().int().positive(),
    name: z.string(),
    solved: z.number().int().nonnegative(),
    /** Only once the results are final. */
    total: z.number().optional(),
  }).strict()),
}).strict();
export type ProjectorView = z.infer<typeof ProjectorView>;
