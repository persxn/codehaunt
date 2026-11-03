'use client';
/** Counts by participant status for the selected event, with links to the pages that act on them. */
import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './admin.module.css';
import { getJSON } from './api';
import { EventPicker, useEventId } from './event-picker';

type Row = { status: string; badgeIssued: boolean; consented: boolean };

export function Overview({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!eventId) return;
    setRows(null);
    getJSON<{ participants: Row[] }>(`/api/staff/participants?eventId=${encodeURIComponent(eventId)}`)
      .then((d) => setRows(d.participants))
      .catch((e: Error) => setError(e.message));
  }, [eventId]);

  const count = (f: (r: Row) => boolean) => rows?.filter(f).length ?? 0;
  const q = eventId ? `?event=${encodeURIComponent(eventId)}` : '';
  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {rows && (
        <div className={styles.cards}>
          {[
            ['Registered', count((r) => r.status === 'REGISTERED')],
            ['Waitlisted', count((r) => r.status === 'WAITLISTED')],
            ['Checked in', count((r) => r.status === 'CHECKED_IN')],
            ['Consented', count((r) => r.consented)],
            ['Badges issued', count((r) => r.badgeIssued)],
            ['Disqualified', count((r) => r.status === 'DISQUALIFIED')],
          ].map(([label, n]) => (
            <div key={label} className={styles.card}>
              <div className={styles.muted}>{label}</div>
              <div className={styles.big}>{n}</div>
            </div>
          ))}
        </div>
      )}
      {eventId && (
        <p className={styles.row}>
          {admin && <Link href={`/admin/event${q}`}>Event settings</Link>}
          {admin && <Link href={`/admin/problems${q}`}>Problems</Link>}
          <Link href={`/admin/participants${q}`}>Participants</Link>
          <Link href={`/admin/badges${q}`}>Badges</Link>
          <Link href={`/admin/checkin${q}`}>Check-in</Link>
        </p>
      )}
    </div>
  );
}
