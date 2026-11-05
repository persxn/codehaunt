'use client';
import { useState, type FormEvent } from 'react';
import type { ApiError, Me } from '@codehaunt/contracts';
import { Field, inputClass } from '@/components/field';
import { Button } from '@/components/button';
import { LockIcon } from '../_public/icons';
import styles from './page.module.css';
import { SebHandoff } from './seb-handoff';

/** Staff land on /admin, participants on /contest. */
function homeFor(user: Me): string {
  // Still on the event's default password: choose your own first (ADR-041).
  if (user.mustChangePassword) return '/account?first=1';
  // Volunteers may open only check-in and the desk (ADR-013).
  return user.role === 'PARTICIPANT' ? '/contest' : user.role === 'VOLUNTEER' ? '/admin/checkin' : '/admin';
}

/** The sign-in panel body: the form, or the SEB handoff after a `seb_required` refusal (ADR-039). */
export function SignIn() {
  const [handoff, setHandoff] = useState(false);
  if (handoff) return <SebHandoff onBack={() => setHandoff(false)} />;
  return (
    <>
      <h1 className={`${styles.title} sig-glitch`}>Sign in</h1>
      <p className={styles.intro}>Use the username and password from your registration.</p>
      <LoginForm onSebRequired={() => setHandoff(true)} />
      <ul className={styles.notes}>
        <li>
          <LockIcon />
          <span>
            <strong>Participants</strong> sign in inside Safe Exam Browser. Signing in from another browser offers to
            open it for you.
          </span>
        </li>
        <li>
          <LockIcon />
          <span>
            <strong>Organisers and volunteers</strong> can use any browser.
          </span>
        </li>
      </ul>
    </>
  );
}

function LoginForm({ onSebRequired }: { onSebRequired: () => void }) {
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
      if (body?.error.code === 'seb_required') return onSebRequired();
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
