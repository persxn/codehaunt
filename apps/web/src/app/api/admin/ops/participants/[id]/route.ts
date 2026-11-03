import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { participantLog } from '@/server/participant-log-service';

type P = { id: string };

/** Prompts, replies, code, runs, ledger and staff actions of one participant. */
export const GET = route<P>(['ADMIN', 'ORGANIZER'], async ({ params }) => participantLog(getPrismaClient(), params.id));
