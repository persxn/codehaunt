/**
 * Login and account lifecycle. Ported from JojoCode packages/db/src/auth/auth.ts @ a8f4056,
 * plus CodeHaunt's single-active-session rule for participants (ADR-013 §4).
 */
import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@codehaunt/db';

import { COMMON_PASSWORDS } from './common-passwords.ts';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from './password.ts';
import { clearLoginRate, loginDelayMs, recordLoginFailure } from './rate-limit.ts';
import { createSession, destroyAllSessions, type CreatedSession, type SessionUser } from './session.ts';

export interface LoginContext {
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  requestId?: string | undefined;
}

export type LoginResult =
  | {
      ok: true;
      user: SessionUser;
      session: CreatedSession;
      /** Sessions this login ended (participants only). Non-zero is flagged to organizers. */
      replacedSessions: number;
    }
  | { ok: false; reason: 'invalid_credentials' | 'account_inactive' };

/**
 * Verifies credentials and opens a session.
 *
 * Unknown usernames still verify against a real dummy hash so timing does not reveal
 * which accounts exist. Inactive is reported only after a correct password, so it
 * cannot be told apart from a wrong one by guessing.
 */
export async function login(
  prisma: PrismaClient,
  username: string,
  password: string,
  context: LoginContext = {},
): Promise<LoginResult> {
  // Throttled by delay only, never refused (ADR-020): a refusal would let anyone lock an account out.
  const delayMs = loginDelayMs(username, context.ipAddress);
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

  // Bounded before argon2 sees it: an oversized password is wrong by definition.
  const handle = username.trim().toLowerCase();
  const user =
    handle && password.length <= MAX_PASSWORD_LENGTH
      ? await prisma.user.findUnique({ where: { username: handle } })
      : null;

  if (!user) {
    await verifyPassword(await dummyHash(), password.slice(0, MAX_PASSWORD_LENGTH));
    recordLoginFailure(username, context.ipAddress);
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    recordLoginFailure(username, context.ipAddress);
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (!user.active) return { ok: false, reason: 'account_inactive' };

  clearLoginRate(username, context.ipAddress);

  // One active session per participant: a new login ends the old one and is audit-logged
  // so the console can flag it (credential sharing). Staff may hold several (phone + laptop).
  const { session, replacedSessions } = await prisma.$transaction(async (tx) => {
    // First statement on purpose: the row lock serialises concurrent logins of one user, so
    // the second waits, then its deleteMany sees (and ends) the first's session.
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const replaced =
      user.role === 'PARTICIPANT'
        ? (await tx.authSession.deleteMany({ where: { userId: user.id } })).count
        : 0;
    const created = await createSession(tx, {
      userId: user.id,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });
    if (replaced > 0) {
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.session_replaced',
          targetType: 'user',
          targetId: user.id,
          after: { replacedSessions: replaced, ipAddress: context.ipAddress ?? null },
          requestId: context.requestId ?? null,
        },
      });
    }
    return { session: created, replacedSessions: replaced };
  });

  return {
    ok: true,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    session,
    replacedSessions,
  };
}

/** A genuine argon2id hash, so unknown-user verification takes as long as a real one. */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHashPromise;
}

/**
 * Rules for a password a person chooses (ADR-020). Generated passwords always pass. The
 * common-password check also compares the letters alone, so "Password2024!!" counts as "password".
 */
export function checkPasswordStrength(
  password: string,
  username = '',
): { ok: true } | { ok: false; reason: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  const lower = password.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(letters) || new Set(lower).size < 5) {
    return { ok: false, reason: 'That password is too common or too simple. Try a few unrelated words.' };
  }
  const handle = username.trim().toLowerCase();
  if ((handle.length >= 3 && lower.includes(handle)) || lower.includes('codehaunt')) {
    return { ok: false, reason: 'The password must not contain your username or the event name.' };
  }
  return { ok: true };
}

/** Enables or disables an account (check-in, disqualification). Disabling ends its sessions at once. Audit-logged. */
export async function setAccountActive(
  prisma: PrismaClient,
  userId: string,
  active: boolean,
  context: { actorId: string; requestId?: string | undefined },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active } });
    const ended = active ? 0 : await destroyAllSessions(tx, userId);
    await tx.auditLog.create({
      data: {
        actorId: context.actorId,
        action: active ? 'user.activated' : 'user.deactivated',
        targetType: 'user',
        targetId: userId,
        after: { active, endedSessions: ended },
        requestId: context.requestId ?? null,
      },
    });
  });
}
