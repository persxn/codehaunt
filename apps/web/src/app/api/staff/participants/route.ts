import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { badRequest, notFound } from '@/server/errors';
import { deskVisible } from '@/server/checkin-service';
import { listParticipants } from '@/server/participant-admin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** Desk list: status, seat, badge and check-in state. No prompts, tokens or scores. */
export const GET = route(STAFF, async ({ request, user }) => {
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (!eventId) throw badRequest('eventId is required.');
  const prisma = getPrismaClient();
  // Volunteers see the same events /api/staff/events lists (audit run-11 L3, run-12 R12-1).
  if (user.role === 'VOLUNTEER') {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true, config: true } });
    if (!event || !deskVisible(event)) throw notFound('That event');
  }
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { defaultPasswordHash: true } });
  // Whether "reset to the event password" is possible (ADR-041); never the hash.
  return { participants: await listParticipants(prisma, eventId), eventDefaultPassword: Boolean(event?.defaultPasswordHash) };
});
