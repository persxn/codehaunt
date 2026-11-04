import { DraftDecision } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { decideDraft } from '@/server/draft-service';

type P = { id: string; draftId: string };

/** Approve (hidden test / naive solution) or reject one draft; refused once the contest has started. */
export const POST = route<P>(['ADMIN'], async ({ request, user, requestId, params }) =>
  decideDraft(getPrismaClient(), params.id, params.draftId, await body(request, DraftDecision), { id: user.id, requestId }));
