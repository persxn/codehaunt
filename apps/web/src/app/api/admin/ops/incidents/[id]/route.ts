import { IncidentActionRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { actOnIncident } from '@/server/incident-service';

type P = { id: string };

/** reverse_penalty · rejudge · dismiss · end_session · deactivate (ADR-021). */
export const POST = route<P>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) =>
  actOnIncident(getPrismaClient(), params.id, await body(request, IncidentActionRequest), { id: user.id, requestId }));
