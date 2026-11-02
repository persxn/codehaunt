import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { promoteFromWaitlist } from '@/server/checkin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

export const POST = route<{ id: string }>(STAFF, async ({ user, requestId, params }) => {
  await promoteFromWaitlist(getPrismaClient(), { participantId: params.id, actorId: user.id, requestId });
  return { ok: true };
});
