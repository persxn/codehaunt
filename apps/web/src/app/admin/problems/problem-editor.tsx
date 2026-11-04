'use client';
/**
 * One problem as a single form (the server replaces it as a whole). Hidden tests can be typed or loaded from a JSON
 * file. Calibrate runs every stored solution against every test: REFERENCE should be AC, NAIVE should fail on time/memory.
 */
import { useEffect, useState } from 'react';

import type { Language, ProblemInput, SolutionKind } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { deleteJSON, getJSON, postJSON, putJSON } from '../api';
import { Calibration } from './calibration';
import { Drafts } from './drafts';
import { TestList } from './test-list';

type Form = Omit<ProblemInput, 'solutions'> & { solutions: Record<string, string> };
const LANGS: Array<[Language, string]> = [['c', 'C'], ['cpp', 'C++'], ['java', 'Java'], ['python', 'Python 3']];
const KINDS: SolutionKind[] = ['REFERENCE', 'NAIVE'];

const empty = (ord: number): Form => ({
  slug: '', title: '', statement: '', difficulty: 'EASY', ord, timeLimitMs: 2000, memoryLimitMb: 256,
  checker: { kind: 'caseInsensitive' }, practice: false, solutions: {},
  visibleTests: [{ input: '', expectedOutput: '' }], hiddenTests: [{ input: '', expectedOutput: '' }],
});

function toForm(p: ProblemInput): Form {
  return { ...p, solutions: Object.fromEntries(p.solutions.map((s) => [`${s.language}:${s.kind}`, s.source])) };
}

function toInput(f: Form): ProblemInput {
  const solutions = Object.entries(f.solutions)
    .filter(([, source]) => source.trim())
    .map(([key, source]) => {
      const [language, kind] = key.split(':') as [Language, SolutionKind];
      return { language, kind, source };
    });
  return { ...f, solutions };
}

