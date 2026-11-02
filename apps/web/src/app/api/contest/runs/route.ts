import { SubmissionRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { createRun } from '@/server/submission-service';

export const POST = route(['PARTICIPANT'], async ({ request, user }) => {
  const input = await body(request, SubmissionRequest);
  const prisma = getPrismaClient();
  return createRun(prisma, await participantContext(prisma, user.id, new Date()), input);
});
