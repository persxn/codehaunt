/**
 * Staff accounts (ADR-013, ADR-020): admins manage everyone; organizers add and remove volunteers live. Role changes
 * go only through `changeRole` (one audited admin route; WP-01 R4). Volunteers are mirrored into the Cloudflare
 * Access group through `AccessGroupSync` (a no-op until WP-06 brings the token).
 */
import { checkPasswordStrength, hashPassword, setAccountActive, setPassword, type Role } from '@codehaunt/auth';
import type { RoleChangeRequest, StaffCreateRequest } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import { badRequest, conflict, forbidden, notFound } from './errors.ts';

export interface AccessGroupSync {
  add(email: string): Promise<void>;
  remove(email: string): Promise<void>;
}

/** Until the Cloudflare token exists (WP-06), staff routes are reachable on localhost only and nothing syncs. */
export const noAccessSync: AccessGroupSync = { add: async () => {}, remove: async () => {} };

type Actor = { id: string; role: Role; requestId: string };

/** Organizers manage volunteers (and participants' passwords); admins manage everyone. */
function mayManage(actor: Actor, targetRole: Role): boolean {
  if (actor.role === 'ADMIN') return true;
  return actor.role === 'ORGANIZER' && (targetRole === 'VOLUNTEER' || targetRole === 'PARTICIPANT');
}

export async function listStaff(prisma: PrismaClient) {
  return prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] } },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
    select: { id: true, username: true, name: true, email: true, role: true, active: true, lastLoginAt: true },
  });
}

export async function createStaff(prisma: PrismaClient, input: StaffCreateRequest, actor: Actor, sync: AccessGroupSync) {
  if (!mayManage(actor, input.role)) throw forbidden('Organizers can add volunteers only.');
  const strength = checkPasswordStrength(input.password, input.username);
  if (!strength.ok) throw badRequest(strength.reason);
  if (await prisma.user.findFirst({ where: { OR: [{ username: input.username }, { email: input.email.toLowerCase() }] } })) {
    throw conflict('user_exists', 'That username or email is already used.');
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { username: input.username, name: input.name, email: input.email.toLowerCase(), role: input.role, passwordHash, active: true },
      select: { id: true, email: true },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'staff.created', targetType: 'user', targetId: u.id, after: { username: input.username, role: input.role }, requestId: actor.requestId },
    });
    return u;
  });
  await sync.add(user.email!);
  return { id: user.id };
}

/** Removing a staff member deactivates the account and ends their sessions at once (ADR-013). */
export async function setStaffActive(prisma: PrismaClient, userId: string, active: boolean, actor: Actor, sync: AccessGroupSync) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
  if (!target || target.role === 'PARTICIPANT') throw notFound('That staff member');
  if (!mayManage(actor, target.role)) throw forbidden('Organizers can add or remove volunteers only.');
  if (target.id === actor.id) throw badRequest('You cannot deactivate your own account.');
  await setAccountActive(prisma, target.id, active, { actorId: actor.id, requestId: actor.requestId });
  if (target.email) await (active ? sync.add(target.email) : sync.remove(target.email));
  return { ok: true };
}

/** The only route that changes `users.role` (admin only; audited with a reason). Participants never become staff here. */
export async function changeRole(prisma: PrismaClient, userId: string, input: RoleChangeRequest, actor: Actor) {
  if (actor.role !== 'ADMIN') throw forbidden();
  if (userId === actor.id) throw badRequest('You cannot change your own role.');
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target || target.role === 'PARTICIPANT') throw notFound('That staff member');
    await tx.user.update({ where: { id: userId }, data: { role: input.role } });
    // New permissions apply from the next sign-in.
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'user.role_changed', targetType: 'user', targetId: userId, before: { role: target.role }, after: { role: input.role }, reason: input.reason, requestId: actor.requestId },
    });
  });
  return { ok: true };
}

export async function resetPassword(prisma: PrismaClient, userId: string, newPassword: string, actor: Actor) {
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) throw notFound('That account');
  if (!mayManage(actor, target.role)) throw forbidden('You cannot reset that account’s password.');
  const result = await setPassword(prisma, { userId, newPassword, actorId: actor.id, requestId: actor.requestId });
  if (!result.ok) throw badRequest(result.reason);
  return { ok: true, endedSessions: result.endedSessions };
}
