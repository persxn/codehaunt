import { BadgeRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { issueBadges } from '@/server/checkin-service';

/** Issues (or reissues) badges: passwords and check-in codes are in this response only. */
export const POST = route(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId }) => {
  const input = await body(request, BadgeRequest);
  return { badges: await issueBadges(getPrismaClient(), { ...input, actorId: user.id, requestId }) };
});
