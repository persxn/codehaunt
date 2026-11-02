import { RoleChangeRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { changeRole } from '@/server/staff-service';

/** The only route that changes `users.role` (WP-01 R4): admin only, audited with a reason. */
export const PUT = route<{ id: string }>(['ADMIN'], async ({ request, user, requestId, params }) =>
  changeRole(getPrismaClient(), params.id, await body(request, RoleChangeRequest), { id: user.id, role: user.role, requestId }));
