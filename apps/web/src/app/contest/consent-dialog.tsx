'use client';
/** Blocking consent at first sign-in (ADR-010). The reuse box is optional and unticked by default (R8-Q7). */
import { useEffect, useRef, useState } from 'react';

import type { ContestState } from '@codehaunt/contracts';

import { Button } from '@/components/button';

import { postJSON } from './api';
import styles from './contest.module.css';

export function ConsentDialog({ consent, onAccepted }: { consent: NonNullable<ContestState['consent']>; onAccepted: () => void }) {
  const [agree, setAgree] = useState(false);
  const [reuse, setReuse] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  // Keep Tab inside the dialog.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')];
    const first = items[0];
    const last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await postJSON('/api/contest/consent', { consent: true, reuseConsent: reuse, guardianConsent: guardian });
      onAccepted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const ready = agree && (!consent.guardianRequired || guardian);
  return (
    <div className={styles.backdrop}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="consent-title" onKeyDown={trap}>
        <h2 id="consent-title">Before you start</h2>
        <p className={styles.consentText}>{consent.text}</p>
        <label className={styles.check}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required /> I agree
        </label>
        {consent.guardianRequired && (
          <label className={styles.check}>
            <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} required /> My guardian has agreed
          </label>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={reuse} onChange={(e) => setReuse(e.target.checked)} /> You may reuse my anonymised
          transcripts as examples for future events (optional)
        </label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Button onClick={accept} disabled={!ready} busy={busy}>Accept</Button>
      </div>
    </div>
  );
}
