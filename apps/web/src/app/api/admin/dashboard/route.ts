import { getPrismaClient } from '@codehaunt/db';

import { route } from '@/lib/route';
import { eventDashboard, platformDashboard } from '@/server/dashboard-service';

/** Admin overview (ADR-044): platform counts, or one event's with `?eventId=`. Counts only, no personal data. */
export const GET = route(['ADMIN', 'ORGANIZER'], async ({ request }) => {
  const eventId = request.nextUrl.searchParams.get('eventId');
  return eventId ? eventDashboard(getPrismaClient(), eventId) : platformDashboard(getPrismaClient());
});
