'use client';
/**
 * The organizers' live leaderboard (ADR-008/009/028): never frozen, every component, per-problem cells, overrides.
 * Polls every 5 s. Names are participant-supplied: rendered as text.
 */
import Link from 'next/link';
import { useMemo } from 'react';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { ActionForm, clock, usePoll, type ActionChoice } from '../ops';

interface ProblemScore { problemId: string; solved: boolean; points: number; rejected: number; attempts: number; solvedAtMs: number | null }
interface Standing {
  participantId: string; name: string; enrolmentNo: string; disqualified: boolean; rank: number | null; solved: number; tokens: number;
  correctness: number; tokenEfficiency: number; resourceEfficiency: number; processQuality: number | null; total: number;
  problems: ProblemScore[]; missingReference: string[]; overridden: string[];
}
interface Board {
  contest: { status: string; phase: string; msLeft: number; frozen: boolean; resultsState: string };
  weights: Record<string, number>;
  problems: Array<{ id: string; slug: string; title: string; difficulty: string }>;
  standings: Standing[];
}

const OVERRIDES: ActionChoice[] = [
  { value: 'correctness', label: 'Override correctness', number: { label: 'Score 0–100', min: 0, max: 100, initial: 50 } },
  { value: 'tokenEfficiency', label: 'Override token efficiency', number: { label: 'Score 0–100', min: 0, max: 100, initial: 50 } },
  { value: 'resourceEfficiency', label: 'Override memory + runtime', number: { label: 'Score 0–100', min: 0, max: 100, initial: 50 } },
  { value: 'processQuality', label: 'Override process quality', number: { label: 'Score 0–100', min: 0, max: 100, initial: 50 } },
];

const n = (v: number | null) => (v === null ? '—' : v.toFixed(1));

export function Leaderboard({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const load = useMemo(() => (eventId ? () => getJSON<Board>(`/api/admin/ops/events/${encodeURIComponent(eventId)}/leaderboard`) : null), [eventId]);
  const { data, error, refresh } = usePoll(load, 5000);
  const missing = new Set(data?.standings.flatMap((s) => s.missingReference) ?? []);
  const titles = new Map(data?.problems.map((p) => [p.id, p.title]) ?? []);
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : '';

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {data && (
        <>
          <p className={styles.muted}>
            {data.contest.status.toLowerCase()} · {clock(data.contest.msLeft)} left
            {data.contest.frozen && ' · the projector is frozen; this board is live'} · results {data.contest.resultsState.toLowerCase()} ·
            weights: correctness {data.weights.correctness}, tokens {data.weights.tokenEfficiency}, memory + runtime {data.weights.resourceEfficiency}, process {data.weights.processQuality}
            {data.standings.some((s) => s.processQuality === null) && ' · process quality: judge pending (0 for now)'}
          </p>
          {missing.size > 0 && (
            <p className={styles.error} role="alert">
              No reference calibration in the language used for: {[...missing].map((id) => titles.get(id) ?? id).join(', ')}. Those solves get full memory + runtime marks; calibrate them in Problems.
            </p>
          )}
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Solved</th>
                  {data.problems.map((p) => <th key={p.id} title={p.title}>{p.slug}</th>)}
                  <th>Correct.</th><th>Tokens</th><th>Token eff.</th><th>Mem + time</th><th>Process</th><th>Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((s) => (
                  <tr key={s.participantId} className={s.disqualified ? styles.muted : undefined}>
                    <td>{s.rank ?? 'DQ'}</td>
                    <td><Link href={`/admin/log${query}&participant=${encodeURIComponent(s.participantId)}`}>{s.name}</Link><div className={styles.muted}>{s.enrolmentNo}</div></td>
                    <td>{s.solved}</td>
                    {s.problems.map((p) => (
                      <td key={p.problemId} title={`${p.attempts} attempts, ${p.rejected} counted wrong`}>
                        {p.solved ? <span className={styles.success}>{p.points}</span> : p.attempts ? <span className={styles.error}>−{p.rejected}</span> : ''}
                        {p.solved && p.solvedAtMs !== null && <div className={styles.muted}>{Math.round(p.solvedAtMs / 60_000)}′{p.rejected ? ` · −${p.rejected}` : ''}</div>}
                      </td>
                    ))}
                    <td>{n(s.correctness)}{s.overridden.includes('correctness') && '*'}</td>
                    <td>{s.tokens.toLocaleString()}</td>
                    <td>{n(s.tokenEfficiency)}{s.overridden.includes('tokenEfficiency') && '*'}</td>
                    <td>{n(s.resourceEfficiency)}{s.overridden.includes('resourceEfficiency') && '*'}</td>
                    <td>{n(s.processQuality)}{s.overridden.includes('processQuality') && '*'}</td>
                    <td><strong>{s.total.toFixed(2)}</strong></td>
                    <td>
                      {data.contest.resultsState !== 'FINAL' && (
                        <details>
                          <summary>Override</summary>
                          <ActionForm id={`o-${s.participantId}`} compact choices={OVERRIDES}
                            run={async (component, reason, value) => {
                              await postJSON(`/api/admin/ops/participants/${encodeURIComponent(s.participantId)}/override`, { component, value, reason });
                              await refresh();
                            }} />
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.muted}>* overridden by an organizer (audit-logged). Per problem: points, minute solved, wrong attempts counted.</p>
        </>
      )}
    </div>
  );
}
