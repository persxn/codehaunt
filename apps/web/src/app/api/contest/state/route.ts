import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { participantContext } from '@/server/contest';
import { contestState } from '@/server/participant-service';

export const GET = route(['PARTICIPANT'], async ({ user }) => {
  const prisma = getPrismaClient();
  const ctx = await participantContext(prisma, user.id, new Date(), { allowWithoutConsent: true });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: ctx.event.id }, select: { name: true } });
  return contestState(prisma, ctx, event.name);
});
