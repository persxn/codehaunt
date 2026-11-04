import { JudgeQueueRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { requeueJudgeJob } from '@/server/review-service';

type P = { id: string };

/** Puts one participant's judge job back in the queue (audited). */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  requeueJudgeJob(getPrismaClient(), params.id, (await body(request, JudgeQueueRequest)).reason, { id: user.id, requestId }));
