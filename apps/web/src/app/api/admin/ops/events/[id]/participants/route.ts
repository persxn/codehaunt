import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { opsParticipants } from '@/server/participant-log-service';

type P = { id: string };

export const GET = route<P>(['ADMIN', 'ORGANIZER'], async ({ params }) => opsParticipants(getPrismaClient(), params.id));
