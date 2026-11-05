'use client';
/**
 * Modal dialog on the native <dialog> (focus trapped, Esc closes, background inert). Used for confirmations that
 * change or remove data (WP-11): the body explains what will happen; the confirm button is the only way through.
 */
import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from '@/components/button';

import s from './dialog.module.css';

export function Dialog({
  open, title, children, confirmLabel, tone = 'primary', busy = false, confirmDisabled = false, onConfirm, onClose, error,
}: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; busy?: boolean;
  confirmDisabled?: boolean; onConfirm: () => void; onClose: () => void; error?: string | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby="dialog-title" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        className={s.body}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled && !busy) onConfirm();
        }}
      >
        <h2 id="dialog-title" className={s.title}>{title}</h2>
        <div className={s.content}>{children}</div>
        {error && <p className={s.error} role="alert">{error}</p>}
        <div className={s.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={tone} busy={busy} disabled={confirmDisabled}>{confirmLabel}</Button>
        </div>
      </form>
    </dialog>
  );
}
