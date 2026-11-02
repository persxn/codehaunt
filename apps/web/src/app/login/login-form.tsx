'use client';
import { useState, type FormEvent } from 'react';
import type { ApiError, Me } from '@codehaunt/contracts';
import { Field, inputClass } from '@/components/field';
import { Button } from '@/components/button';
import styles from './page.module.css';

/** Staff land on /admin, participants on /contest. */
function homeFor(user: Me): string {
  return user.role === 'PARTICIPANT' ? '/contest' : '/admin';
}

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    }).catch(() => null);
    setBusy(false);
    if (!response) return setError('Network error. Try again.');
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiError | null;
      return setError(body?.error.message ?? 'Sign-in failed.');
    }
    window.location.assign(homeFor((await response.json()) as Me));
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <Field label="Username" id="username">
        <input id="username" className={inputClass} name="username" autoComplete="username" required maxLength={64} />
      </Field>
      <Field label="Password" id="password">
        <input id="password" className={inputClass} name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </Field>
      <Button type="submit" variant="primary" busy={busy} className={styles.full}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </form>
  );
}
