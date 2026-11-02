import { EventUpdateRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { getEvent, updateEvent } from '@/server/event-service';

type P = { id: string };

export const GET = route<P>(['ADMIN'], async ({ params }) => getEvent(getPrismaClient(), params.id));

export const PUT = route<P>(['ADMIN'], async ({ request, user, requestId, params }) =>
  updateEvent(getPrismaClient(), params.id, await body(request, EventUpdateRequest), { id: user.id, requestId }));
