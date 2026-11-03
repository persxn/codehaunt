'use client';
/** Current code, version history with revert, and the run/submit buttons. Runs are polled until they finish. */
import { useEffect, useState } from 'react';

import type { RunView, Workspace } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { History, Play, Send } from '@/components/icons';

import { getJSON, postJSON } from './api';
import { CodeView } from './code-view';
import styles from './contest.module.css';
import { RunsPanel } from './runs-panel';

const ACTIVE = new Set(['QUEUED', 'RUNNING']);

export function CodePanel({ problemId, workspace, canWork, reload }: {
  problemId: string;
  workspace: Workspace;
  canWork: boolean;
  reload: () => Promise<void>;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunView[]>(workspace.runs);
  const [busy, setBusy] = useState<'SAMPLE' | 'SUBMIT' | 'revert' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => setRuns(workspace.runs), [workspace.runs]);
  useEffect(() => setViewing(null), [problemId, workspace.currentCodeVersionId]);

  // Poll unfinished runs once a second.
  useEffect(() => {
    const pending = runs.filter((r) => ACTIVE.has(r.status));
    if (!pending.length) return;
    const timer = setTimeout(async () => {
      const fresh = await Promise.all(pending.map((r) => getJSON<RunView>(`/api/contest/runs/${r.submissionId}`).catch(() => r)));
      setRuns((all) => all.map((r) => fresh.find((f) => f.submissionId === r.submissionId) ?? r));
    }, 1000);
    return () => clearTimeout(timer);
  }, [runs]);

  const versions = workspace.codeVersions;
  const current = versions.find((v) => v.id === workspace.currentCodeVersionId);
  const shown = versions.find((v) => v.id === viewing) ?? current;

  const run = async (kind: 'SAMPLE' | 'SUBMIT') => {
    if (!current) return;
    if (kind === 'SUBMIT' && !window.confirm('Submit to the hidden tests? A wrong answer costs a small penalty.')) return;
    setBusy(kind);
    setError('');
    try {
      const created = await postJSON<RunView>('/api/contest/runs', { problemId, codeVersionId: current.id, kind, idempotencyKey: crypto.randomUUID() });
      setRuns((all) => [created, ...all.filter((r) => r.submissionId !== created.submissionId)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revert = async (codeVersionId: string) => {
    setBusy('revert');
    setError('');
    try {
      await postJSON('/api/contest/revert', { problemId, codeVersionId });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.pane} aria-label="Code and runs">
      {shown ? (
        <>
          <p className={styles.muted}>
            {shown.id === current?.id ? 'Current code' : `Older version v${versions.indexOf(shown) + 1} (read-only)`}
          </p>
          <CodeView source={shown.source} language={shown.language} />
          {shown.id !== current?.id && (
            <Button variant="secondary" busy={busy === 'revert'} disabled={!canWork} onClick={() => revert(shown.id)}>
              Revert to this version
            </Button>
          )}
        </>
      ) : (
        <p className={styles.muted}>No code yet. Ask the model to write some.</p>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" busy={busy === 'SAMPLE'} disabled={!canWork || !current} onClick={() => run('SAMPLE')}>
          <Play aria-hidden="true" /> Run samples
        </Button>
        <Button busy={busy === 'SUBMIT'} disabled={!canWork || !current} onClick={() => run('SUBMIT')}>
          <Send aria-hidden="true" /> Submit
        </Button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {versions.length > 1 && (
        <details className={styles.history}>
          <summary><History aria-hidden="true" /> Versions ({versions.length})</summary>
          <ol reversed>
            {[...versions].reverse().map((v) => {
              const n = versions.indexOf(v) + 1;
              return (
                <li key={v.id}>
                  <button type="button" className={styles.linkButton} aria-current={v.id === shown?.id} onClick={() => setViewing(v.id)}>
                    v{n} · {new Date(v.createdAt).toLocaleTimeString()} · {v.language}
                    {v.id === current?.id ? ' (current)' : ''}{v.turnId === null ? ' (revert)' : ''}
                  </button>
                </li>
              );
            })}
          </ol>
        </details>
      )}
      <h3 className={styles.subhead}>Runs</h3>
      <RunsPanel runs={runs} />
    </section>
  );
}
