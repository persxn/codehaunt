import React from 'react';
import styles from './field.module.css';
import { Alert } from './icons';

export function Field({
  label,
  error,
  hint,
  children,
  id,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
      {error && (
        <p className={styles.error} role="alert">
          <Alert className={styles.errorIcon} />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = styles.input;
