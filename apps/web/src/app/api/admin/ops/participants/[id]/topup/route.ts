import { TopUpRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { topUp } from '@/server/contest-ops-service';

type P = { id: string };

/** Idempotent per `idempotencyKey`. */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  topUp(getPrismaClient(), params.id, await body(request, TopUpRequest), { id: user.id, requestId }));
