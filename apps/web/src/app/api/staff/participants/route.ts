import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { badRequest } from '@/server/errors';
import { listParticipants } from '@/server/participant-admin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** Desk list: status, seat, badge and check-in state. No prompts, tokens or scores. */
export const GET = route(STAFF, async ({ request }) => {
  const eventId = request.nextUrl.searchParams.get('eventId');
  if (!eventId) throw badRequest('eventId is required.');
  return { participants: await listParticipants(getPrismaClient(), eventId) };
});
