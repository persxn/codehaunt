import { Suspense } from 'react';

import { Roadmap } from './roadmap';

/** Event setup roadmap (ADMIN only by route policy; WP-11, ADR-044): seven numbered steps from creation to launch. */
export default function SetupPage() {
  return (
    <section>
      <h1>Event setup</h1>
      <Suspense>
        <Roadmap />
      </Suspense>
    </section>
  );
}
