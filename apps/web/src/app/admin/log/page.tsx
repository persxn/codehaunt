import { Suspense } from 'react';

import { ParticipantLog } from './participant-log';

/** One participant's log (ADMIN, ORGANIZER; WP-05): ?event=&participant=. */
export default function LogPage() {
  return (
    <section>
      <h1>Participant log</h1>
      <Suspense>
        <ParticipantLog />
      </Suspense>
    </section>
  );
}
