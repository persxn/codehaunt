import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { ParticipantsAdmin } from './participants-admin';

/** Participants (ADMIN, ORGANIZER): list, CSV/form import; export and delete for admins (ADR-010). */
export default async function ParticipantsPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Participants</h1>
      <Suspense>
        <ParticipantsAdmin admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
