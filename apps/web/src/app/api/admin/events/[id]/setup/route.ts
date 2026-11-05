import { z } from 'zod';

import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { controlContest } from '@/server/contest-ops-service';
import { getSetup } from '@/server/setup-service';

type P = { id: string };

/** The setup roadmap's state, derived on every read (ADR-044). Admin only (policy). */
export const GET = route<P>(['ADMIN'], async ({ params }) => getSetup(getPrismaClient(), params.id));

const LaunchRequest = z.object({ action: z.literal('launch'), reason: z.string().trim().min(1).max(500) }).strict();

/** Launch = open check-in; refused (409 `setup_incomplete`) while a required step fails. */
export const POST = route<P>(['ADMIN'], async ({ request, user, requestId, params }) => {
  const { reason } = await body(request, LaunchRequest);
  await controlContest(getPrismaClient(), params.id, { action: 'open_checkin', reason }, { id: user.id, requestId });
  return getSetup(getPrismaClient(), params.id);
});
