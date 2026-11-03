import { ExtraTimeRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { setExtraTime } from '@/server/contest-ops-service';

type P = { id: string };

export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  setExtraTime(getPrismaClient(), params.id, await body(request, ExtraTimeRequest), { id: user.id, requestId }));
