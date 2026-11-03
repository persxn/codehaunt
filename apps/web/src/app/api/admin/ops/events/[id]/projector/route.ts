import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { newProjectorLink } from '@/server/contest-ops-service';

type P = { id: string };

/** A new projector link, shown once; the previous link stops working. */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ user, requestId, params }) =>
  newProjectorLink(getPrismaClient(), params.id, { id: user.id, requestId }));
