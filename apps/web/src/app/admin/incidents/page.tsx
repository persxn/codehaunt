import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { Incidents } from './incidents';

/** Incident dashboard (ADMIN, ORGANIZER; ADR-021). */
export default async function IncidentsPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Incidents</h1>
      <Suspense>
        <Incidents admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
