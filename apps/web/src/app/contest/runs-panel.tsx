'use client';
/** Sample runs and submissions, newest first, with the projected verdict (never hidden-test detail). */
import { useEffect, useRef, useState } from 'react';

import type { RunView } from '@codehaunt/contracts';

import { BatBurst } from '@/components/ornaments';
import { StateArt, type StateArtKind } from '@/components/state-art/state-art';
import { VerdictBadge } from '@/components/verdict-badge';

import styles from './contest.module.css';

const mb = (kb: number) => `${(kb / 1024).toFixed(1)} MB`;

/** The illustration for the newest run only (ADR-032), beside its verdict badge. */
function artFor(run: RunView): StateArtKind {
  if (!run.verdict) return 'judging';
  return run.verdict === 'AC' ? 'accepted' : 'wrong-answer';
}

/** The longest verdict moment (bats: 1.3 × 900 ms + delay), plus a margin. */
const MOMENT_MS = 1500;
const keyOf = (r: RunView) => `${r.submissionId}-${r.verdict ?? r.status}`;

export function RunsPanel({ runs }: { runs: RunView[] }) {
  // Runs (and verdicts) already on screen when the panel opened never replay their moment; only a change seen live
  // does. A new key gets a moment that lasts MOMENT_MS whatever re-renders happen meanwhile (audit R17-1: keystrokes
  // and polls used to cut it short); the timer re-renders once when it ends.
  const seen = useRef<Set<string> | null>(null);
  const until = useRef(new Map<string, number>());
  const [, setTick] = useState(0);
  seen.current ??= new Set(runs.map(keyOf));
  const now = Date.now();
  for (const r of runs) {
    const k = keyOf(r);
    if (!seen.current.has(k)) { seen.current.add(k); until.current.set(k, now + MOMENT_MS); }
  }
  useEffect(() => {
    const next = Math.min(...[...until.current.values()].filter((t) => t > Date.now()));
    if (!Number.isFinite(next)) return;
    const t = setTimeout(() => setTick((n) => n + 1), next - Date.now() + 20);
    return () => clearTimeout(t);
  });
  const live = (r: RunView) => (until.current.get(keyOf(r)) ?? 0) > now;

  if (!runs.length) return <p className={styles.muted}>No runs yet. Run the samples to check the current code.</p>;
  return (
    <ol className={styles.runs} aria-live="polite">
      {runs.map((r, i) => (
        // Keyed by verdict too: when a verdict arrives the newest card re-enters with its moment (ADR-037).
        <li
          key={keyOf(r)}
          className={styles.run}
          data-newest={i === 0 || undefined}
          data-moment={i === 0 && live(r) ? (r.verdict ? (r.verdict === 'AC' ? 'accepted' : 'rejected') : 'judging') : undefined}
        >
          {i === 0 && (
            <span className={styles.runArt}>
              <StateArt kind={artFor(r)} size={88} />
              {r.verdict === 'AC' && live(r) && <BatBurst />}
            </span>
          )}
          <div className={styles.runHead}>
            <VerdictBadge verdict={r.verdict} status={r.verdict ? undefined : r.status} />
            <span>{r.kind === 'SAMPLE' ? 'Sample run' : 'Submission'}</span>
            {r.testsTotal !== undefined && <span>{r.testsPassed}/{r.testsTotal} passed</span>}
            {r.maxTimeMs !== undefined && <span>{r.maxTimeMs} ms</span>}
            {r.maxMemoryKb !== undefined && <span>{mb(r.maxMemoryKb)}</span>}
            <time className={styles.muted} dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleTimeString()}</time>
          </div>
          {r.compileLog && <pre className={styles.inlineCode}>{r.compileLog}</pre>}
          {r.sampleResults && r.sampleResults.length > 0 && (
            <table className={styles.tests}>
              <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Time</th><th scope="col">Output</th></tr></thead>
              <tbody>
                {r.sampleResults.map((t, i) => (
                  <tr key={t.testId}>
                    <td>{i + 1}</td>
                    <td><VerdictBadge verdict={t.verdict} /></td>
                    <td>{Math.round(t.timeMs)} ms</td>
                    <td><pre className={styles.output}>{t.outputExcerpt}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </li>
      ))}
    </ol>
  );
}
