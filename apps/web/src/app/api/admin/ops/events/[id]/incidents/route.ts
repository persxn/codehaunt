import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { listIncidents } from '@/server/incident-service';

type P = { id: string };

export const GET = route<P>(['ADMIN', 'ORGANIZER'], async ({ user, params }) => listIncidents(getPrismaClient(), params.id, user));
