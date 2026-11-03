'use client';
/** Projector board: rank, name, solved (total once final). Polls every 5 s; the clock ticks locally in between. */
import { useEffect, useState } from 'react';

import type { ProjectorView } from '@codehaunt/contracts';
import { Wordmark } from '@/components/ghost-mark';

import styles from './projector.module.css';

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const PHASE: Record<ProjectorView['phase'], string> = { not_started: 'Starting soon', running: 'Live', paused: 'Paused', ended: 'Finished' };

export function Projector({ token }: { token: string }) {
  const [view, setView] = useState<ProjectorView | null>(null);
  const [msLeft, setMsLeft] = useState(0);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/projector/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const v = (await r.json()) as ProjectorView;
        setView(v);
        setMsLeft(v.msLeft);
        setLost(false);
      } catch {
        setLost(true);
      }
    };
    void load();
    const poll = setInterval(load, 5000);
    return () => clearInterval(poll);
  }, [token]);

  useEffect(() => {
    if (view?.phase !== 'running') return;
    const t = setInterval(() => setMsLeft((m) => Math.max(0, m - 1000)), 1000);
    return () => clearInterval(t);
  }, [view]);

  if (!view) return <main className={styles.screen}><p className={styles.note}>{lost ? 'This link does not work. Ask an organizer for a new one.' : 'Loading…'}</p></main>;
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Wordmark />
        <h1 className={styles.title}>{view.title}</h1>
        <div className={styles.clock}>
          <span className={styles.phase}>{view.final ? 'Final results' : PHASE[view.phase]}</span>
          {(view.phase === 'running' || view.phase === 'paused') && <span>{clock(msLeft)}</span>}
        </div>
      </header>
      {view.frozen && <p className={styles.frozen}>Board frozen: changes after the freeze appear with the results.</p>}
      {lost && <p className={styles.note}>Reconnecting…</p>}
      <table className={styles.board}>
        <thead><tr><th>#</th><th>Name</th><th>Solved</th>{view.final && <th>Score</th>}</tr></thead>
        <tbody>
          {view.rows.map((r, i) => (
            <tr key={`${r.rank}-${i}`}>
              <td className={styles.rank}>{r.rank}</td>
              <td>{r.name}</td>
              <td>{r.solved} / {view.problems}</td>
              {view.final && <td>{r.total?.toFixed(2)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
