import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { deskVisible } from '@/server/checkin-service';

const STAFF = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] as const;

/** Events the desk can work on (past draft, or a draft whose check-in has opened): id, name, status only. */
export const GET = route(STAFF, async () => {
  const events = await getPrismaClient().event.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, config: true },
  });
  return { events: events.filter((e) => deskVisible(e)).map(({ config: _config, ...e }) => e) };
});
