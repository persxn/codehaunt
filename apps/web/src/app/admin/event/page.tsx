import { Suspense } from 'react';

import { EventEditor } from './event-editor';

/** Event editor (ADMIN only, ADR-006): create an event and edit its whole config. */
export default function EventPage() {
  return (
    <section>
      <h1>Event</h1>
      <Suspense>
        <EventEditor />
      </Suspense>
    </section>
  );
}
