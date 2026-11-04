'use client';
/** Shared by the contest-ops pages (WP-05): polling, time formatting and the one "action + reason" form. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from './admin.module.css';

/** Loads now and every `ms` while mounted (5 s boards, ADR-028 risk note: no websockets). */
export function usePoll<T>(load: (() => Promise<T>) | null, ms = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    if (!loadRef.current) return;
    try {
      setData(await loadRef.current());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  }, []);
  useEffect(() => {
    setData(null);
    if (!load) return;
    void refresh();
    const t = setInterval(refresh, ms);
    return () => clearInterval(t);
    // Restart only when what is loaded changes (the caller memoises `load` per event/participant).
  }, [load, ms, refresh]);
  return { data, error, refresh };
}

/** h:mm:ss */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString() : '—');

export interface ActionChoice {
  value: string;
  label: string;
  /** Label of a number input this action needs (minutes, tokens, score). */
  number?: { label: string; min: number; max: number; initial: number };
  danger?: boolean;
}

/**
 * One form for every audited action: pick the action, give a number if it needs one, write the reason (required:
 * it goes to audit_log). `run` throws with the server's message on failure. `idempotencyKey` stays the same until a
 * submit succeeds, so retrying after an error (e.g. a lost response) can't apply a top-up or extend twice (R13-5).
 */
export function ActionForm({ id, choices, run, compact = false }: {
  id: string;
  choices: ActionChoice[];
  run: (action: string, reason: string, value: number | undefined, idempotencyKey: string) => Promise<unknown>;
  compact?: boolean;
}) {
  const [action, setAction] = useState(choices[0]?.value ?? '');
  const choice = choices.find((c) => c.value === action) ?? choices[0];
  const [value, setValue] = useState<number>(choice?.number?.initial ?? 0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const initial = choice?.number?.initial;
  useEffect(() => {
    if (initial !== undefined) setValue(initial);
  }, [action, initial]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    setBusy(true);
    setMessage(null);
    try {
      await run(choice.value, reason.trim(), choice.number ? value : undefined, key);
      setMessage({ ok: true, text: `${choice.label}: done.` });
      setReason('');
      setKey(crypto.randomUUID());
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Request failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (!choice) return null;
  return (
    <form className={styles.row} onSubmit={submit} aria-label={compact ? 'Actions' : undefined}>
      {choices.length > 1 && (
        // The choices as large buttons (WP-07 Part 2): one is picked, then the reason, then Apply. Same state as before.
        // Radio semantics (audit R17-2): one Tab stop (the picked choice), arrows / Home / End move and pick.
        <div
          role="radiogroup" aria-label="Action" className={`${styles.choices} ${compact ? styles.choicesCompact : ''}`}
          onKeyDown={(e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            const at = choices.findIndex((c) => c.value === action);
            const to = e.key === 'Home' ? 0 : e.key === 'End' ? choices.length - 1 : step === undefined ? -1 : (at + step + choices.length) % choices.length;
            if (to < 0) return;
            e.preventDefault();
            setAction(choices[to]!.value);
            (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[to])?.focus();
          }}
        >
          {choices.map((c) => (
            <button
              key={c.value} type="button" role="radio" aria-checked={c.value === action}
              tabIndex={c.value === action ? 0 : -1}
              className={styles.choice} data-danger={c.danger || undefined}
              onClick={() => setAction(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {choice.number && (
        <Field label={choice.number.label} id={`${id}-value`}>
          <input
            id={`${id}-value`} type="number" className={inputClass} required
            min={choice.number.min} max={choice.number.max} value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </Field>
      )}
      <Field label="Reason (audit log)" id={`${id}-reason`}>
        <input id={`${id}-reason`} className={inputClass} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Button type="submit" variant={choice.danger ? 'danger' : 'primary'} busy={busy}>{choices.length > 1 ? `Apply: ${choice.label.replace(/ \(.*\)$/, '')}` : choice.label}</Button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>{message.text}</p>}
    </form>
  );
}
