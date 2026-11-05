import { DefaultPasswordRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { setEventDefaultPassword } from '@/server/default-password-service';

/** Set or clear the event's default participant password (ADR-041). Admin only (policy). Never echoed back. */
export const POST = route<{ id: string }>(['ADMIN'], async ({ request, user, requestId, params }) => {
  const input = await body(request, DefaultPasswordRequest);
  return setEventDefaultPassword(getPrismaClient(), params.id, input.password, { id: user.id, requestId, reason: input.reason });
});
