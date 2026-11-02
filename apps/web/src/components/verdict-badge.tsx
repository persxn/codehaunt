import React from 'react';
import styles from './verdict-badge.module.css';
import { Spinner } from './icons';

export function VerdictBadge({
  verdict,
  status,
}: {
  verdict?: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'IE';
  status?: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED';
}) {
  let token = '--info';
  let label = '';
  let icon: React.ReactNode = null;

  if (verdict) {
    switch (verdict) {
      case 'AC':
        token = '--success';
        label = 'Accepted';
        break;
      case 'WA':
        token = '--danger';
        label = 'Wrong answer';
        break;
      case 'TLE':
        token = '--warning';
        label = 'Time limit exceeded';
        break;
      case 'MLE':
        token = '--warning';
        label = 'Memory limit exceeded';
        break;
      case 'OLE':
        token = '--warning';
        label = 'Output limit exceeded';
        break;
      case 'RE':
        token = '--danger';
        label = 'Runtime error';
        break;
      case 'CE':
        token = '--danger';
        label = 'Compile error';
        break;
      case 'IE':
        token = '--info';
        label = 'Judging problem, re-checking';
        break;
    }
  } else if (status) {
    switch (status) {
      case 'QUEUED':
        token = '--info';
        label = 'Queued';
        break;
      case 'RUNNING':
        token = '--info';
        label = 'Running';
        icon = <Spinner className={styles.spinner} />;
        break;
      case 'FAILED':
        token = '--info';
        label = 'Judging problem, re-checking';
        break;
    }
  }

  if (!label) return null;

  return (
    <span
      className={styles.badge}
      style={{ color: `var(${token})`, borderColor: `var(${token})` }}
    >
      {icon}
      {label}
    </span>
  );
}
