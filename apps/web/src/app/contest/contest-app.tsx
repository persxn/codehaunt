'use client';
/**
 * The participant contest screen (WP-03): top bar (time, tokens, banner), problem list + statement, chat, code + runs.
 * State is polled every 5 s; the clock ticks locally between polls.
 */
import { useCallback, useEffect, useState } from 'react';

import type { ContestState, ParticipantProblem, ProblemSummary, Workspace } from '@codehaunt/contracts';

import { Banner } from '@/components/banner';
import { Wordmark } from '@/components/ghost-mark';
import { Check, Clock } from '@/components/icons';
import ornaments from '@/components/ornaments.module.css';

import hood from '../_public/hood.webp';
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
        <div className={styles.timer} data-low={phase === 'running' && msLeft < 10 * 60_000 ? '' : undefined}>
          <Clock aria-hidden="true" />
          <span className={styles.timerValue} aria-label="Time left">{phase === 'running' || phase === 'paused' ? clock(msLeft) : '—'}</span>
          <span className={styles.timerLabel}>{phase === 'paused' ? 'paused' : 'left'}</span>
        </div>
        <div className={styles.tokenMeter}>
          <Meter compact label="Tokens" used={state.tokens.total - state.tokens.remaining} total={Math.max(1, state.tokens.total)} warnAtPercent={90} />
        </div>
        <a href="/account" className={styles.accountLink}>Account</a>
      </header>
      {phase === 'not_started' && (
        <Banner tone="info">
          The contest has not started yet.{problems.some((p) => p.practice) ? ' The warm-up problem is open: its tokens don’t count.' : ''}
        </Banner>
      )}
      {phase === 'paused' && <Banner tone="warning">Paused by the organizers.</Banner>}
      {phase === 'ended' && <Banner tone="muted" art="times-up">Time&apos;s up: the contest has ended. Your work is saved.</Banner>}
      {phase === 'running' && state.tokens.remaining <= 0 && (
        <Banner tone="warning" art="budget-out">Your token budget is used up. You can still write code, run samples and submit.</Banner>
      )}
      {error && <Banner tone="danger" art="connection-lost">{error}</Banner>}

      <div className={styles.columns}>
        <section className={`${styles.pane} ${ornaments.cornered} ${tab === 'statement' ? styles.tabActive : styles.tabInactive}`} aria-label="Problems">
          <h2 className={styles.paneTitle}>
            Problems <span className={styles.paneCount}>{problems.filter((p) => p.solved).length} / {problems.length} solved</span>
          </h2>
          <nav aria-label="Problem list">
            <ul className={styles.problemList}>
              {problems.map((p) => (
                <li key={p.id}>
                  <button type="button" aria-current={p.id === selected} className={styles.problemButton} onClick={() => { setSelected(p.id); setTab('statement'); }}>
                    <span className={styles.problemNo} aria-hidden="true">{p.practice ? 'W' : p.ord + 1}</span>
                    <span className={styles.problemTitle}>{p.practice ? 'Warm-up: ' : ''}{p.title}</span>
                    <span className={styles.difficulty} data-level={p.difficulty.toLowerCase()}>{p.difficulty.toLowerCase()}</span>
                    {p.solved && <span className={styles.solved}><Check aria-hidden="true" /> Solved</span>}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {statement && (
            <article className={styles.statement} key={statement.id}>
              <h3 className={styles.statementTitle}>{statement.title}</h3>
              <p className={styles.limits}>
                <span>Time {statement.timeLimitMs} ms</span><span>Memory {statement.memoryLimitMb} MB</span>
              </p>
              <div className={styles.statementText}>{statement.statement}</div>
              {statement.visibleTests.map((t, i) => (
                <figure key={i} className={styles.sample}>
                  <figcaption className={styles.sampleTitle}>Sample {i + 1}</figcaption>
                  <div className={styles.sampleGrid}>
                    <span className={styles.ioLabel}>Input</span>
                    <span className={styles.ioLabel}>Output</span>
                    <pre className={styles.inlineCode}>{t.input}</pre>
                    <pre className={styles.inlineCode}>{t.expectedOutput}</pre>
                  </div>
                </figure>
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
            <CodePanel key={selected} problemId={selected} state={state} workspace={workspace} canWork={canWork} reload={reload} />
          </>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.placeholderArch}><img src={hood.src} alt="" width={180} height={180} /></div>
            <p className={styles.placeholderTitle}>{problems.length ? 'Pick a problem to start' : 'No problems are open right now'}</p>
            <p className={styles.muted}>{problems.length ? 'The statement opens on the left, the tutor in the middle and your editor on the right.' : 'They appear here when the organizers open them.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
