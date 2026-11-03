'use client';
/** Repeatable input / expected-output pairs; hidden tests can also be loaded from a JSON file. */
import type { ProblemInput } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';

type Test = ProblemInput['visibleTests'][number];

export function TestList({ title, tests, onChange, max, allowFile }: {
  title: string; tests: Test[]; onChange: (tests: Test[]) => void; max: number; allowFile?: boolean;
}) {
  const id = title.split(' ')[0]!.toLowerCase();
  const update = (i: number, patch: Partial<Test>) => onChange(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((t) => t && typeof t.input === 'string' && typeof t.expectedOutput === 'string')) throw new Error();
      onChange((parsed as Test[]).slice(0, max).map(({ input, expectedOutput }) => ({ input, expectedOutput })));
    } catch {
      window.alert('The file must be a JSON array of {"input": "...", "expectedOutput": "..."}.');
    }
  };

  return (
    <fieldset className={styles.fieldset}>
      <legend>{title} · {tests.length}</legend>
      {tests.map((t, i) => (
        <div key={i} className={`${styles.wide} ${styles.row}`}>
          <Field label={`Input ${i + 1}`} id={`${id}-in-${i}`}>
            <textarea id={`${id}-in-${i}`} className={inputClass} rows={3} spellCheck={false} value={t.input} onChange={(e) => update(i, { input: e.target.value })} />
          </Field>
          <Field label={`Expected output ${i + 1}`} id={`${id}-out-${i}`}>
            <textarea id={`${id}-out-${i}`} className={inputClass} rows={3} spellCheck={false} value={t.expectedOutput} onChange={(e) => update(i, { expectedOutput: e.target.value })} />
          </Field>
          <Button type="button" variant="secondary" disabled={tests.length <= 1} onClick={() => onChange(tests.filter((_, j) => j !== i))}>Remove</Button>
        </div>
      ))}
      <div className={`${styles.wide} ${styles.row}`}>
        <Button type="button" variant="secondary" disabled={tests.length >= max} onClick={() => onChange([...tests, { input: '', expectedOutput: '' }])}>Add test</Button>
        {allowFile && (
          <Field label="Load from a JSON file" id={`${id}-file`}>
            <input id={`${id}-file`} type="file" accept="application/json,.json" onChange={(e) => void load(e.target.files?.[0])} />
          </Field>
        )}
      </div>
    </fieldset>
  );
}
