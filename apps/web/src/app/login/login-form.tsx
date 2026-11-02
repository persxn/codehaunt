'use client';

import { useState, type FormEvent } from 'react';

import type { ApiError, Me } from '@codehaunt/contracts';

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
    <form onSubmit={onSubmit}>
      <label>
        Username
        <input name="username" autoComplete="username" required maxLength={64} />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
