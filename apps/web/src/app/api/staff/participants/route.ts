import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { badRequest, notFound } from '@/server/errors';
import { listParticipants } from '@/server/participant-admin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** Desk list: status, seat, badge and check-in state. No prompts, tokens or scores. */
export const GET = route(STAFF, async ({ request, user }) => {
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (!eventId) throw badRequest('eventId is required.');
  const prisma = getPrismaClient();
  // Volunteers work only on events that left draft, as /api/staff/events lists them (audit run-11, L3).
  if (user.role === 'VOLUNTEER') {
    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
    if (!event || event.status === 'DRAFT') throw notFound('That event');
  }
  return { participants: await listParticipants(prisma, eventId) };
});
