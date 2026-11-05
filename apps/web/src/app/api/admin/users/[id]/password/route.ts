import { PasswordResetRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { resetToEventDefault } from '@/server/default-password-service';
import { resetPassword } from '@/server/staff-service';

/**
 * Staff reset someone's password: a new one (ADR-020 rules) or back to the event's default with a forced change
 * (ADR-041). Either way that person's sessions end. Existing passwords are never shown.
 */
export const POST = route<{ id: string }>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) => {
  const input = await body(request, PasswordResetRequest);
  if ('eventDefault' in input) return resetToEventDefault(getPrismaClient(), params.id, input.eventId, { id: user.id, requestId });
  return resetPassword(getPrismaClient(), params.id, input.newPassword, { id: user.id, role: user.role, requestId });
});
