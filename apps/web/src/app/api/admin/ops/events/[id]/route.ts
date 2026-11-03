import { ContestControlRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { controlContest, getContestStatus } from '@/server/contest-ops-service';

type P = { id: string };
const OPS = ['ADMIN', 'ORGANIZER'] as const;

export const GET = route<P>(OPS, async ({ params }) => getContestStatus(getPrismaClient(), params.id));

/** open_checkin · start · pause · resume · end (ADR-028). */
export const POST = route<P>(OPS, async ({ request, user, requestId, params }) =>
  controlContest(getPrismaClient(), params.id, await body(request, ContestControlRequest), { id: user.id, requestId }));
