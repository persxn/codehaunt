import { ParticipantDeleteRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { exportParticipant, removeParticipant } from '@/server/participant-admin-service';

type P = { id: string };

/** Data export on request (ADR-010); audit-logged. */
export const GET = route<P>(['ADMIN'], async ({ user, requestId, params }) =>
  exportParticipant(getPrismaClient(), params.id, { id: user.id, requestId }));

/**
 * Remove a participant (ADR-044): deleted outright when they have no activity, otherwise anonymised (the ledgers
 * are append-only). Not reversible. The answer says which happened.
 */
export const DELETE = route<P>(['ADMIN'], async ({ request, user, requestId, params }) => {
  const { reason } = await body(request, ParticipantDeleteRequest);
  return removeParticipant(getPrismaClient(), params.id, { id: user.id, requestId, reason });
});
