import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** Events the desk can work on (not drafts): id, name, status only. */
export const GET = route(STAFF, async () => ({
  events: await getPrismaClient().event.findMany({
    where: { status: { not: 'DRAFT' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true },
  }),
}));
