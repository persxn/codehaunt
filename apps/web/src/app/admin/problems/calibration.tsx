'use client';
/** Runs every stored solution against every test and shows the results while they come in (ADR-005, ADR-018). */
import { useCallback, useEffect, useState } from 'react';

import type { Verdict } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { VerdictBadge } from '@/components/verdict-badge';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';

type Run = {
  id: string; language: string; kind: 'REFERENCE' | 'NAIVE'; status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; createdAt: string;
  verdict: Verdict | null; testsPassed: number | null; testsTotal: number | null; maxTimeMs: number | null; maxMemoryKb: number | null;
  compileLog: string | null; internalError: string | null;
};

function expectation(r: Run): string {
  if (r.status !== 'DONE' || !r.verdict) return '';
  if (r.kind === 'REFERENCE') return r.verdict === 'AC' ? 'as expected' : 'should be Accepted: check the tests or the limits';
  return r.verdict === 'TLE' || r.verdict === 'MLE' ? 'as expected' : 'should fail on time or memory: tighten the limits or add a bigger test';
}

export function Calibration({ problemId }: { problemId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => setRuns((await getJSON<{ runs: Run[] }>(`/api/admin/problems/${problemId}/calibrate`)).runs), [problemId]);
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING')) return;
    const t = setTimeout(() => load().catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [runs, load]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setRuns((await postJSON<{ runs: Run[] }>(`/api/admin/problems/${problemId}/calibrate`, {})).runs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.stack} aria-label="Calibration">
      <div className={styles.row}>
        <h3>Calibration</h3>
        <Button type="button" variant="secondary" busy={busy} onClick={start}>Calibrate (save first)</Button>
      </div>
      <p className={styles.muted}>Reference solutions should be Accepted; naive ones should hit the time or memory limit.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {runs.length > 0 && (
        <table className={styles.table} aria-live="polite">
          <thead><tr><th scope="col">Language</th><th scope="col">Kind</th><th scope="col">Result</th><th scope="col">Passed</th><th scope="col">Max time</th><th scope="col">Max memory</th><th scope="col">Note</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.language}</td>
                <td>{r.kind.toLowerCase()}</td>
                <td><VerdictBadge verdict={r.verdict ?? undefined} status={r.verdict ? undefined : r.status} /></td>
                <td>{r.testsTotal !== null ? `${r.testsPassed}/${r.testsTotal}` : '—'}</td>
                <td>{r.maxTimeMs !== null ? `${Math.round(r.maxTimeMs)} ms` : '—'}</td>
                <td>{r.maxMemoryKb !== null ? `${(r.maxMemoryKb / 1024).toFixed(1)} MB` : '—'}</td>
                <td>
                  {expectation(r)}
                  {(r.compileLog || r.internalError) && <pre className={styles.pre}>{r.compileLog || r.internalError}</pre>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
