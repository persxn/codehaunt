import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { problemStatement } from '@/server/participant-service';

export const GET = route<{ id: string }>(['PARTICIPANT'], async ({ user, params }) => {
  const prisma = getPrismaClient();
  return problemStatement(prisma, await participantContext(prisma, user.id, new Date()), params.id);
});
