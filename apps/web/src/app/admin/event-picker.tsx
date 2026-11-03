'use client';
/** The selected event lives in the URL (?event=<id>) so every admin page and link shares it. */
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Field, inputClass } from '@/components/field';

import styles from './admin.module.css';
import { eventOptions, type EventOption } from './api';

export function useEventId(): string | null {
  return useSearchParams().get('event');
}

/** A labelled picker that sets ?event=; shows the current choice so it can be switched. */
export function EventPicker({ admin }: { admin: boolean }) {
  const router = useRouter();
  const current = useEventId();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    eventOptions(admin).then(setEvents).catch((e: Error) => setError(e.message));
  }, [admin]);

  return (
    <div className={styles.row}>
      <Field label="Event" id="event-picker">
        <select
          id="event-picker"
          className={inputClass}
          value={current ?? ''}
          onChange={(e) => router.replace(`?event=${encodeURIComponent(e.target.value)}`)}
        >
          <option value="" disabled>Choose an event</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.status.toLowerCase()})</option>)}
        </select>
      </Field>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
