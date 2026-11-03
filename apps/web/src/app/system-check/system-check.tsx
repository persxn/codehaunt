'use client';
/** Runs the participant's pre-event checks in the browser; only talks to this server's /healthz. */
import { useState } from 'react';

import { Button } from '@/components/button';
import { Alert, Check, X } from '@/components/icons';

import styles from './system-check.module.css';

type Level = 'pass' | 'warn' | 'fail';
type Result = { name: string; level: Level; detail: string };

const ICON = { pass: Check, warn: Alert, fail: X };
const WORD = { pass: 'OK', warn: 'Check', fail: 'Problem' };

async function connection(): Promise<Result> {
  const times: number[] = [];
  try {
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const response = await fetch('/healthz', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      times.push(performance.now() - t0);
    }
  } catch {
    return { name: 'Connection', level: 'fail', detail: 'Could not reach the CodeHaunt server. Check your internet connection.' };
  }
  times.sort((a, b) => a - b);
  const median = Math.round(times[5]!);
  const worst = Math.round(times[9]!);
  const level: Level = median < 300 ? 'pass' : median < 1000 ? 'warn' : 'fail';
  return { name: 'Connection', level, detail: `Median ${median} ms, worst ${worst} ms.${level === 'pass' ? '' : ' Try a stronger network (or move closer to the hotspot).'}` };
}

function browser(): Result {
  return navigator.userAgent.includes('SEB')
    ? { name: 'Browser', level: 'pass', detail: 'Safe Exam Browser detected.' }
    : { name: 'Browser', level: 'warn', detail: 'Not in Safe Exam Browser. On event day you must open CodeHaunt from the .seb file the organizers send.' };
}

function screen(): Result {
  const { innerWidth: w, innerHeight: h } = window;
  return w >= 1280 && h >= 700
    ? { name: 'Screen', level: 'pass', detail: `${w} × ${h}.` }
    : { name: 'Screen', level: 'warn', detail: `${w} × ${h}. The contest screen needs at least 1280 × 700; it also works from 1024 wide with the statement in a tab.` };
}

export function SystemCheck() {
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResults([browser(), screen()]);
    const conn = await connection();
    setResults([browser(), conn, screen(), { name: 'Time', level: 'pass', detail: `Your clock says ${new Date().toLocaleTimeString()}. Times on the contest screen come from the server.` }]);
    setBusy(false);
  };

  return (
    <div className={styles.check}>
      <Button onClick={run} busy={busy} className={styles.full}>Run check</Button>
      <ul className={styles.results} aria-live="polite">
        {results.map((r) => {
          const Icon = ICON[r.level];
          return (
            <li key={r.name} className={styles[r.level]}>
              <Icon aria-hidden="true" className={styles.icon} />
              <div>
                <strong>{r.name}: {WORD[r.level]}</strong>
                <p className={styles.detail}>{r.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
