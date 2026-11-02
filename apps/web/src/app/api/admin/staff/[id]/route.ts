import { z } from 'zod';

import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { accessSync } from '@/lib/services';
import { setStaffActive } from '@/server/staff-service';

const ActiveRequest = z.object({ active: z.boolean() }).strict();

/** Add back or remove a staff member (removal ends their sessions at once). */
export const PATCH = route<{ id: string }>(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId, params }) => {
  const { active } = await body(request, ActiveRequest);
  return setStaffActive(getPrismaClient(), params.id, active, { id: user.id, role: user.role, requestId }, accessSync());
});
