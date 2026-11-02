import { changePassword, ROLES } from '@codehaunt/auth';
import { ChangePasswordRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { badRequest } from '@/server/errors';

/** Anyone signed in changes their own password; their other sessions end (ADR-020). */
export const POST = route(ROLES, async ({ request, user, sessionToken, requestId }) => {
  const input = await body(request, ChangePasswordRequest);
  const result = await changePassword(getPrismaClient(), {
    userId: user.id,
    sessionToken,
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    requestId,
  });
  if (!result.ok) throw badRequest(result.reason);
  return { ok: true, endedSessions: result.endedSessions };
});
