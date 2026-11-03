'use client';
/** Sample runs and submissions, newest first, with the projected verdict (never hidden-test detail). */
import type { RunView } from '@codehaunt/contracts';

import { VerdictBadge } from '@/components/verdict-badge';

import styles from './contest.module.css';

const mb = (kb: number) => `${(kb / 1024).toFixed(1)} MB`;

export function RunsPanel({ runs }: { runs: RunView[] }) {
  if (!runs.length) return <p className={styles.muted}>No runs yet. Run the samples to check the current code.</p>;
  return (
    <ol className={styles.runs} aria-live="polite">
      {runs.map((r) => (
        <li key={r.submissionId} className={styles.run}>
          <div className={styles.runHead}>
            <VerdictBadge verdict={r.verdict} status={r.verdict ? undefined : r.status} />
            <span>{r.kind === 'SAMPLE' ? 'Sample run' : 'Submission'}</span>
            {r.testsTotal !== undefined && <span>{r.testsPassed}/{r.testsTotal} passed</span>}
            {r.maxTimeMs !== undefined && <span>{r.maxTimeMs} ms</span>}
            {r.maxMemoryKb !== undefined && <span>{mb(r.maxMemoryKb)}</span>}
            <time className={styles.muted} dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleTimeString()}</time>
          </div>
          {r.compileLog && <pre className={styles.inlineCode}>{r.compileLog}</pre>}
          {r.sampleResults && (
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
