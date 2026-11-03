'use client';
/** The conversation with the model: turns, the live reply, context meter, session controls and the prompt box. */
import { useState } from 'react';

import type { ContestState, Language, Workspace } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Send } from '@/components/icons';
import { Meter } from '@/components/meter';

import { postJSON, streamPrompt } from './api';
import styles from './contest.module.css';

const LABELS: Record<Language, string> = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python 3' };

/** Model text as plain text, with fenced blocks shown as code. Never HTML. */
export function ModelText({ text }: { text: string }) {
  const parts = text.split(/^(?:```|~~~)[^\n]*$/m);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <pre key={i} className={styles.inlineCode}>{part.replace(/^\n|\n$/g, '')}</pre> : part.trim() && <p key={i} className={styles.prose}>{part.trim()}</p>,
      )}
    </>
  );
}

export function ChatPanel({ problemId, state, workspace, canWork, reload }: {
  problemId: string;
  state: ContestState;
  workspace: Workspace;
  canWork: boolean;
  reload: () => Promise<void>;
}) {
  const session = workspace.session;
  const turnsWithCode = new Set(workspace.codeVersions.map((v) => v.turnId));
  const [language, setLanguage] = useState<Language>(session?.language ?? state.languages[0] ?? 'cpp');
  const [prompt, setPrompt] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const startSession = async (confirmFirst: boolean) => {
    if (confirmFirst && !window.confirm('Start a new session? The model forgets this conversation; your code carries over.')) return;
    setError('');
    try {
      await postJSON('/api/contest/sessions', { problemId, language });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text || busy || !session) return;
    setBusy(true);
    setError('');
    setLive('');
    setSent(text);
    await streamPrompt({ problemId, chatSessionId: session.id, prompt: text, idempotencyKey: crypto.randomUUID() }, (event) => {
      if (event.type === 'delta') setLive((s) => (s ?? '') + event.text);
      else if (event.type === 'error') setError(event.message);
      else setPrompt('');
    });
    await reload().catch(() => {});
    setLive(null);
    setBusy(false);
  };

  return (
    <section className={styles.pane} aria-label="Chat with the model">
      <div className={styles.sessionBar}>
        <label className={styles.inline}>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} disabled={!canWork || busy}>
            {state.languages.map((l) => <option key={l} value={l}>{LABELS[l]}</option>)}
          </select>
        </label>
        {session ? (
          <Button variant="secondary" onClick={() => startSession(true)} disabled={!canWork || busy}>New session</Button>
        ) : (
          <Button onClick={() => startSession(false)} disabled={!canWork}>Start</Button>
        )}
      </div>
      {session && (
        <Meter
          label="Context"
          used={session.contextTokensUsed}
          total={session.contextTokensLimit}
          warnAtPercent={state.contextWarnPercent}
          warning="Context almost full: start a new session to carry your code over."
        />
      )}
      <ol className={styles.turns}>
        {workspace.turns.map((t) => (
          <li key={t.id}>
            <div className={styles.mine}>{t.prompt}</div>
            <div className={styles.theirs}>
              {t.reply === null ? <em>No reply (not charged).</em> : <ModelText text={t.reply} />}
              {t.reply !== null && session && !turnsWithCode.has(t.id) && (
                <p className={styles.muted}>No {LABELS[session.language]} code block in this reply: the code is unchanged.</p>
              )}
            </div>
          </li>
        ))}
        {live !== null && (
          <li>
            <div className={styles.mine}>{sent}</div>
            <div className={styles.theirs} aria-live="polite">{live ? <ModelText text={live} /> : <em>Thinking…</em>}</div>
          </li>
        )}
      </ol>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {session && (
        <form className={styles.promptBox} onSubmit={(e) => { e.preventDefault(); void sendPrompt(); }}>
          <label htmlFor="prompt">Instruction to the model</label>
          <textarea
            id="prompt"
            value={prompt}
            maxLength={4000}
            rows={4}
            disabled={!canWork}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void sendPrompt(); } }}
          />
          <Button type="submit" busy={busy} disabled={!canWork || !prompt.trim()}>
            <Send aria-hidden="true" /> Send
          </Button>
        </form>
      )}
    </section>
  );
}
