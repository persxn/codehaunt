import { ConsentRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { recordConsent } from '@/server/participant-service';

export const POST = route(['PARTICIPANT'], async ({ request, user, requestId }) => {
  const input = await body(request, ConsentRequest);
  const prisma = getPrismaClient();
  const ctx = await participantContext(prisma, user.id, new Date(), { allowWithoutConsent: true });
  return recordConsent(prisma, ctx, input, requestId);
});
