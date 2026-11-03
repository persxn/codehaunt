import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { adminLeaderboard } from '@/server/leaderboard-service';

type P = { id: string };

/** The organizers' live board (never frozen). Polled every 5 s. */
export const GET = route<P>(['ADMIN', 'ORGANIZER'], async ({ params }) => adminLeaderboard(getPrismaClient(), params.id));
