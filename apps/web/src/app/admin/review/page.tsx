import { Suspense } from 'react';

import { currentUser } from '@/lib/session';

import { Review } from './review';

/** Batch-judge review (WP-07, ADMIN and ORGANIZER): queue judging, read scores and flags, override process quality. */
export default async function ReviewPage() {
  const user = await currentUser();
  return (
    <section>
      <h1>Judge review</h1>
      <Suspense>
        <Review admin={user?.role === 'ADMIN'} />
      </Suspense>
    </section>
  );
}
