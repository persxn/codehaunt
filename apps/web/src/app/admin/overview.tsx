'use client';
/**
 * Admin overview (WP-11, ADR-044): the platform at a glance (`GET /api/admin/dashboard`), the selected event's panel
 * (setup progress, people, tutor, judge, tokens, incidents; `?eventId=`), its door funnel, recent events and quick
 * actions. Real counts only, polled every 10 s. Empty states explain and link to the next action.
 */
import Link from 'next/link';
import { useMemo } from 'react';

import { StateArt } from '@/components/state-art/state-art';

import styles from './admin.module.css';
import { getJSON } from './api';
import d from './dashboard.module.css';
import { EventPicker, useEventId } from './event-picker';
import { usePoll } from './ops';

type Platform = {
  events: { total: number; draft: number; live: number; finished: number };
  participants: { total: number; checkedIn: number; liveSessions: number };
  lastHour: { questions: number; submissions: number };
  recent: Array<{ id: string; slug: string; name: string; status: string; startsAt: string | null; participants: number; problems: number; setupDone: number; setupTotal: number }>;
};
type EventDash = {
  event: { id: string; name: string; slug: string; status: string };
  setup: { done: number; total: number; canLaunch: boolean; launched: boolean; next: { n: number; title: string } | null };
  participants: { total: number; registered: number; waitlisted: number; checkedIn: number; disqualified: number; liveSessions: number };
  tutor: { questions: number; last10Minutes: number; answerSeeking: number; repliesTrimmed: number };
  judge: { submissions: number; accepted: number };
  tokensUsed: number;
  openIncidents: number;
};
type Row = { status: string; badgeIssued: boolean; consented: boolean };

const fmt = (n: number) => n.toLocaleString('en-IN');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'no date');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const statusLabel = (s: string) => s.toLowerCase().replace('_', ' ');

