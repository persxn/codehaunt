import { ScoreOverrideRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { overrideScore } from '@/server/leaderboard-service';

type P = { id: string };

export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  overrideScore(getPrismaClient(), params.id, await body(request, ScoreOverrideRequest), { id: user.id, requestId }));
