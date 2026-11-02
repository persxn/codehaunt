import { CheckInRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { checkIn } from '@/server/checkin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** A scanned (or typed) badge code: activates the participant, records the seat. Single use. */
export const POST = route(STAFF, async ({ request, user, requestId }) => {
  const input = await body(request, CheckInRequest);
  return checkIn(getPrismaClient(), { ...input, actorId: user.id, requestId });
});
