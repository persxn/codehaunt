'use client';
/** Change your own password; the server checks strength and explains a refusal in plain language. */
import { useState } from 'react';

import type { ApiError } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from './account.module.css';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone('');
    if (next !== repeat) {
      setError('The two new passwords are different.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiError | null;
        setError(body?.error.message ?? 'Network problem, try again.');
        return;
      }
      setDone('Password changed. Your other sessions were signed out.');
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch {
      setError('Network problem, try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Current password" id="current">
        <input id="current" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label="New password" id="new" hint="At least 12 characters. A few unrelated words work well. It must not contain your username.">
        <input id="new" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label="Repeat new password" id="repeat" error={error || undefined}>
        <input id="repeat" type="password" autoComplete="new-password" className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
      </Field>
      {done && <p role="status" className={styles.success}>{done}</p>}
      <Button type="submit" busy={busy} className={styles.full}>Change password</Button>
    </form>
  );
}
