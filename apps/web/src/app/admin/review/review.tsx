'use client';
/**
 * Batch-judge review (WP-07 task 6; ADR-009/033/035). Staff queue judging after the contest, then read each
 * participant's judge score, per-problem rationale and every integrity flag, and override process quality (audited,
 * reason required). Flags only point at something to check; they never change a score. Rationale, evidence and
 * names come from participants or the model: rendered as text only.
 */
import Link from 'next/link';
import { useMemo } from 'react';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { ActionForm, usePoll, type ActionChoice } from '../ops';

interface Row {
  participantId: string; name: string; enrolmentNo: string;
  job: { id: string; status: string; attempts: number; error: string | null; durationMs: number | null } | null;
  overall: { score: number; rationale: string; model: string; createdAt: string } | null;
  problems: Array<{ problemId: string; score: number; rationale: string; criteria: Record<string, number> | null; complexityAchieved: string | null; complexityOptimal: string | null }>;
  injection: { flagged: boolean; evidence: string; hints: string[] };
  flags: Array<{ problemId: string; saveBursts: number; aiCopiedLines: number; codeHeavyQuestions: number }>;
  similarity: Array<{ problemId: string; kind: string; other: string; score: number }>;
  processOverride: number | null;
}
interface Board {
  event: { id: string; name: string; status: string; resultsState: string };
  rubric: string;
  counts: Record<string, number>;
  problems: Array<{ id: string; title: string }>;
  rows: Row[];
}

const QUEUE: ActionChoice[] = [{ value: 'queue', label: 'Queue judging for everyone not yet judged' }];
const REQUEUE: ActionChoice[] = [{ value: 'requeue', label: 'Judge this participant again' }];
const OVERRIDE: ActionChoice[] = [{ value: 'processQuality', label: 'Override process quality', number: { label: 'Score 0–100', min: 0, max: 100, initial: 50 } }];

const STATUS: Record<string, string> = { QUEUED: 'queued', RUNNING: 'judging', DONE: 'judged', NEEDS_MANUAL: 'needs manual score' };

/** Every flag on one participant, as short plain-language notes. */
function flagNotes(r: Row, titles: Map<string, string>): string[] {
  const t = (id: string) => titles.get(id) ?? id;
  const notes: string[] = [];
  if (r.injection.flagged) notes.push(`Tried to address the judge${r.injection.evidence ? `: “${r.injection.evidence}”` : ''}`);
  for (const f of r.flags) {
    if (f.saveBursts) notes.push(`${t(f.problemId)}: ${f.saveBursts} save${f.saveBursts > 1 ? 's' : ''} grew faster than typing`);
    if (f.aiCopiedLines) notes.push(`${t(f.problemId)}: ${f.aiCopiedLines} final-code line${f.aiCopiedLines > 1 ? 's' : ''} match the tutor's examples`);
    if (f.codeHeavyQuestions) notes.push(`${t(f.problemId)}: ${f.codeHeavyQuestions} question${f.codeHeavyQuestions > 1 ? 's' : ''} mostly code`);
  }
  // One line per problem and kind, however many look-alikes (a short problem can have many honest twins).
  const groups = new Map<string, Row['similarity']>();
  for (const s of r.similarity) groups.set(`${s.problemId}\u0000${s.kind}`, [...(groups.get(`${s.problemId}\u0000${s.kind}`) ?? []), s]);
  for (const list of groups.values()) {
    const first = list[0]!;
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const names = sorted.slice(0, 3).map((s) => s.other).join(', ');
    const more = sorted.length > 3 ? ` +${sorted.length - 3}` : '';
    const what = first.kind === 'code' ? 'final code' : 'questions';
    notes.push(`${t(first.problemId)}: ${what} like ${sorted.length} other${sorted.length > 1 ? 's' : ''} (best ${Math.round(sorted[0]!.score * 100)}%: ${names}${more})`);
  }
  return notes;
}

