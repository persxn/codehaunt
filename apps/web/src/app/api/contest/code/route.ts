import { SaveCodeRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { saveCode } from '@/server/participant-service';

export const POST = route(['PARTICIPANT'], async ({ request, user }) => {
  const input = await body(request, SaveCodeRequest);
  const prisma = getPrismaClient();
  return saveCode(prisma, await participantContext(prisma, user.id, new Date()), input);
});
