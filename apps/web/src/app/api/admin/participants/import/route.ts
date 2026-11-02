import { ParticipantImportRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { importParticipants } from '@/server/participant-admin-service';

export const POST = route(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId }) =>
  importParticipants(getPrismaClient(), await body(request, ParticipantImportRequest), { id: user.id, requestId }));
