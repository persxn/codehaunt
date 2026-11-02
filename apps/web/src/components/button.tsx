import React from 'react';
import styles from './button.module.css';
import { Spinner } from './icons';

export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
}) {
  const isDisabled = disabled || busy;
  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={`${styles.button} ${styles[variant]} ${isDisabled ? styles.disabled : ''} ${className ?? ''}`}
    >
      {busy && <Spinner className={styles.spinner} />}
      {props.children}
    </button>
  );
}
