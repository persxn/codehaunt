/** Login request and the shared API error envelope. */
import { z } from 'zod';

export const LoginRequest = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const Role = z.enum(['ADMIN', 'ORGANIZER', 'VOLUNTEER', 'PARTICIPANT']);
export type Role = z.infer<typeof Role>;

export const Me = z.object({ id: z.string(), username: z.string(), name: z.string(), role: Role });
export type Me = z.infer<typeof Me>;

/** Every error response: a stable code and the request ID, never stack traces (standards §2). */
export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
