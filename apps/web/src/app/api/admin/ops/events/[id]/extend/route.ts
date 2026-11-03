import { ExtendRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { extendContest } from '@/server/contest-ops-service';

type P = { id: string };

export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  extendContest(getPrismaClient(), params.id, await body(request, ExtendRequest), { id: user.id, requestId }));
