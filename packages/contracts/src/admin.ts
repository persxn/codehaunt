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

export const ParticipantImportRequest = z.object({
  eventId: z.string().min(1),
  rows: z.array(ParticipantRow).min(1).max(1000),
}).strict();
export type ParticipantImportRequest = z.infer<typeof ParticipantImportRequest>;

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

export const PasswordResetRequest = z.object({ newPassword: z.string().min(1).max(200) }).strict();
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

/** Participant's consent at first sign-in (ADR-010). `consent` must be true. */
export const ConsentRequest = z.object({
  consent: z.literal(true),
  reuseConsent: z.boolean().default(false),
  guardianConsent: z.boolean().default(false),
}).strict();
export type ConsentRequest = z.infer<typeof ConsentRequest>;
