import { JudgeQueueRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { queueJudging } from '@/server/review-service';

type P = { id: string };

/** Queues batch judging for every checked-in participant (contest ended only; audited). */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  queueJudging(getPrismaClient(), params.id, (await body(request, JudgeQueueRequest)).reason, { id: user.id, requestId }));
