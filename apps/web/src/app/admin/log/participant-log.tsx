'use client';
/**
 * One participant's log (WP-05): prompts and replies, code versions, runs, tokens and staff actions. Prompts, replies
 * and code are untrusted participant/model text: rendered as plain text only. Hidden-test output never arrives here.
 */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import styles from '../admin.module.css';
import { getJSON } from '../api';
import { useEventId } from '../event-picker';
import { time, usePoll } from '../ops';

interface Log {
  participant: {
    id: string; name: string; username: string; enrolmentNo: string; status: string; active: boolean; seatLabel: string | null;
    checkedInAt: string | null; lastLoginAt: string | null; extraMinutes: number; tokensRemaining: number;
  };
  sessions: Array<{
    id: string; language: string; problem: string; practice: boolean; createdAt: string; closedAt: string | null;
    turns: Array<{ id: string; ord: number; prompt: string; reply: string | null; guardrail: Guardrail | null; promptTokens: number; completionTokens: number; latencyMs: number | null; node: string | null; createdAt: string }>;
    codeVersions: Array<{ id: string; promptTurnId: string | null; language: string; source: string; createdAt: string }>;
  }>;
  submissions: Array<{
    id: string; kind: string; status: string; problem: string; codeVersionId: string; contestMs: number | null; createdAt: string; attempts: number; rechecked: boolean;
    verdict: { verdict: string; testsPassed: number; testsTotal: number; maxTimeMs: number; maxMemoryKb: number; compileLog: string } | null;
    incidents: Array<{ id: string; kind: string; status: string; penaltyReversed: boolean }>;
  }>;
  ledger: Array<{ kind: string; delta: number; reason: string | null; createdAt: string }>;
  actions: Array<{ action: string; reason: string | null; actor: string | null; createdAt: string }>;
}

