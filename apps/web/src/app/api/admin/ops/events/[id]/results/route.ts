import { ResultsRequest } from '@codehaunt/contracts';
import { getPrismaClient } from '@codehaunt/db';

import { body, route } from '@/lib/route';
import { publishResults } from '@/server/contest-ops-service';
import { resultsCsv } from '@/server/leaderboard-service';

type P = { id: string };
const OPS = ['ADMIN', 'ORGANIZER'] as const;

/** Results as CSV (audit-logged). */
export const GET = route<P>(OPS, async ({ user, requestId, params }) =>
  new Response(await resultsCsv(getPrismaClient(), params.id, { id: user.id, requestId }), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="results.csv"',
      'cache-control': 'no-store',
    },
  }));

/** provisional (starts the appeal window) · final (after it). */
export const POST = route<P>(OPS, async ({ request, user, requestId, params }) =>
  publishResults(getPrismaClient(), params.id, await body(request, ResultsRequest), { id: user.id, requestId }));
