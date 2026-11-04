'use client';
/**
 * The conversation with the tutor (ADR-033): turns, the live reply, context meter, new chat and the question box.
 * Questions are typed only (paste and drop blocked); replies can't be copied. The tutor never sees the code, and its
 * replies never change it. Replies arrive already filtered (long code removed on the server).
 */
import { useState } from 'react';

import type { ContestState, Workspace } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Send } from '@/components/icons';
import { Meter } from '@/components/meter';
import { GhostAvatar } from '@/components/ornaments';
import ornaments from '@/components/ornaments.module.css';

import { postJSON, streamPrompt } from './api';
import { noClipboard } from './code-editor';
import styles from './contest.module.css';
import { TutorThinking } from './tutor-thinking';

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
  // The tutor is told the language the participant is writing (the newest saved code's, else the first enabled).
  const language = workspace.codeVersions.at(-1)?.language ?? session?.language ?? state.languages[0] ?? 'cpp';
  const [prompt, setPrompt] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const newChat = async () => {
    if (!window.confirm('Start a new chat? The tutor forgets this conversation. Your code is not affected.')) return;
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
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setLive('');
    setSent(text);
    await streamPrompt({ problemId, ...(session ? { chatSessionId: session.id } : {}), prompt: text, idempotencyKey: crypto.randomUUID() }, (event) => {
      if (event.type === 'delta') setLive((s) => (s ?? '') + event.text);
      else if (event.type === 'error') setError(event.message);
      else setPrompt('');
    });
    await reload().catch(() => {});
    setLive(null);
    setBusy(false);
  };

  return (
    <section className={`${styles.pane} ${styles.chatPane} ${ornaments.cornered}`} aria-label="Ask the tutor">
      <div className={styles.paneHead}>
        <h2 className={styles.paneTitle}><GhostAvatar size={18} /> Tutor</h2>
        {session && (
          <div className={styles.headMeter}>
            <Meter
              compact
              label="Context"
              used={session.contextTokensUsed}
              total={session.contextTokensLimit}
              warnAtPercent={state.contextWarnPercent}
              warning="Context almost full: start a new chat (your code is not affected)."
            />
          </div>
        )}
        {session && workspace.turns.length > 0 && (
          <Button variant="secondary" className={styles.small} onClick={newChat} disabled={!canWork || busy}>New chat</Button>
        )}
      </div>
      <div className={styles.turnsScroll}>
        <p className={styles.tutorNote}>Ask about concepts and how to improve. The tutor never sees your code and won&apos;t write your solution.</p>
        <ol className={`${styles.turns} ${styles.noCopy}`} {...noClipboard}>
          {workspace.turns.map((t) => (
            <li key={t.id}>
              <div className={styles.mine}>{t.prompt}</div>
              <div className={styles.theirsRow}>
                <GhostAvatar />
                <div className={styles.theirs}>
                  {t.reply === null ? <em>No reply (not charged).</em> : <ModelText text={t.reply} />}
                </div>
              </div>
            </li>
          ))}
          {live !== null && (
            <li>
              <div className={styles.mine}>{sent}</div>
              <div className={styles.theirsRow}>
                <GhostAvatar />
                <div className={styles.theirs} aria-live="polite">{live ? <ModelText text={live} /> : <TutorThinking />}</div>
              </div>
            </li>
          )}
        </ol>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <form className={styles.promptBox} onSubmit={(e) => { e.preventDefault(); void sendPrompt(); }}>
        <label htmlFor="prompt" className="visually-hidden">Question for the tutor</label>
        <textarea
          id="prompt"
          value={prompt}
          maxLength={state.maxPromptChars}
          rows={3}
          placeholder="Ask the tutor a question… (Ctrl+Enter sends)"
          disabled={!canWork}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); void sendPrompt(); } }}
          {...noClipboard}
        />
        <div className={styles.promptFoot}>
          <p className={styles.muted}>{prompt.length} / {state.maxPromptChars} · typing only, paste is off</p>
          <Button type="submit" busy={busy} disabled={!canWork || !prompt.trim()}>
            <Send aria-hidden="true" /> Send
          </Button>
        </div>
      </form>
    </section>
  );
}
