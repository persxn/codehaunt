import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { reviewBoard } from '@/server/review-service';

type P = { id: string };

/** Judge scores, rationale and integrity flags for every participant of one event (WP-07). */
export const GET = route<P>(['ADMIN', 'ORGANIZER'], async ({ params }) => reviewBoard(getPrismaClient(), params.id));
