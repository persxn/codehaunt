import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { listProblems } from '@/server/participant-service';

export const GET = route(['PARTICIPANT'], async ({ user }) => {
  const prisma = getPrismaClient();
  return { problems: await listProblems(prisma, await participantContext(prisma, user.id, new Date())) };
});
