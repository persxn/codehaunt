import { ProjectorLinkRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { newProjectorLink } from '@/server/contest-ops-service';

type P = { id: string };

/** A new projector link, shown once; the previous link stops working. */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  newProjectorLink(getPrismaClient(), params.id, await body(request, ProjectorLinkRequest), { id: user.id, requestId }));
