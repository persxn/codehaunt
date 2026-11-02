import { RevertRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { revert } from '@/server/participant-service';

export const POST = route(['PARTICIPANT'], async ({ request, user }) => {
  const input = await body(request, RevertRequest);
  const prisma = getPrismaClient();
  return revert(prisma, await participantContext(prisma, user.id, new Date()), input);
});
