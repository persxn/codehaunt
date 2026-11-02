import { NewSessionRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { newSession } from '@/server/participant-service';

export const POST = route(['PARTICIPANT'], async ({ request, user }) => {
  const input = await body(request, NewSessionRequest);
  const prisma = getPrismaClient();
  return newSession(prisma, await participantContext(prisma, user.id, new Date()), input);
});
