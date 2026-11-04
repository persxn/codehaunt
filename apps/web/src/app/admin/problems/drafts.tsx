'use client';
/**
 * GPT-OSS drafts for one problem (WP-07 task 8, R8-Q6): edge-case tests and a naive solution, never shown to
 * participants. Approve adds a hidden test (or the naive solution); then calibrate, because the proposed output is the
 * model's guess. Model-written text: rendered as text only.
 */
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/button';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';

type Draft = {
  id: string; kind: 'TEST' | 'NAIVE'; status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  input: string | null; expectedOutput: string | null; language: string | null; source: string | null; note: string; model: string;
};

export function Drafts({ problemId, onApproved }: { problemId: string; onApproved: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setDrafts((await getJSON<{ drafts: Draft[] }>(`/api/admin/problems/${problemId}/drafts`)).drafts), [problemId]);
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [load]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    setError('');
    try {
      await postJSON(`/api/admin/problems/${problemId}/drafts/${id}`, { decision });
      await load();
      if (decision === 'approve') onApproved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const open = drafts.filter((d) => d.status === 'DRAFT');
  if (!drafts.length) return null;
  return (
    <section className={styles.card} aria-labelledby={`drafts-${problemId}`}>
      <h3 id={`drafts-${problemId}`}>GPT-OSS drafts ({open.length} to decide)</h3>
      <p className={styles.muted}>
        Approved tests become hidden tests with the model&apos;s proposed output. Calibrate afterwards: if the reference
        solution fails a new test, the proposed output was wrong.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ul className={styles.stack}>
        {drafts.map((d) => (
          <li key={d.id} className={d.status === 'DRAFT' ? undefined : styles.muted}>
            <strong>{d.kind === 'TEST' ? 'Test' : `Naive solution (${d.language})`}</strong> · {d.status.toLowerCase()} · {d.note}
            {d.kind === 'TEST' ? (
              <div className={styles.row}>
                <pre className={styles.pre}>{d.input}</pre>
                <pre className={styles.pre}>{d.expectedOutput}</pre>
              </div>
            ) : (
              <pre className={styles.pre}>{d.source}</pre>
            )}
            {d.status === 'DRAFT' && (
              <div className={styles.row}>
                <Button busy={busy === d.id} onClick={() => decide(d.id, 'approve')}>Approve</Button>
                <Button variant="secondary" disabled={busy === d.id} onClick={() => decide(d.id, 'reject')}>Reject</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
