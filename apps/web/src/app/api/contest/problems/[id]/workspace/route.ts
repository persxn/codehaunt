import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { workspace } from '@/server/participant-service';

export const GET = route<{ id: string }>(['PARTICIPANT'], async ({ user, params }) => {
  const prisma = getPrismaClient();
  return workspace(prisma, await participantContext(prisma, user.id, new Date()), params.id);
});
