import { Suspense } from 'react';

import { ProblemsAdmin } from './problems-admin';

/** Problems of the selected event (ADMIN only): statement, tests, solutions, limits, calibration. */
export default function ProblemsPage() {
  return (
    <section>
      <h1>Problems</h1>
      <Suspense>
        <ProblemsAdmin />
      </Suspense>
    </section>
  );
}
