'use client';
/** Sample runs and submissions, newest first, with the projected verdict (never hidden-test detail). */
import { useEffect, useRef } from 'react';

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

const keyOf = (r: RunView) => `${r.submissionId}-${r.verdict ?? r.status}`;

export function RunsPanel({ runs }: { runs: RunView[] }) {
  // Runs (and verdicts) already on screen when the panel opened never replay their moment; only a change seen live does.
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= new Set(runs.map(keyOf));
  useEffect(() => { for (const r of runs) seen.current!.add(keyOf(r)); }, [runs]);

  if (!runs.length) return <p className={styles.muted}>No runs yet. Run the samples to check the current code.</p>;
  return (
    <ol className={styles.runs} aria-live="polite">
      {runs.map((r, i) => (
        // Keyed by verdict too: when a verdict arrives the newest card re-enters with its moment (ADR-037).
        <li
          key={keyOf(r)}
          className={styles.run}
          data-newest={i === 0 || undefined}
          data-moment={i === 0 && !seen.current!.has(keyOf(r)) ? (r.verdict ? (r.verdict === 'AC' ? 'accepted' : 'rejected') : 'judging') : undefined}
        >
          {i === 0 && (
            <span className={styles.runArt}>
              <StateArt kind={artFor(r)} size={88} />
              {r.verdict === 'AC' && !seen.current!.has(keyOf(r)) && <BatBurst />}
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
