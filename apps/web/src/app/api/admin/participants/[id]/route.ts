import { z } from 'zod';

import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { anonymiseParticipant, exportParticipant } from '@/server/participant-admin-service';

type P = { id: string };

/** Data export on request (ADR-010); audit-logged. */
export const GET = route<P>(['ADMIN'], async ({ user, requestId, params }) =>
  exportParticipant(getPrismaClient(), params.id, { id: user.id, requestId }));

const DeleteRequest = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

/** Deletion on request: anonymises (the ledgers are append-only); not reversible. */
export const DELETE = route<P>(['ADMIN'], async ({ request, user, requestId, params }) => {
  const { reason } = await body(request, DeleteRequest);
  return anonymiseParticipant(getPrismaClient(), params.id, { id: user.id, requestId, reason });
});
