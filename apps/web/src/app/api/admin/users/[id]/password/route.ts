import { PasswordResetRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { resetPassword } from '@/server/staff-service';

/** Staff reset someone's password (ADR-020 rules); that person's sessions end. */
export const POST = route<{ id: string }>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) => {
  const { newPassword } = await body(request, PasswordResetRequest);
  return resetPassword(getPrismaClient(), params.id, newPassword, { id: user.id, role: user.role, requestId });
});
