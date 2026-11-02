import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { calibrate, calibrationRuns } from '@/server/problem-admin-service';

type P = { id: string };

export const GET = route<P>(['ADMIN'], async ({ params }) => ({ runs: await calibrationRuns(getPrismaClient(), params.id) }));

export const POST = route<P>(['ADMIN'], async ({ user, requestId, params }) =>
  ({ runs: await calibrate(getPrismaClient(), params.id, { id: user.id, requestId }) }));
