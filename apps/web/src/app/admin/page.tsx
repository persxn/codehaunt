import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { Overview } from './overview';

/** Admin home (ADMIN, ORGANIZER): pick an event, see who is registered, waiting and checked in. */
export default async function AdminHome() {
  const user = await currentUser();
  return (
    <section>
      <h1>Overview</h1>
      <Suspense>
        <Overview admin={user?.role === "ADMIN"} name={user?.name ?? ""} />
      </Suspense>
    </section>
  );
}
