'use client';

import { useEffect, useState } from 'react';

import { EVENT } from '../_public/event';
import styles from './hero.module.css';

const UNITS = [
  ['days', 86400],
  ['hours', 3600],
  ['minutes', 60],
  ['seconds', 1],
] as const;

/**
 * Four outlined tiles counting down to doors opening. The server renders dashes (no hydration mismatch); the exact
 * date is always given as text next to it. Under reduced motion the seconds tile is dropped and it updates per minute.
 */
export function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setCalm(reduce);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), reduce ? 30_000 : 1000);
    return () => clearInterval(id);
  }, []);

  if (now !== null && now >= EVENT.endsAt) return <p className={styles.countNote}>That&rsquo;s a wrap. Thanks for haunting.</p>;
  if (now !== null && now >= EVENT.startsAt) return <p className={styles.countNote}>Happening now at {EVENT.venue}.</p>;

  let left = now === null ? null : Math.floor((EVENT.startsAt - now) / 1000);
  const units = calm ? UNITS.slice(0, 3) : UNITS;
  return (
    <div className={styles.count} role="timer" aria-label="Time until doors open">
      {units.map(([label, size]) => {
        const value = left === null ? null : Math.floor(left / size);
        if (left !== null && value !== null) left -= value * size;
        return (
          <div key={label} className={styles.tile}>
            <span className={styles.tileValue} key={value ?? '-'}>
              {value === null ? '–' : value}
            </span>
            <span className={styles.tileLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
