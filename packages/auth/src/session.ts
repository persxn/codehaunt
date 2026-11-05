/**
 * Database-backed sessions. Ported from JojoCode packages/db/src/auth/session.ts @ a8f4056.
 *
 * Not JWTs: organizers must be able to end a session immediately (deactivate, disqualify,
 * reset), and that has to take effect on the next request, not at token expiry.
 */
import { createHash, randomBytes } from 'node:crypto';

import type { PrismaClient, Role } from '@codehaunt/db';

/** Covers check-in through results on event day. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Refresh the expiry once a session is past half its life. */
const REFRESH_THRESHOLD_MS = SESSION_TTL_MS / 2;

export const SESSION_COOKIE = 'codehaunt_session';

/**
 * Cookie attributes. `Secure` defaults on in production (behind the HTTPS tunnel);
 * COOKIE_SECURE=false allows plain-HTTP localhost/LAN use, where a Secure cookie is dropped.
 */
export function sessionCookieOptions(maxAgeMs: number = SESSION_TTL_MS) {
  const override = process.env.COOKIE_SECURE;
  const secure = override === undefined ? process.env.NODE_ENV === 'production' : override !== 'false';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** 32 random bytes to the client; only the SHA-256 is stored, so a DB leak yields no sessions. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** The password is still the event default (ADR-041): only /account and sign-out work until it is changed. */
  mustChangePassword: boolean;
}

export interface CreatedSession {
  /** Give this to the client. It is not recoverable from the database. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  prisma: Pick<PrismaClient, 'authSession'>,
  input: { userId: string; userAgent?: string | undefined; ipAddress?: string | undefined },
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: {
      id: hashSessionToken(token),
      userId: input.userId,
      expiresAt,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
  return { token, expiresAt };
}

export interface ResolvedSession {
  user: SessionUser;
  expiresAt: Date;
  /** True when the expiry was extended and the cookie should be reissued. */
  refreshed: boolean;
}

/**
 * Token → user, or null if unknown, expired, or the account is inactive.
 * Expired rows are deleted on encounter; an inactive account loses every session at once.
 */
export async function resolveSession(
  prisma: PrismaClient,
  token: string | undefined | null,
): Promise<ResolvedSession | null> {
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: hashSessionToken(token) },
    include: { user: { select: { id: true, username: true, name: true, role: true, active: true, mustChangePassword: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (!session.user.active) {
    await prisma.authSession.deleteMany({ where: { userId: session.userId } });
    return null;
  }

  let expiresAt = session.expiresAt;
  let refreshed = false;
  if (expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.authSession.update({ where: { id: session.id }, data: { expiresAt } });
    refreshed = true;
  }

  const { active: _active, ...user } = session.user;
  return { user, expiresAt, refreshed };
}

/** Logout. */
export async function destroySession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { id: hashSessionToken(token) } });
}

/** Ends every session of a user (password change, deactivation, disqualification). */
export async function destroyAllSessions(prisma: Pick<PrismaClient, 'authSession'>, userId: string): Promise<number> {
  const { count } = await prisma.authSession.deleteMany({ where: { userId } });
  return count;
}

export async function pruneExpiredSessions(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return count;
}
