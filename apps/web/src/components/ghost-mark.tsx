import React from 'react';
import styles from './ghost-mark.module.css';

export function GhostMark({ size = 24, title }: { size?: number; title?: string }) {
  const svgProps = title ? { role: 'img' as const } : { 'aria-hidden': true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svgProps}
    >
      {title && <title>{title}</title>}
      {/* Rounded head, straight sides, three-wave hem */}
      <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
      <ellipse cx="9" cy="10" rx="1" ry="1.5" />
      <ellipse cx="15" cy="10" rx="1" ry="1.5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <GhostMark size={24} />
      <span className={styles.wordmarkText}>
        Code<span className={styles.brand}>Haunt</span>
      </span>
    </span>
  );
}
