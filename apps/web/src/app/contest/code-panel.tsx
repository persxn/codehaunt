'use client';
/**
 * The participant's code (ADR-033): the editor, saving, version history with restore, and run/submit. The draft is
 * saved when it changed, every 20 s, when the tab is hidden, and before every run or submit (which run the saved
 * version). Runs are polled until they finish.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContestState, Language, RunView, Workspace } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { History, Play, Send } from '@/components/icons';

import { getJSON, postJSON } from './api';
import { CodeEditor } from './code-editor';
import styles from './contest.module.css';
import { RunsPanel } from './runs-panel';

const ACTIVE = new Set(['QUEUED', 'RUNNING']);
const AUTOSAVE_MS = 20_000;
export const LABELS: Record<Language, string> = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python 3' };

export function CodePanel({ problemId, state, workspace, canWork, reload }: {
  problemId: string;
  state: ContestState;
  workspace: Workspace;
  canWork: boolean;
  reload: () => Promise<void>;
}) {
  const versions = workspace.codeVersions;
  const current = versions.find((v) => v.id === workspace.currentCodeVersionId);

  const [source, setSource] = useState(current?.source ?? '');
  const [language, setLanguage] = useState<Language>(current?.language ?? workspace.session?.language ?? state.languages[0] ?? 'cpp');
  const [viewing, setViewing] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunView[]>(workspace.runs);
  const [busy, setBusy] = useState<'SAMPLE' | 'SUBMIT' | 'revert' | null>(null);
  const [saved, setSaved] = useState<{ at: Date | null; error: string }>({ at: null, error: '' });
  const [error, setError] = useState('');

  // What the server holds; a newer version that we didn't save (a restore, another tab) replaces the draft.
  const savedRef = useRef<{ id: string | null; source: string; language: Language }>({
    id: current?.id ?? null, source: current?.source ?? '', language: current?.language ?? language,
  });
  const draft = useRef({ source, language });
  draft.current = { source, language };

  useEffect(() => {
    if (!current || current.id === savedRef.current.id) return;
    savedRef.current = { id: current.id, source: current.source, language: current.language };
    setSource(current.source);
    setLanguage(current.language);
    setViewing(null);
  }, [current]);

  useEffect(() => setRuns(workspace.runs), [workspace.runs]);

  /** Saves the draft if it differs from the server's copy; returns the id of the version that matches the draft. */
  const save = useCallback(async (): Promise<string | null> => {
    const { source: s, language: l } = draft.current;
    if (savedRef.current.id && s === savedRef.current.source && l === savedRef.current.language) return savedRef.current.id;
    if (!s.trim()) return null;
    try {
      const { id } = await postJSON<{ id: string }>('/api/contest/code', { problemId, language: l, source: s });
      savedRef.current = { id, source: s, language: l };
      setSaved({ at: new Date(), error: '' });
      return id;
    } catch (e) {
      setSaved((old) => ({ ...old, error: (e as Error).message }));
      return null;
    }
  }, [problemId]);

  useEffect(() => {
    if (!canWork) return;
    const timer = setInterval(() => void save(), AUTOSAVE_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') void save(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      void save();
    };
  }, [save, canWork]);

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

  const run = async (kind: 'SAMPLE' | 'SUBMIT') => {
    if (kind === 'SUBMIT' && !window.confirm('Submit to the hidden tests? Each wrong submission costs 20% of this problem\'s value.')) return;
    setBusy(kind);
    setError('');
    try {
      const codeVersionId = await save();
      if (!codeVersionId) throw new Error('Your code could not be saved, so it was not run. Try again.');
      const created = await postJSON<RunView>('/api/contest/runs', { problemId, codeVersionId, kind, idempotencyKey: crypto.randomUUID() });
      setRuns((all) => [created, ...all.filter((r) => r.submissionId !== created.submissionId)]);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const restore = async (codeVersionId: string) => {
    setBusy('revert');
    setError('');
    try {
      await save();
      await postJSON('/api/contest/revert', { problemId, codeVersionId });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const older = versions.find((v) => v.id === viewing && v.id !== current?.id);
  const dirty = source !== savedRef.current.source || language !== savedRef.current.language;

  return (
    <section className={styles.pane} aria-label="Your code and runs">
      <div className={styles.sessionBar}>
        <label className={styles.inline}>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} disabled={!canWork || !!older}>
            {state.languages.map((l) => <option key={l} value={l}>{LABELS[l]}</option>)}
          </select>
        </label>
        <p className={styles.muted} aria-live="polite">
          {saved.error ? `Not saved: ${saved.error}` : dirty ? 'Unsaved changes' : saved.at ? `Saved ${saved.at.toLocaleTimeString()}` : ''}
        </p>
      </div>
      {older ? (
        <>
          <p className={styles.muted}>Older version v{versions.indexOf(older) + 1} (read-only)</p>
          <CodeEditor value={older.source} language={older.language} onChange={() => {}} readOnly label={`Code version ${versions.indexOf(older) + 1}, read-only`} />
          <div className={styles.actions}>
            <Button variant="secondary" busy={busy === 'revert'} disabled={!canWork} onClick={() => restore(older.id)}>Restore this version</Button>
            <Button variant="secondary" onClick={() => setViewing(null)}>Back to my code</Button>
          </div>
        </>
      ) : (
        <CodeEditor value={source} language={language} onChange={setSource} readOnly={!canWork} label={`Your ${LABELS[language]} code`} />
      )}
      <div className={styles.actions}>
        <Button variant="secondary" busy={busy === 'SAMPLE'} disabled={!canWork || !!older || !source.trim()} onClick={() => run('SAMPLE')}>
          <Play aria-hidden="true" /> Run samples
        </Button>
        <Button busy={busy === 'SUBMIT'} disabled={!canWork || !!older || !source.trim()} onClick={() => run('SUBMIT')}>
          <Send aria-hidden="true" /> Submit
        </Button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {versions.length > 1 && (
        <details className={styles.history}>
          <summary><History aria-hidden="true" /> Saved versions ({versions.length})</summary>
          <ol reversed>
            {[...versions].reverse().map((v) => {
              const n = versions.indexOf(v) + 1;
              return (
                <li key={v.id}>
                  <button type="button" className={styles.linkButton} aria-current={v.id === (older ?? current)?.id} onClick={() => setViewing(v.id)}>
                    v{n} · {new Date(v.createdAt).toLocaleTimeString()} · {LABELS[v.language]}
                    {v.id === current?.id ? ' (current)' : ''}
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