export function ProblemEditor({ eventId, problemId, nextOrd, onSaved, onDeleted }: {
  eventId: string; problemId: string | null; nextOrd: number;
  onSaved: (id: string) => Promise<void>; onDeleted: () => Promise<void>;
}) {
  const [form, setForm] = useState<Form | null>(problemId ? null : empty(nextOrd));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped when a draft is approved on the server: the form reloads, so saving it can't drop the new hidden test.
  const [version, setVersion] = useState(0);
  // The form as last loaded or saved; drafts can't be approved while the form differs from it (audit R14-7).
  const [loaded, setLoaded] = useState('');

  useEffect(() => {
    if (problemId) getJSON<ProblemInput>(`/api/admin/problems/${problemId}`).then((p) => {
      const next = toForm(p);
      setForm(next);
      setLoaded(JSON.stringify(next));
    }).catch((e: Error) => setMessage({ ok: false, text: e.message }));
  }, [problemId, version]);

  if (!form) return <p className={styles.muted}>{message?.text ?? 'Loading…'}</p>;
  const patch = (p: Partial<Form>) => setForm({ ...form, ...p });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = toInput(form);
      const { id } = problemId
        ? await putJSON<{ id: string }>(`/api/admin/problems/${problemId}`, body)
        : await postJSON<{ id: string }>(`/api/admin/events/${encodeURIComponent(eventId)}/problems`, body);
      setLoaded(JSON.stringify(form));
      await onSaved(id);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!problemId || !window.confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    try {
      await deleteJSON(`/api/admin/problems/${problemId}`);
      await onDeleted();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  };

  return (
    <form className={`${styles.card} ${styles.stack}`} onSubmit={save} aria-label={problemId ? `Edit ${form.title}` : 'New problem'}>
      <h2>{problemId ? form.title : 'New problem'}</h2>
      <div className={styles.fieldset}>
        <Field label="Short name (a-z, 0-9, -)" id="p-slug"><input id="p-slug" className={inputClass} value={form.slug} pattern="[a-z0-9-]{1,40}" required onChange={(e) => patch({ slug: e.target.value })} /></Field>
        <Field label="Title" id="p-title"><input id="p-title" className={inputClass} value={form.title} required onChange={(e) => patch({ title: e.target.value })} /></Field>
        <Field label="Difficulty" id="p-diff">
          <select id="p-diff" className={inputClass} value={form.difficulty} onChange={(e) => patch({ difficulty: e.target.value as Form['difficulty'] })}>
            <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
          </select>
        </Field>
        <Field label="Order" id="p-ord"><input id="p-ord" type="number" min={0} className={inputClass} value={form.ord} onChange={(e) => patch({ ord: Number(e.target.value) })} /></Field>
        <Field label="Time limit (ms, C/C++; others × multiplier)" id="p-time"><input id="p-time" type="number" min={100} max={10000} className={inputClass} value={form.timeLimitMs} onChange={(e) => patch({ timeLimitMs: Number(e.target.value) })} /></Field>
        <Field label="Memory limit (MB)" id="p-mem"><input id="p-mem" type="number" min={16} max={1024} className={inputClass} value={form.memoryLimitMb} onChange={(e) => patch({ memoryLimitMb: Number(e.target.value) })} /></Field>
        <Field label="Output checker" id="p-checker">
          <select id="p-checker" className={inputClass} value={form.checker.kind} onChange={(e) => patch({ checker: { kind: e.target.value as Form['checker']['kind'], ...(e.target.value === 'float' ? { tolerance: form.checker.tolerance ?? 1e-6 } : {}) } })}>
            <option value="caseInsensitive">Tokens, case-insensitive</option><option value="strictWhitespace">Exact (whitespace matters)</option><option value="float">Numbers with tolerance</option>
          </select>
        </Field>
        {form.checker.kind === 'float' && (
          <Field label="Tolerance" id="p-tol"><input id="p-tol" type="number" step="any" className={inputClass} value={form.checker.tolerance ?? 1e-6} onChange={(e) => patch({ checker: { kind: 'float', tolerance: Number(e.target.value) } })} /></Field>
        )}
        <label className={styles.check}><input type="checkbox" checked={form.practice} onChange={(e) => patch({ practice: e.target.checked })} /> Warm-up problem (open before the start; doesn’t count)</label>
      </div>
      <Field label="Statement (Markdown source; participants see it as plain text)" id="p-statement">
        <textarea id="p-statement" className={inputClass} rows={8} value={form.statement} required onChange={(e) => patch({ statement: e.target.value })} />
      </Field>
      <TestList title="Visible tests (shown to participants; used by sample runs)" tests={form.visibleTests} onChange={(visibleTests) => patch({ visibleTests })} max={20} />
      <TestList title="Hidden tests (judging only; never shown)" tests={form.hiddenTests} onChange={(hiddenTests) => patch({ hiddenTests })} max={200} allowFile />
      <fieldset className={styles.fieldset}>
        <legend>Solutions (organizer-only)</legend>
        {LANGS.flatMap(([l, label]) => KINDS.map((k) => {
          const key = `${l}:${k}`;
          const id = `sol-${l}-${k}`;
          return (
            <div key={key} className={styles.wide}>
              <Field label={`${label} · ${k === 'REFERENCE' ? 'reference (must pass)' : 'naive (should fail on time or memory)'}`} id={id}>
                <textarea id={id} className={inputClass} rows={4} spellCheck={false} value={form.solutions[key] ?? ''} onChange={(e) => patch({ solutions: { ...form.solutions, [key]: e.target.value } })} />
              </Field>
            </div>
          );
        }))}
      </fieldset>
      <div className={styles.row}>
        <Button type="submit" busy={busy}>Save problem</Button>
        {problemId && <Button type="button" variant="danger" onClick={remove}>Delete</Button>}
        {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>{message.text}</p>}
      </div>
      {problemId && <Drafts problemId={problemId} dirty={JSON.stringify(form) !== loaded} onApproved={() => setVersion((v) => v + 1)} />}
      {problemId && <Calibration problemId={problemId} />}
    </form>
  );
}
