import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { ContestOps } from './contest-ops';

/** Contest controls and participant actions (ADMIN, ORGANIZER; WP-05). */
export default async function ContestPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Contest</h1>
      <Suspense>
        <ContestOps admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
