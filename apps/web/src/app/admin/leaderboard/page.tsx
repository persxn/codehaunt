import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { Leaderboard } from './leaderboard';

/** Live leaderboard for organizers (ADMIN, ORGANIZER; ADR-008): never frozen. */
export default async function LeaderboardPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Leaderboard</h1>
      <Suspense>
        <Leaderboard admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
