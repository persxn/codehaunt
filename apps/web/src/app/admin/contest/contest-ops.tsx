'use client';
/**
 * Contest controls (WP-05, ADR-028): clock, start/pause/resume/end, extend, projector link, results, and the
 * per-participant actions (top-up, extra time, disqualify, sign out). Every action needs a reason (audit log).
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { ActionForm, clock, time, usePoll, type ActionChoice } from '../ops';

interface Status {
  id: string; name: string; status: string; phase: string; startedAt: string; endsAt: string; freezesAt: string;
  msLeft: number; frozen: boolean; durationMinutes: number; resultsState: 'NONE' | 'PROVISIONAL' | 'FINAL';
  appealEndsAt: string | null; projectorLink: boolean; projectorEnabled: boolean;
}
interface OpsParticipant {
  id: string; name: string; enrolmentNo: string; status: string; active: boolean; seatLabel: string | null; extraMinutes: number; tokensRemaining: number;
}

const CONTROLS: Record<string, ActionChoice[]> = {
  DRAFT: [{ value: 'open_checkin', label: 'Open check-in' }, { value: 'start', label: 'Start contest' }],
  CHECK_IN: [{ value: 'start', label: 'Start contest' }],
  RUNNING: [{ value: 'pause', label: 'Pause (stops prompts and submits)' }, { value: 'end', label: 'End contest now', danger: true }],
  PAUSED: [{ value: 'resume', label: 'Resume' }, { value: 'end', label: 'End contest now', danger: true }],
};

const PARTICIPANT_ACTIONS: ActionChoice[] = [
  { value: 'topup', label: 'Top up tokens', number: { label: 'Tokens', min: 1, max: 1_000_000, initial: 5000 } },
  { value: 'extra', label: 'Set extra time', number: { label: 'Extra minutes (total)', min: 0, max: 600, initial: 10 } },
  { value: 'end_session', label: 'Sign out (end session)' },
  { value: 'disqualify', label: 'Disqualify', danger: true },
  { value: 'deactivate', label: 'Deactivate account', danger: true },
  { value: 'reinstate', label: 'Reinstate' },
];

export function ContestOps({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const loadStatus = useMemo(() => (eventId ? () => getJSON<Status>(`/api/admin/ops/events/${encodeURIComponent(eventId)}`) : null), [eventId]);
  const loadPeople = useMemo(() => (eventId ? () => getJSON<OpsParticipant[]>(`/api/admin/ops/events/${encodeURIComponent(eventId)}/participants`) : null), [eventId]);
  const status = usePoll(loadStatus, 2000);
  const people = usePoll(loadPeople, 10_000);
  const [msLeft, setMsLeft] = useState(0);
  const [projector, setProjector] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const s = status.data;
  useEffect(() => {
    if (!s) return;
    setMsLeft(s.msLeft);
    if (s.phase !== 'running') return;
    const t = setInterval(() => setMsLeft((m) => Math.max(0, m - 1000)), 1000);
    return () => clearInterval(t);
  }, [s]);

  const base = eventId ? `/api/admin/ops/events/${encodeURIComponent(eventId)}` : '';
  const control = useCallback(async (action: string, reason: string) => {
    await postJSON(base, { action, reason });
    await status.refresh();
  }, [base, status]);

  const newLink = async (reason: string) => {
    const { path } = await postJSON<{ path: string }>(`${base}/projector`, { reason });
    setProjector(`${window.location.origin}${path}`);
    await status.refresh();
  };

  const act = async (p: OpsParticipant, action: string, reason: string, value: number | undefined, idempotencyKey: string) => {
    const url = `/api/admin/ops/participants/${encodeURIComponent(p.id)}`;
    if (action === 'topup') await postJSON(`${url}/topup`, { tokens: value, reason, idempotencyKey });
    else if (action === 'extra') await postJSON(`${url}/extra-time`, { minutes: value, reason });
    else await postJSON(`${url}/action`, { action, reason });
    await people.refresh();
  };

  const q = search.trim().toLowerCase();
  const shown = (people.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.enrolmentNo.toLowerCase().includes(q) || (p.seatLabel ?? '').toLowerCase().includes(q));
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : '';

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {status.error && <p className={styles.error} role="alert">{status.error}</p>}
      {s && (
        <>
          <div className={styles.cards}>
            <div className={styles.card}><div className={styles.muted}>Status</div><div className={styles.big}>{s.status.toLowerCase().replace('_', '-')}</div></div>
            <div className={styles.card}><div className={styles.muted}>Time left</div><div className={styles.big} aria-live="off">{s.phase === 'not_started' ? '—' : clock(msLeft)}</div></div>
            <div className={styles.card}><div className={styles.muted}>Started · ends</div><div>{s.status === 'DRAFT' || s.status === 'CHECK_IN' ? 'not started' : `${time(s.startedAt)} · ${time(s.endsAt)}`}</div></div>
            <div className={styles.card}><div className={styles.muted}>Projector freeze</div><div>{s.frozen ? 'frozen' : `from ${time(s.freezesAt)}`}</div></div>
            <div className={styles.card}><div className={styles.muted}>Length</div><div>{s.durationMinutes} min</div></div>
          </div>

          {CONTROLS[s.status] && (
            <section className={`${styles.card} ${styles.stack}`} aria-labelledby="controls">
              <h2 id="controls">Contest clock</h2>
              <ActionForm key={s.status} id="control" choices={CONTROLS[s.status]!} run={(a, r) => control(a, r)} />
              {(s.status === 'RUNNING' || s.status === 'PAUSED') && (
                <ActionForm id="extend" choices={[{ value: 'extend', label: 'Extend for everyone', number: { label: 'Minutes', min: 1, max: 240, initial: 10 } }]}
                  run={async (_a, reason, minutes, idempotencyKey) => { await postJSON(`${base}/extend`, { minutes, reason, idempotencyKey }); await status.refresh(); }} />
              )}
              <p className={styles.muted}>Pause stops prompts and submits for everyone at once and stops the clock. End stops everyone, including people on extra time.</p>
            </section>
          )}

          <section className={`${styles.card} ${styles.stack}`} aria-labelledby="projector">
            <h2 id="projector">Projector</h2>
            {!s.projectorEnabled && <p className={styles.muted}>The projector is switched off in the event settings.</p>}
            <ActionForm id="projector" key={String(s.projectorLink)}
              choices={[{ value: 'link', label: s.projectorLink ? 'Make a new link (the old one stops working)' : 'Make projector link' }]}
              run={(_a, reason) => newLink(reason)} />
            {projector && (
              <div className={styles.stack}>
                <p className={styles.muted}>Shown once. Open it on the projector computer now; anyone with the link sees rank, name and solved.</p>
                <p className={styles.pre}>{projector}</p>
              </div>
            )}
          </section>

          <section className={`${styles.card} ${styles.stack}`} aria-labelledby="results">
            <h2 id="results">Results</h2>
            <p>
              State: <strong>{s.resultsState.toLowerCase()}</strong>
              {s.appealEndsAt && s.resultsState === 'PROVISIONAL' && <> · appeals until {time(s.appealEndsAt)}</>}
            </p>
            {(s.status === 'ENDED' || s.status === 'JUDGING') && s.resultsState === 'NONE' && (
              <ActionForm id="provisional" choices={[{ value: 'provisional', label: 'Publish provisional results' }]} run={async (a, r) => { await postJSON(`${base}/results`, { action: a, reason: r }); await status.refresh(); }} />
            )}
            {s.resultsState === 'PROVISIONAL' && (
              <ActionForm id="final" choices={[{ value: 'final', label: 'Publish final results' }]} run={async (a, r) => { await postJSON(`${base}/results`, { action: a, reason: r }); await status.refresh(); }} />
            )}
            <p className={styles.row}>
              <a href={`${base}/results`} download>Download results CSV</a>
              <Link href={`/admin/leaderboard${query}`}>Live leaderboard</Link>
              <Link href={`/admin/incidents${query}`}>Incidents</Link>
            </p>
          </section>

          <section className={styles.stack} aria-labelledby="people">
            <h2 id="people">Participants</h2>
            {people.error && <p className={styles.error} role="alert">{people.error}</p>}
            <Field label="Search name, enrolment or seat" id="ops-search">
              <input id="ops-search" className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <table className={styles.table}>
              <thead><tr><th>Name</th><th>Enrolment</th><th>Seat</th><th>Status</th><th>Tokens left</th><th>Extra</th><th>Actions</th></tr></thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/admin/log${query}&participant=${encodeURIComponent(p.id)}`}>{p.name}</Link></td>
                    <td>{p.enrolmentNo}</td>
                    <td>{p.seatLabel ?? ''}</td>
                    <td className={styles.muted}>{p.status === 'DISQUALIFIED' ? 'disqualified' : p.active ? 'checked in' : 'deactivated'}</td>
                    <td>{p.tokensRemaining.toLocaleString()}</td>
                    <td>{p.extraMinutes ? `+${p.extraMinutes} min` : ''}</td>
                    <td>
                      <details>
                        <summary>Act</summary>
                        <ActionForm id={`p-${p.id}`} compact choices={PARTICIPANT_ACTIONS} run={(a, r, v, k) => act(p, a, r, v, k)} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
