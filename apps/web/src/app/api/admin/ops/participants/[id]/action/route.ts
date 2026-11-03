import { ParticipantActionRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { participantAction } from '@/server/contest-ops-service';

type P = { id: string };

/** disqualify · reinstate · end_session · deactivate. */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  participantAction(getPrismaClient(), params.id, await body(request, ParticipantActionRequest), { id: user.id, requestId }));
