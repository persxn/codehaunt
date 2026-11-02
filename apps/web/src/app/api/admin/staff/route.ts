import { StaffCreateRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { accessSync } from '@/lib/services';
import { createStaff, listStaff } from '@/server/staff-service';

export const GET = route(['ADMIN', 'ORGANIZER'], async () => ({ staff: await listStaff(getPrismaClient()) }));

export const POST = route(['ADMIN', 'ORGANIZER'], async ({ request, user, requestId }) =>
  createStaff(getPrismaClient(), await body(request, StaffCreateRequest), { id: user.id, role: user.role, requestId }, accessSync()));
