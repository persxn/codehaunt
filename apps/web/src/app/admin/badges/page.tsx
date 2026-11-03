import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { BadgeSheet } from './badge-sheet';

/** Issue badges and print them (ADMIN, ORGANIZER). Passwords and codes live only in this page's memory. */
export default async function BadgesPage() {
  const user = await currentUser();
  return (
    <section>
      <h1 className="no-print">Badges</h1>
      <Suspense>
        <BadgeSheet admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