export function ParticipantLog() {
  const eventId = useEventId();
  const participantId = useSearchParams().get('participant');
  const load = useMemo(() => (participantId ? () => getJSON<Log>(`/api/admin/ops/participants/${encodeURIComponent(participantId)}`) : null), [participantId]);
  const { data, error } = usePoll(load, 10_000);
  const query = eventId ? `?event=${encodeURIComponent(eventId)}` : '';

  if (!participantId) return <p>Pick a participant on the <Link href={`/admin/contest${query}`}>Contest</Link> page.</p>;
  return (
    <div className={styles.stack}>
      <p><Link href={`/admin/contest${query}`}>← Contest</Link></p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {data && (
        <>
          <h2>{data.participant.name} <span className={styles.muted}>{data.participant.enrolmentNo} · {data.participant.username}</span></h2>
          <div className={styles.cards}>
            <div className={styles.card}><div className={styles.muted}>Status</div><div>{data.participant.status.toLowerCase().replace('_', ' ')}{data.participant.active ? '' : ' · deactivated'}</div></div>
            <div className={styles.card}><div className={styles.muted}>Seat</div><div>{data.participant.seatLabel ?? '—'}</div></div>
            <div className={styles.card}><div className={styles.muted}>Tokens left</div><div className={styles.big}>{data.participant.tokensRemaining.toLocaleString()}</div></div>
            <div className={styles.card}><div className={styles.muted}>Extra time</div><div>{data.participant.extraMinutes} min</div></div>
            <div className={styles.card}><div className={styles.muted}>Last sign-in</div><div>{time(data.participant.lastLoginAt)}</div></div>
          </div>

          <section className={styles.stack} aria-labelledby="runs">
            <h3 id="runs">Runs ({data.submissions.length})</h3>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Problem</th><th>Kind</th><th>Verdict</th><th>Tests</th><th>Time</th><th>Memory</th><th>Notes</th></tr></thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{time(s.createdAt)}{s.contestMs !== null && <div className={styles.muted}>{Math.round(s.contestMs / 60_000)}′</div>}</td>
                    <td>{s.problem}</td>
                    <td>{s.kind.toLowerCase()}</td>
                    <td>{s.verdict?.verdict ?? s.status.toLowerCase()}</td>
                    <td>{s.verdict ? `${s.verdict.testsPassed}/${s.verdict.testsTotal}` : ''}</td>
                    <td>{s.verdict ? `${s.verdict.maxTimeMs} ms` : ''}</td>
                    <td>{s.verdict ? `${Math.round(s.verdict.maxMemoryKb / 1024)} MB` : ''}</td>
                    <td className={styles.muted}>
                      {s.rechecked && 're-checked after a judge error. '}
                      {s.incidents.map((i) => `${i.kind.toLowerCase().replace('_', ' ')} (${i.status.toLowerCase()}${i.penaltyReversed ? ', penalty reversed' : ''}) `)}
                      {s.verdict?.verdict === 'CE' && <details><summary>compiler</summary><pre className={styles.pre}>{s.verdict.compileLog}</pre></details>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.stack} aria-labelledby="chats">
            <h3 id="chats">Conversations ({data.sessions.length})</h3>
            {data.sessions.map((s) => (
              <details key={s.id} className={styles.card}>
                <summary>
                  {s.problem}{s.practice ? ' (warm-up)' : ''} · {s.language.toLowerCase()} · {s.turns.length} prompts · {time(s.createdAt)}{s.closedAt ? ` → ${time(s.closedAt)}` : ''}
                </summary>
                <div className={styles.stack}>
                  {s.turns.map((t) => (
                    <div key={t.id} className={styles.stack}>
                      <div className={styles.muted}>#{t.ord + 1} · {time(t.createdAt)} · {t.promptTokens}+{t.completionTokens} tokens{t.latencyMs !== null ? ` · ${t.latencyMs} ms` : ''}{t.node ? ` · ${t.node}` : ''}</div>
                      <pre className={styles.pre}>{t.prompt}</pre>
                      {t.guardrail && <GuardrailLine g={t.guardrail} />}
                      <pre className={styles.pre}>{t.reply ?? '(no reply)'}</pre>
                    </div>
                  ))}
                  {s.codeVersions.map((c, i) => (
                    <details key={c.id}>
                      <summary>Code version {i + 1} · {time(c.createdAt)}{c.promptTurnId ? '' : ' (revert)'}</summary>
                      <pre className={styles.pre}>{c.source}</pre>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </section>

          <section className={styles.stack} aria-labelledby="tokens">
            <h3 id="tokens">Token grants and top-ups</h3>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Kind</th><th>Tokens</th><th>Reason</th></tr></thead>
              <tbody>{data.ledger.map((l, i) => <tr key={i}><td>{time(l.createdAt)}</td><td>{l.kind.toLowerCase().replace('_', ' ')}</td><td>{l.delta.toLocaleString()}</td><td>{l.reason ?? ''}</td></tr>)}</tbody>
            </table>
          </section>

          <section className={styles.stack} aria-labelledby="actions">
            <h3 id="actions">Actions and sign-in events</h3>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead>
              <tbody>{data.actions.map((a, i) => <tr key={i}><td>{time(a.createdAt)}</td><td>{a.action}</td><td>{a.actor ?? ''}</td><td>{a.reason ?? ''}</td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

/** What the tutor guardrails did on a turn (ADR-042). The reply below is the unfiltered model output. */
type Guardrail = { intent?: string; level?: number; strict?: boolean; shownLines?: number; removed?: number; usedBefore?: number; sessionLines?: number | null };

function GuardrailLine({ g }: { g: Guardrail }) {
  const parts = [
    `guardrail: ${(g.intent ?? 'unknown').replace('_', '-')}`,
    g.intent === 'answer_seeking' || g.intent === 'hint' ? `hint level ${g.level ?? '?'}` : null,
    g.strict ? 'hints-only problem' : null,
    `${g.shownLines ?? 0} code lines shown${g.sessionLines ? ` (${(g.usedBefore ?? 0) + (g.shownLines ?? 0)}/${g.sessionLines} this chat)` : ''}`,
    g.removed ? `${g.removed} removed before the participant saw it` : null,
  ].filter(Boolean);
  return <div className={g.removed || g.intent === 'answer_seeking' ? styles.flagList : styles.muted} style={{ listStyle: 'none', paddingLeft: 0 }}>{parts.join(' · ')}</div>;
}
