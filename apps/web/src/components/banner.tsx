import React from 'react';
import styles from './banner.module.css';

export function Banner({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'muted' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={`${styles.banner} ${styles[tone]}`}>
      {children}
    </div>
  );
}
