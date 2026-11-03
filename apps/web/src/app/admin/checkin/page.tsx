import { Suspense } from 'react';
import Scanner from './scanner';

export default function CheckinPage() {
  // Auth is enforced by the admin layout and ROUTE_POLICY; every staff role may open this page.
  return (
    <section>
      <h1>Check-in</h1>
      <Suspense>
        <Scanner />
      </Suspense>
    </section>
  );
}
