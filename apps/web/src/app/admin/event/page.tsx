import { Suspense } from 'react';

import { EventEditor } from './event-editor';

/** Event editor (ADMIN only, ADR-006): create an event and edit its whole config. */
export default function EventPage() {
  return (
    <section>
      <h1>Event settings</h1>
      <p>Every setting on one page. For a guided setup, use the <a href="/admin/setup">setup roadmap</a>.</p>
      <Suspense>
        <EventEditor />
      </Suspense>
    </section>
  );
}
