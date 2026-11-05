/** Admin console and desk shapes (WP-04). */
import { z } from 'zod';

import { EventConfig } from './event-config.ts';

export const EventCreateRequest = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(120),
  config: EventConfig,
}).strict();
export type EventCreateRequest = z.infer<typeof EventCreateRequest>;

export const EventUpdateRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  config: EventConfig,
  reason: z.string().max(500).optional(),
}).strict();
export type EventUpdateRequest = z.infer<typeof EventUpdateRequest>;

export const ParticipantRow = z.object({
  name: z.string().trim().min(1).max(120),
  enrolmentNo: z.string().trim().regex(/^[A-Za-z0-9/_-]{1,40}$/, 'letters, digits, / _ - only'),
  email: z.email().max(200).optional(),
  phone: z.string().trim().regex(/^[0-9+ -]{6,20}$/).optional(),
}).strict();
export type ParticipantRow = z.infer<typeof ParticipantRow>;

/** Most rows one import may carry (ADR-044); the CSV file itself is limited to 1 MB in the browser. */
export const IMPORT_MAX_ROWS = 1000;

/**
 * Strict import (ADR-044): `dryRun` validates and previews; a commit re-validates and writes all rows or none.
 * `line` is the CSV line of each row (header = 1), echoed back in issues so the admin can find it.
 */
export const ParticipantImportRequest = z.object({
  eventId: z.string().min(1),
  dryRun: z.boolean().optional(),
  // Loose here on purpose: each row is checked against `ParticipantRow` on the server so every bad row is reported
  // with its line and column, not just the first one.
  rows: z.array(z.object({
    line: z.number().int().min(1).optional(),
    name: z.string().max(1000),
    enrolmentNo: z.string().max(1000),
    email: z.string().max(1000).optional(),
    phone: z.string().max(1000).optional(),
  }).strict()).min(1).max(IMPORT_MAX_ROWS),
}).strict();
export type ParticipantImportRequest = z.infer<typeof ParticipantImportRequest>;

/** One problem with one row; `column` is the CSV column it is about, when there is one. */
export const ImportIssue = z.object({
  line: z.number().int().nullable(),
  enrolmentNo: z.string(),
  column: z.enum(['enrolment', 'name', 'email', 'phone']).nullable(),
  message: z.string(),
});
export type ImportIssue = z.infer<typeof ImportIssue>;

export const BadgeRequest = z.object({
  eventId: z.string().min(1),
  participantIds: z.array(z.string().min(1)).max(1000).optional(),
}).strict();
export type BadgeRequest = z.infer<typeof BadgeRequest>;

export const CheckInRequest = z.object({
  code: z.string().min(1).max(200),
  seatLabel: z.string().trim().min(1).max(20),
}).strict();
export type CheckInRequest = z.infer<typeof CheckInRequest>;

export const StaffRole = z.enum(['ADMIN', 'ORGANIZER', 'VOLUNTEER']);
export type StaffRole = z.infer<typeof StaffRole>;

export const StaffCreateRequest = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  role: StaffRole,
  password: z.string().min(1).max(200),
}).strict();
export type StaffCreateRequest = z.infer<typeof StaffCreateRequest>;

export const RoleChangeRequest = z.object({
  role: StaffRole,
  reason: z.string().trim().min(1).max(500),
}).strict();
export type RoleChangeRequest = z.infer<typeof RoleChangeRequest>;

/** Staff reset: a new password (ADR-020 rules), or back to the participant's event default (ADR-041). */
export const PasswordResetRequest = z.union([
  z.object({ newPassword: z.string().min(1).max(200) }).strict(),
  z.object({ eventDefault: z.literal(true), eventId: z.string().min(1) }).strict(),
]);
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

/** Participant's consent at first sign-in (ADR-010). `consent` must be true. */
export const ConsentRequest = z.object({
  consent: z.literal(true),
  reuseConsent: z.boolean().default(false),
  guardianConsent: z.boolean().default(false),
}).strict();
export type ConsentRequest = z.infer<typeof ConsentRequest>;

/** Set or clear an event's default participant password (ADR-041). `null` clears it. */
export const DefaultPasswordRequest = z.object({
  password: z.string().min(1).max(200).nullable(),
  reason: z.string().trim().max(500).optional(),
}).strict();
export type DefaultPasswordRequest = z.infer<typeof DefaultPasswordRequest>;

/** Remove a participant (ADR-044): hard delete without activity, otherwise anonymise. */
export const ParticipantDeleteRequest = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export type ParticipantDeleteRequest = z.infer<typeof ParticipantDeleteRequest>;
