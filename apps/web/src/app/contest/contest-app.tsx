'use client';
/**
 * The participant contest screen (WP-03): top bar (time, tokens, banner), problem list + statement, chat, code + runs.
 * State is polled every 5 s; the clock ticks locally between polls.
 */
import { useCallback, useEffect, useState } from 'react';

import type { ContestState, ParticipantProblem, ProblemSummary, Workspace } from '@codehaunt/contracts';

import { Banner } from '@/components/banner';
import { Wordmark } from '@/components/ghost-mark';
import { Check } from '@/components/icons';
import { Meter } from '@/components/meter';

import { getJSON } from './api';
import { ChatPanel } from './chat-panel';
import { CodePanel } from './code-panel';
import { ConsentDialog } from './consent-dialog';
import styles from './contest.module.css';

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ContestApp() {
  const [state, setState] = useState<ContestState | null>(null);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [statement, setStatement] = useState<ParticipantProblem | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [msLeft, setMsLeft] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'statement' | 'chat'>('chat');

  const loadState = useCallback(async () => {
    try {
      const s = await getJSON<ContestState>('/api/contest/state');
      setState(s);
      setMsLeft(s.event.msLeft);
      if (!s.consent) setProblems((await getJSON<{ problems: ProblemSummary[] }>('/api/contest/problems')).problems);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!selected) return;
    setWorkspace(await getJSON<Workspace>(`/api/contest/problems/${selected}/workspace`));
  }, [selected]);

  useEffect(() => {
    void loadState();
    const poll = setInterval(loadState, 5000);
    const tick = setInterval(() => setMsLeft((m) => Math.max(0, m - 1000)), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [loadState]);

  useEffect(() => {
    if (!selected) return;
    setStatement(null);
    setWorkspace(null);
    getJSON<ParticipantProblem>(`/api/contest/problems/${selected}`).then(setStatement).catch((e: Error) => setError(e.message));
    loadWorkspace().catch((e: Error) => setError(e.message));
  }, [selected, loadWorkspace]);

  // A problem that closed (warm-up at the start) drops out of the list: deselect it.
  useEffect(() => {
    if (selected && problems.length && !problems.some((p) => p.id === selected)) setSelected(null);
  }, [problems, selected]);

  if (!state) return <main className={styles.loading}>{error || 'Loading…'}</main>;

  const phase = state.event.phase;
  const problem = problems.find((p) => p.id === selected);
  const canWork = !!problem && (problem.practice ? phase === 'not_started' : phase === 'running');
  const reload = async () => { await Promise.all([loadWorkspace(), loadState()]); };

  return (
    <div className={styles.app}>
      {state.consent && <ConsentDialog consent={state.consent} onAccepted={loadState} />}
      <header className={styles.topBar}>
        <Wordmark />
        <span className={styles.eventName}>{state.event.name}</span>
        <span className={styles.timer} aria-label="Time left">{phase === 'running' || phase === 'paused' ? clock(msLeft) : '—'}</span>
        <a href="/account" className={styles.accountLink}>Account</a>
        <div className={styles.tokenMeter}>
          <Meter label="Tokens" used={state.tokens.total - state.tokens.remaining} total={Math.max(1, state.tokens.total)} warnAtPercent={90} />
        </div>
      </header>
      {phase === 'not_started' && (
        <Banner tone="info">
          The contest has not started yet.{problems.some((p) => p.practice) ? ' The warm-up problem is open: its tokens don’t count.' : ''}
        </Banner>
      )}
      {phase === 'paused' && <Banner tone="warning">Paused by the organizers.</Banner>}
      {phase === 'ended' && <Banner tone="muted">The contest has ended. Your work is saved.</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <div className={styles.columns}>
        <section className={`${styles.pane} ${tab === 'statement' ? styles.tabActive : styles.tabInactive}`} aria-label="Problems">
          <nav aria-label="Problem list">
            <ul className={styles.problemList}>
              {problems.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-current={p.id === selected} className={styles.problemButton} onClick={() => { setSelected(p.id); setTab('statement'); }}>
                    <span>{p.practice ? 'Warm-up' : `${p.ord + 1}.`} {p.title}</span>
                    <span className={styles.muted}>{p.difficulty.toLowerCase()}</span>
                    {p.solved && <span className={styles.solved}><Check aria-hidden="true" /> Solved</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {statement && (
            <article className={styles.statement}>
              <h2>{statement.title}</h2>
              <p className={styles.muted}>Time limit {statement.timeLimitMs} ms · memory {statement.memoryLimitMb} MB</p>
              <div className={styles.statementText}>{statement.statement}</div>
              {statement.visibleTests.map((t, i) => (
                <div key={i} className={styles.sample}>
                  <h3 className={styles.subhead}>Sample {i + 1}</h3>
                  <pre className={styles.inlineCode}>{t.input}</pre>
                  <pre className={styles.inlineCode}>{t.expectedOutput}</pre>
                </div>
              ))}
            </article>
          )}
        </section>

        <div className={styles.tabs} role="tablist" aria-label="Statement or chat">
          <button role="tab" aria-selected={tab === 'statement'} onClick={() => setTab('statement')}>Statement</button>
          <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
        </div>

        {selected && workspace ? (
          <>
            <div className={tab === 'chat' ? styles.tabActive : styles.tabInactive}>
              <ChatPanel key={selected} problemId={selected} state={state} workspace={workspace} canWork={canWork} reload={reload} />
            </div>
            <CodePanel problemId={selected} workspace={workspace} canWork={canWork} reload={reload} />
          </>
        ) : (
          <p className={styles.placeholder}>{problems.length ? 'Pick a problem to start.' : 'No problems are open right now.'}</p>
        )}
      </div>
    </div>
  );
}