export function Overview({ admin, name }: { admin: boolean; name: string }) {
  const eventId = useEventId();
  const platform = usePoll(useMemo(() => () => getJSON<Platform>('/api/admin/dashboard'), []), 10_000);
  const one = usePoll(
    useMemo(() => (eventId ? () => getJSON<EventDash>(`/api/admin/dashboard?eventId=${encodeURIComponent(eventId)}`) : null), [eventId]),
    10_000,
  );
  const people = usePoll(
    useMemo(() => (eventId ? () => getJSON<{ participants: Row[] }>(`/api/staff/participants?eventId=${encodeURIComponent(eventId)}`) : null), [eventId]),
    10_000,
  );
  const p = platform.data;
  const q = eventId ? `?event=${encodeURIComponent(eventId)}` : '';

  return (
    <div className={styles.stack}>
      <section className={`${d.hero} sig-drift sig-scan`} aria-labelledby="control-room">
        <p className={d.eyebrow}><span className={d.liveDot} aria-hidden="true" /> Control room · updates every 10 s</p>
        <h2 id="control-room" className={d.heroTitle}>Welcome back, {name.split(' ')[0]}.</h2>
        {p ? (
          <div className={d.strip}>
            <Stat label="Live events" value={p.events.live} note={`${p.events.total} total · ${p.events.draft} in setup · ${p.events.finished} finished`} hot />
            <Stat label="Participants" value={p.participants.total} note={`${fmt(p.participants.checkedIn)} checked in`} />
            <Stat label="Signed in now" value={p.participants.liveSessions} note="participant sessions" />
            <Stat label="Last hour" value={p.lastHour.questions + p.lastHour.submissions} note={`${p.lastHour.questions} questions · ${p.lastHour.submissions} submissions`} />
          </div>
        ) : (
          <div className={d.skeletonRow} aria-busy="true" aria-label="Loading numbers">
            {[0, 1, 2, 3].map((i) => <div key={i} className="sig-skeleton" />)}
          </div>
        )}
        <div className={d.actions}>
          {admin && <Link className={`${d.actionLink} ${d.actionPrimary}`} href="/admin/setup?new=1">＋ New event</Link>}
          {admin && eventId && <Link className={d.actionLink} href={`/admin/setup${q}`}>Event setup roadmap →</Link>}
          {eventId && <Link className={d.actionLink} href={`/admin/participants${q}`}>Participants</Link>}
          {eventId && <Link className={d.actionLink} href={`/admin/contest${q}`}>Contest controls</Link>}
        </div>
      </section>
      {platform.error && <p className={styles.error} role="alert">{platform.error}</p>}

      {p && p.events.total === 0 ? (
        <section className={d.empty} aria-labelledby="no-events">
          <StateArt kind="not-found" size={140} />
          <h2 id="no-events">No events yet</h2>
          <p>An event holds the schedule, the problems and the participants. The setup roadmap walks you through it in seven short steps.</p>
          {admin ? (
            <Link className={`${d.actionLink} ${d.actionPrimary}`} href="/admin/setup?new=1">Create your first event</Link>
          ) : (
            <p>Ask an admin to create the event.</p>
          )}
        </section>
      ) : (
        <>
          <EventPicker admin={admin} />
          {!eventId && p && (
            <p className={styles.muted}>Choose an event above, or open one from the list below, to see its numbers.</p>
          )}
          {eventId && <EventPanel data={one.data} error={one.error} admin={admin} q={q} rows={people.data?.participants ?? null} />}
          {p && p.recent.length > 0 && (
            <section className={styles.stack} aria-labelledby="recent">
              <h2 id="recent" style={{ margin: 0 }}>Recent events</h2>
              <ul className={d.recent}>
                {p.recent.map((e) => (
                  <li key={e.id}>
                    <Link className={d.recentItem} href={`/admin?event=${encodeURIComponent(e.id)}`} aria-current={e.id === eventId ? 'true' : undefined}>
                      <span className={d.recentName}>{e.name} <span className={styles.muted}>{e.slug}</span></span>
                      <span className={d.pill} data-status={e.status}>{statusLabel(e.status)}</span>
                      <span className={d.recentProgress}>
                        <span className="sig-progress" aria-hidden="true"><span style={{ transform: `scaleX(${e.setupDone / e.setupTotal})` }} /></span>
                        <span className={d.recentMeta}>setup {e.setupDone}/{e.setupTotal}</span>
                      </span>
                      <span className={d.recentMeta}>{when(e.startsAt)} · {plural(e.participants, 'person', 'people')} · {plural(e.problems, 'problem')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note, hot = false }: { label: string; value: number; note: string; hot?: boolean }) {
  return (
    <div className={d.stat}>
      <span className={d.statLabel}>{label}</span>
      <span className={`${d.statValue} ${hot && value > 0 ? 'sig-gradient-text' : ''}`}>{fmt(value)}</span>
      <span className={d.statNote}>{note}</span>
    </div>
  );
}

function EventPanel({ data, error, admin, q, rows }: { data: EventDash | null; error: string; admin: boolean; q: string; rows: Row[] | null }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!data) return <div className={d.skeletonRow} aria-busy="true" aria-label="Loading the event">{[0, 1, 2, 3].map((i) => <div key={i} className="sig-skeleton" />)}</div>;
  const { setup, participants: pp, tutor, judge } = data;
  const count = (f: (r: Row) => boolean) => rows?.filter(f).length ?? 0;
  const funnel = [
    { label: 'Registered', n: pp.total - pp.waitlisted },
    { label: 'Badge issued', n: count((r) => r.badgeIssued) },
    { label: 'Checked in', n: pp.checkedIn },
    { label: 'Consented', n: count((r) => r.consented) },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.n));
  return (
    <>
      <section className={`${d.panel} ${setup.launched ? '' : 'sig-border'}`} aria-labelledby="event-panel">
        <div className={d.panelHead}>
          <h2 id="event-panel" className={d.panelTitle}>{data.event.name}</h2>
          <span className={d.pill} data-status={data.event.status}>{statusLabel(data.event.status)}</span>
        </div>
        <div className={d.progressRow}>
          <span className="sig-progress" role="progressbar" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.done} aria-label="Setup progress">
            <span style={{ transform: `scaleX(${setup.done / setup.total})` }} />
          </span>
          <span className={d.progressText}>{setup.done} of {setup.total} setup steps done</span>
        </div>
        {setup.next && !setup.launched && (
          <div className={d.next}>
            <span><span className={d.nextNum}>{String(setup.next.n).padStart(2, '0')}</span>Next: {setup.next.title}</span>
            {admin ? (
              <Link className={`${d.actionLink} ${d.actionPrimary}`} href={`/admin/setup${q}&step=${setup.next.n}`}>Continue setup →</Link>
            ) : (
              <span className={styles.muted}>An admin finishes the setup.</span>
            )}
          </div>
        )}
      </section>

      <div className={d.tiles}>
        <Link className={d.tile} href={`/admin/participants${q}`}>
          <span className={d.statLabel}>Participants</span>
          <span className={d.tileValue}>{fmt(pp.total)}</span>
          <span className={d.tileSub}>{pp.registered} registered · {pp.checkedIn} checked in · {pp.waitlisted} waitlisted{pp.disqualified ? ` · ${pp.disqualified} disqualified` : ''}</span>
        </Link>
        <Link className={d.tile} href={`/admin/participants${q}`}>
          <span className={d.statLabel}>Signed in now</span>
          <span className={d.tileValue}>{fmt(pp.liveSessions)}</span>
          <span className={d.tileSub}>live participant sessions</span>
        </Link>
        <Link className={d.tile} href={`/admin/log${q}`}>
          <span className={d.statLabel}>Tutor</span>
          <span className={d.tileValue}>{fmt(tutor.questions)}</span>
          <span className={d.tileSub}>{tutor.last10Minutes} in the last 10 min · {tutor.answerSeeking} answer requests redirected · {tutor.repliesTrimmed} replies trimmed</span>
        </Link>
        <Link className={d.tile} href={`/admin/leaderboard${q}`}>
          <span className={d.statLabel}>Submissions</span>
          <span className={d.tileValue}>{fmt(judge.submissions)}</span>
          <span className={d.tileSub}>{judge.accepted} accepted</span>
        </Link>
        <div className={d.tile}>
          <span className={d.statLabel}>Tokens used</span>
          <span className={d.tileValue}>{fmt(data.tokensUsed)}</span>
          <span className={d.tileSub}>contest problems only (warm-up is free)</span>
        </div>
        <Link className={d.tile} href={`/admin/incidents${q}`}>
          <span className={d.statLabel}>Open incidents</span>
          <span className={`${d.tileValue} ${data.openIncidents ? d.alert : ''}`}>{fmt(data.openIncidents)}</span>
          <span className={d.tileSub}>{data.openIncidents ? 'need a decision' : 'nothing waiting'}</span>
        </Link>
      </div>

      {pp.total > 0 ? (
        <section className={`${styles.card} ${styles.stack}`} aria-labelledby="funnel">
          <h2 id="funnel" style={{ margin: 0 }}>Door funnel</h2>
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
      ) : (
        <section className={d.empty} aria-labelledby="no-people">
          <StateArt kind="checked-in" size={110} />
          <h2 id="no-people">Nobody registered yet</h2>
          <p>Import the participant list as a CSV. You get a preview with every problem marked before anything is saved.</p>
          <Link className={`${d.actionLink} ${d.actionPrimary}`} href={admin ? `/admin/setup${q}&step=5` : `/admin/participants${q}`}>Import participants</Link>
        </section>
      )}
    </>
  );
}
