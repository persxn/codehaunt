'use client';
/**
 * Event overview (WP-07 Part 2): live counts by participant status (polled every 10 s), the check-in funnel as a
 * small bar chart (registered → checked in → consented → badge), and the next pages as action tiles.
 */
import Link from 'next/link';
import { useMemo } from 'react';

import styles from './admin.module.css';
import { getJSON } from './api';
import { EventPicker, useEventId } from './event-picker';
import { usePoll } from './ops';

type Row = { status: string; badgeIssued: boolean; consented: boolean };

export function Overview({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const load = useMemo(
    () => (eventId ? () => getJSON<{ participants: Row[] }>(`/api/staff/participants?eventId=${encodeURIComponent(eventId)}`) : null),
    [eventId],
  );
  const { data, error } = usePoll(load, 10_000);
  const rows = data?.participants ?? null;

  const count = (f: (r: Row) => boolean) => rows?.filter(f).length ?? 0;
  const total = rows?.length ?? 0;
  const checkedIn = count((r) => r.status === 'CHECKED_IN');
  const funnel = [
    { label: 'Registered', n: total - count((r) => r.status === 'WAITLISTED') },
    { label: 'Checked in', n: checkedIn },
    { label: 'Consented', n: count((r) => r.consented) },
    { label: 'Badge issued', n: count((r) => r.badgeIssued) },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.n));
  const q = eventId ? `?event=${encodeURIComponent(eventId)}` : '';
  const tiles = [
    { href: `/admin/contest${q}`, title: 'Contest', text: 'Start, pause, extend, results', show: true },
    { href: `/admin/checkin${q}`, title: 'Check-in', text: 'Scan badges at the door', show: true },
    { href: `/admin/participants${q}`, title: 'Participants', text: 'Import, export, remove', show: true },
    { href: `/admin/badges${q}`, title: 'Badges', text: 'Print the login badges', show: true },
    { href: `/admin/problems${q}`, title: 'Problems', text: 'Statements, tests, drafts', show: admin },
    { href: `/admin/event${q}`, title: 'Event settings', text: 'Schedule, budget, scoring', show: admin },
  ].filter((t) => t.show);

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {rows && (
        <>
          <div className={styles.cards}>
            {[
              ['Registered', count((r) => r.status === 'REGISTERED')],
              ['Waitlisted', count((r) => r.status === 'WAITLISTED')],
              ['Checked in', checkedIn],
              ['Consented', count((r) => r.consented)],
              ['Badges issued', count((r) => r.badgeIssued)],
              ['Disqualified', count((r) => r.status === 'DISQUALIFIED')],
            ].map(([label, n]) => (
              <div key={label} className={styles.card}>
                <div className={styles.heroLabel}>{label}</div>
                <div className={styles.big}>{n}</div>
              </div>
            ))}
          </div>

          <section className={`${styles.card} ${styles.stack}`} aria-labelledby="funnel">
            <div className={styles.row} style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 id="funnel" style={{ margin: 0 }}>Door funnel</h2>
              <span className={styles.muted}>{total} participants · updates every 10 s</span>
            </div>
            <ol className={styles.funnel}>
              {funnel.map((f) => (
                <li key={f.label}>
                  <span className={styles.funnelLabel}>{f.label}</span>
                  <span className={styles.funnelTrack} aria-hidden="true">
                    <span className={styles.funnelBar} style={{ transform: `scaleX(${f.n / max})` }} />
                  </span>
                  <span className={styles.funnelValue}>{f.n}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      {eventId && (
        <nav aria-label="Next steps" className={styles.tiles}>
          {tiles.map((t) => (
            <Link key={t.title} href={t.href} className={styles.tile}>
              <span className={styles.tileTitle}>{t.title} <span aria-hidden="true">→</span></span>
              <span className={styles.muted}>{t.text}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
