'use client';
/**
 * Incident dashboard (ADR-021, ADR-028): judge errors after the re-check, docker-proxy refusals, replaced sessions,
 * slowed logins and dead-letter runs. `internalError` can carry participant output: rendered as plain text only.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { ActionForm, time, usePoll, type ActionChoice } from '../ops';

type Who = { participantId: string; name: string; enrolmentNo: string } | null;
interface Incident {
  id: string; kind: 'JUDGE_IE' | 'PROXY_REFUSAL'; status: 'OPEN' | 'RESOLVED'; createdAt: string; participant: Who;
  submission: { id: string; kind: string; status: string; problem: string; verdict: string | null } | null;
  internalError: string | null; firstInternalError: string | null; penaltyReversed: boolean; resolution: string | null; resolvedAt: string | null;
}
interface Dashboard {
  incidents: Incident[];
  sessionsReplaced: Array<{ id: string; createdAt: string; participant: Who; ipChanged: boolean }>;
  loginSlowdowns: Array<{ username: string; failures: number; delayMs: number; participant: Who }>;
  deadLetters: Array<{ id: string; kind: string; createdAt: string; problem: string; participant: Who }>;
}

const KIND: Record<Incident['kind'], string> = { JUDGE_IE: 'Judge error (counted as wrong)', PROXY_REFUSAL: 'Sandbox request refused' };

function choices(i: Incident): ActionChoice[] {
  const out: ActionChoice[] = [];
  if (i.kind === 'JUDGE_IE' && !i.penaltyReversed) out.push({ value: 'reverse_penalty', label: 'Reverse the penalty' });
  if (i.submission) out.push({ value: 'rejudge', label: 'Re-judge' });
  out.push({ value: 'dismiss', label: 'Dismiss (no action)' });
  if (i.participant) {
    out.push({ value: 'end_session', label: 'End their session' });
    out.push({ value: 'deactivate', label: 'Deactivate account', danger: true });
  }
  return out;
}

export function Incidents({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const load = useMemo(() => (eventId ? () => getJSON<Dashboard>(`/api/admin/ops/events/${encodeURIComponent(eventId)}/incidents`) : null), [eventId]);
  const { data, error, refresh } = usePoll(load, 5000);
  const [showResolved, setShowResolved] = useState(false);
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : '';
  const who = (w: Who) => (w ? <Link href={`/admin/log${query}&participant=${encodeURIComponent(w.participantId)}`}>{w.name} ({w.enrolmentNo})</Link> : '—');
  const shown = data?.incidents.filter((i) => showResolved || i.status === 'OPEN') ?? [];

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {data && (
        <>
          <section className={styles.stack} aria-labelledby="judge">
            <h2 id="judge">Judge incidents ({data.incidents.filter((i) => i.status === 'OPEN').length} open)</h2>
            <label className={styles.check}><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
            {shown.length === 0 && <p className={styles.muted}>Nothing here.</p>}
            {shown.map((i) => (
              <article key={i.id} className={`${styles.card} ${styles.stack}`}>
                <div className={styles.row}>
                  <strong>{KIND[i.kind]}</strong>
                  <span className={styles.muted}>{time(i.createdAt)}</span>
                  <span>{who(i.participant)}</span>
                  {i.submission && <span className={styles.muted}>{i.submission.problem} · {i.submission.kind.toLowerCase()} · {i.submission.verdict ?? i.submission.status.toLowerCase()}</span>}
                  {i.status === 'RESOLVED' && <span className={styles.success}>resolved: {i.resolution?.replace('_', ' ')}</span>}
                  {i.penaltyReversed && <span className={styles.success}>penalty reversed</span>}
                </div>
                {i.firstInternalError && <><div className={styles.muted}>First try</div><pre className={styles.pre}>{i.firstInternalError}</pre></>}
                {i.internalError && <><div className={styles.muted}>{i.firstInternalError ? 'Re-check' : 'Detail'}</div><pre className={styles.pre}>{i.internalError}</pre></>}
                <ActionForm id={`i-${i.id}`} choices={choices(i)} run={async (action, reason) => {
                  await postJSON(`/api/admin/ops/incidents/${encodeURIComponent(i.id)}`, { action, reason });
                  await refresh();
                }} />
              </article>
            ))}
          </section>

          <section className={styles.stack} aria-labelledby="sessions">
            <h2 id="sessions">Replaced sessions ({data.sessionsReplaced.length})</h2>
            <p className={styles.muted}>Someone signed in while the participant was already signed in: possible credential sharing. Act from their log page.</p>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Participant</th><th>Network changed</th></tr></thead>
              <tbody>{data.sessionsReplaced.map((r) => <tr key={r.id}><td>{time(r.createdAt)}</td><td>{who(r.participant)}</td><td>{r.ipChanged ? <span className={styles.error}>yes</span> : 'no'}</td></tr>)}</tbody>
            </table>
          </section>

          <section className={styles.stack} aria-labelledby="slow">
            <h2 id="slow">Slowed logins ({data.loginSlowdowns.length})</h2>
            <p className={styles.muted}>Accounts with many wrong passwords in the last 15 minutes. Logins wait, never lock (ADR-020). Cleared when the web restarts.</p>
            <table className={styles.table}>
              <thead><tr><th>Username</th><th>Participant</th><th>Failures</th><th>Wait</th></tr></thead>
              <tbody>{data.loginSlowdowns.map((r) => <tr key={r.username}><td>{r.username}</td><td>{who(r.participant)}</td><td>{r.failures}</td><td>{r.delayMs / 1000} s</td></tr>)}</tbody>
            </table>
          </section>

          <section className={styles.stack} aria-labelledby="dead">
            <h2 id="dead">Runs that failed twice ({data.deadLetters.length})</h2>
            <p className={styles.muted}>The judge crashed on these twice; they count for nothing. Ask the participant to submit again.</p>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Participant</th><th>Problem</th><th>Kind</th></tr></thead>
              <tbody>{data.deadLetters.map((r) => <tr key={r.id}><td>{time(r.createdAt)}</td><td>{who(r.participant)}</td><td>{r.problem}</td><td>{r.kind.toLowerCase()}</td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
