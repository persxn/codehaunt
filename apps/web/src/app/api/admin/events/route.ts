import { EventCreateRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { createEvent, listEvents } from '@/server/event-service';

export const GET = route(['ADMIN'], async () => ({ events: await listEvents(getPrismaClient()) }));

export const POST = route(['ADMIN'], async ({ request, user, requestId }) =>
  createEvent(getPrismaClient(), await body(request, EventCreateRequest), { id: user.id, requestId }));