export function Review({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const load = useMemo(() => (eventId ? () => getJSON<Board>(`/api/admin/review/events/${encodeURIComponent(eventId)}`) : null), [eventId]);
  const { data, error, refresh } = usePoll(load, 10_000);
  const titles = new Map(data?.problems.map((p) => [p.id, p.title]) ?? []);
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : '';
  const canQueue = data && (data.event.status === 'ENDED' || data.event.status === 'JUDGING') && data.event.resultsState !== 'FINAL';
  const final = data?.event.resultsState === 'FINAL';

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {data && (
        <>
          <p className={styles.muted}>
            Rubric {data.rubric} · {data.counts.DONE} judged · {data.counts.QUEUED + data.counts.RUNNING} waiting ·{' '}
            {data.counts.NEEDS_MANUAL} need a manual score · {data.counts.none} not queued
          </p>
          <div className={styles.card}>
            {canQueue ? (
              <>
                <ActionForm id="queue" choices={QUEUE} run={async (_a, reason) => {
                  await postJSON(`/api/admin/review/events/${encodeURIComponent(data.event.id)}/queue`, { reason });
                  await refresh();
                }} />
                <p className={styles.muted}>
                  Then run the judge on the DGX: <code>docker compose --profile judge run --rm judge-review</code>. It works
                  one participant at a time and stops when the queue is empty.
                </p>
              </>
            ) : (
              <p className={styles.muted}>{final ? 'Results are final: judging is closed.' : 'Judging opens once the contest has ended.'}</p>
            )}
          </div>
          <div className={styles.scroll}>
            <table className={`${styles.table} ${styles.topAligned}`}>
              <thead>
                <tr><th>Name</th><th>Status</th><th>Process score</th><th>Flags</th><th></th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const notes = flagNotes(r, titles);
                  return (
                    <tr key={r.participantId}>
                      <td>
                        <Link href={`/admin/log${query}&participant=${encodeURIComponent(r.participantId)}`}>{r.name}</Link>
                        <div className={styles.muted}>{r.enrolmentNo}</div>
                      </td>
                      <td>
                        {r.job ? STATUS[r.job.status] ?? r.job.status : 'not queued'}
                        {r.job?.error && <div className={styles.error}>{r.job.error}</div>}
                      </td>
                      <td>
                        {r.processOverride !== null ? <><strong>{r.processOverride}</strong> <span className={styles.muted}>(override; judge {r.overall?.score ?? '—'})</span></> : r.overall ? <strong>{r.overall.score}</strong> : '—'}
                      </td>
                      <td>{notes.length ? <ul className={styles.flagList}>{notes.map((n) => <li key={n}>{n}</li>)}</ul> : <span className={styles.muted}>none</span>}</td>
                      <td>
                        <details>
                          <summary>Details</summary>
                          <div className={styles.stack}>
                            {r.overall && <p>{r.overall.rationale}</p>}
                            {r.problems.map((p) => (
                              <div key={p.problemId}>
                                <strong>{titles.get(p.problemId) ?? p.problemId}: {p.score}</strong>
                                {p.complexityAchieved && <span className={styles.muted}> · {p.complexityAchieved} (best {p.complexityOptimal})</span>}
                                {p.criteria && <div className={styles.muted}>{Object.entries(p.criteria).map(([k, v]) => `${k} ${v}/5`).join(' · ')}</div>}
                                <p>{p.rationale}</p>
                              </div>
                            ))}
                            {!final && (
                              <>
                                <ActionForm id={`o-${r.participantId}`} compact choices={OVERRIDE} run={async (component, reason, value) => {
                                  await postJSON(`/api/admin/ops/participants/${encodeURIComponent(r.participantId)}/override`, { component, value, reason });
                                  await refresh();
                                }} />
                                {r.job && (r.job.status === 'DONE' || r.job.status === 'NEEDS_MANUAL') && (
                                  <ActionForm id={`rq-${r.participantId}`} compact choices={REQUEUE} run={async (_a, reason) => {
                                    await postJSON(`/api/admin/review/jobs/${encodeURIComponent(r.job!.id)}/requeue`, { reason });
                                    await refresh();
                                  }} />
                                )}
                              </>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.muted}>Flags point at something to check in the participant log; they never change a score. Overrides are audit-logged with their reason.</p>
        </>
      )}
    </div>
  );
}
