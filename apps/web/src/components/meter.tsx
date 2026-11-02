import React from 'react';
import styles from './meter.module.css';

export function Meter({
  label,
  used,
  total,
  warnAtPercent,
  unit = 'tokens',
  warning,
}: {
  label: string;
  used: number;
  total: number;
  warnAtPercent?: number;
  unit?: string;
  warning?: string;
}) {
  const percent = Math.min(100, (used / total) * 100);
  let token = '--info';
  if (percent >= 100) token = '--danger';
  else if (warnAtPercent && percent >= warnAtPercent) token = '--warning';

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>{label}</div>
      <div className={styles.numbers}>
        {used.toLocaleString('en-IN')} / {total.toLocaleString('en-IN')} {unit}
      </div>
      <div
        className={styles.barContainer}
        role="meter"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className={styles.bar}
          style={{ width: `${percent}%`, backgroundColor: `var(${token})` }}
        ></div>
      </div>
      {warning && token === '--warning' && (
        <p className={styles.warning}>{warning}</p>
      )}
    </div>
  );
}
