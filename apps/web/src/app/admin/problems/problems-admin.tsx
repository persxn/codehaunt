'use client';
/** Problem list for the selected event, and the editor for one (new or existing). */
import { useCallback, useEffect, useState } from 'react';

import type { Difficulty, Language, SolutionKind } from '@codehaunt/contracts';

import { Button } from '@/components/button';

import styles from '../admin.module.css';
import { getJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { ProblemEditor } from './problem-editor';

type Summary = {
  id: string; slug: string; title: string; difficulty: Difficulty; ord: number; practice: boolean;
  visibleTests: number; hiddenTests: number; solutions: Array<{ language: Language; kind: SolutionKind }>;
};

export function ProblemsAdmin() {
  const eventId = useEventId();
  const [problems, setProblems] = useState<Summary[]>([]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      setProblems((await getJSON<{ problems: Summary[] }>(`/api/admin/events/${encodeURIComponent(eventId)}/problems`)).problems);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [eventId]);

  useEffect(() => { void load(); setEditing(null); setNotice(''); }, [load]);

  return (
    <div className={styles.stack}>
      <EventPicker admin />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {eventId && (
        <>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">#</th><th scope="col">Title</th><th scope="col">Difficulty</th><th scope="col">Tests (visible / hidden)</th><th scope="col">Solutions</th><th scope="col"><span className="visually-hidden">Edit</span></th></tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr key={p.id}>
                  <td>{p.practice ? 'Warm-up' : p.ord + 1}</td>
                  <td>{p.title} <span className={styles.muted}>{p.slug}</span></td>
                  <td>{p.difficulty.toLowerCase()}</td>
                  <td>{p.visibleTests} / {p.hiddenTests}</td>
                  <td>{p.solutions.map((s) => `${s.language} ${s.kind.toLowerCase()}`).join(', ') || '—'}</td>
                  <td><Button variant="secondary" onClick={() => { setNotice(''); setEditing(p.id); }}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div><Button onClick={() => { setNotice(''); setEditing('new'); }}>New problem</Button></div>
          {editing && (
            <ProblemEditor
              key={editing}
              eventId={eventId}
              problemId={editing === 'new' ? null : editing}
              nextOrd={problems.length}
              onSaved={async (id) => { await load(); setEditing(id); setNotice('Saved.'); }}
              onDeleted={async () => { await load(); setEditing(null); setNotice('Deleted.'); }}
            />
          )}
        </>
      )}
    </div>
  );
}
