'use client';
/**
 * Strict CSV import (ADR-044), shared by the Participants page and setup step 05: template → upload (drop or pick) →
 * the browser checks the file's shape → the server's dry run checks every row (duplicates, accounts, formats) →
 * preview with each problem on its line and column → confirm → all rows or none. Fix the file and upload again.
 */
import { useRef, useState } from 'react';

import type { ApiError, ImportIssue } from '@codehaunt/contracts';

import { Button } from '@/components/button';

import styles from '../admin.module.css';
import { participantsFromCsv, TEMPLATE, type CsvRow, type RowIssue } from './csv';
import s from './import.module.css';

type PreviewRow = { line: number | null; enrolmentNo: string; name: string; email: string | null; status: 'REGISTERED' | 'WAITLISTED'; existingAccount: boolean };
type Result = { dryRun: boolean; ok: boolean; created: number; rows: PreviewRow[]; issues: ImportIssue[] };
type Phase = { kind: 'idle' } | { kind: 'checking'; file: string } | { kind: 'error'; file: string; message: string }
  | { kind: 'preview'; file: string; rows: CsvRow[]; result: Result; issues: Issue[]; blank: number }
  | { kind: 'importing'; file: string } | { kind: 'done'; file: string; created: number; waitlisted: number };
type Issue = { line: number | null; column: string | null; message: string };

async function post(body: unknown): Promise<{ status: number; data: Result | null; message: string }> {
  try {
    const r = await fetch('/api/admin/participants/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await r.json().catch(() => null)) as (Result & Partial<ApiError>) | null;
    if (r.ok || r.status === 409) return { status: r.status, data: json, message: '' };
    return { status: r.status, data: null, message: json?.error?.message ?? `Request failed (${r.status}).` };
  } catch {
    return { status: 0, data: null, message: 'Network problem, try again.' };
  }
}

/** Client and server issues on one list, one entry per line and column. */
function merge(a: RowIssue[], b: ImportIssue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const i of [...a, ...b]) {
    const key = `${i.line}:${i.column}:${i.message}`;
    if (!seen.has(key)) { seen.add(key); out.push({ line: i.line, column: i.column, message: i.message }); }
  }
  return out.sort((x, y) => (x.line ?? 0) - (y.line ?? 0));
}

export function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'codehaunt-participants-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ParticipantImport({ eventId, onImported }: { eventId: string; onImported?: (created: number) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = async (file: File | undefined) => {
    if (!file) return;
    setPhase({ kind: 'checking', file: file.name });
    const parsed = participantsFromCsv(await file.text(), file.size);
    if (parsed.error) return setPhase({ kind: 'error', file: file.name, message: parsed.error });
    const sendable = parsed.rows;
    if (!sendable.length) return setPhase({ kind: 'preview', file: file.name, rows: [], result: { dryRun: true, ok: false, created: 0, rows: [], issues: [] }, issues: merge(parsed.issues, []), blank: parsed.blankLines });
    const res = await post({ eventId, dryRun: true, rows: sendable });
    if (!res.data) return setPhase({ kind: 'error', file: file.name, message: res.message });
    setPhase({ kind: 'preview', file: file.name, rows: sendable, result: res.data, issues: merge(parsed.issues, res.data.issues), blank: parsed.blankLines });
  };

  const commit = async () => {
    if (phase.kind !== 'preview') return;
    const { file, rows } = phase;
    setPhase({ kind: 'importing', file });
    const res = await post({ eventId, rows });
    if (res.status === 409 && res.data) {
      // Something changed since the preview (e.g. another admin imported the same people): nothing was written.
      return setPhase({ kind: 'preview', file, rows, result: res.data, issues: merge([], res.data.issues), blank: 0 });
    }
    if (!res.data) return setPhase({ kind: 'error', file, message: res.message });
    setPhase({ kind: 'done', file, created: res.data.created, waitlisted: res.data.rows.filter((r) => r.status === 'WAITLISTED').length });
    onImported?.(res.data.created);
  };

  const reset = () => {
    setPhase({ kind: 'idle' });
    if (input.current) input.current.value = '';
  };

  return (
    <div className={s.wrap}>
      <div className={s.format}>
        <div>
          <p className={s.formatTitle}>CSV format</p>
          <p className={styles.muted}>
            First row: <code>enrolment,name,email,phone</code>. Enrolment and name are required; email and phone may be empty.
            The enrolment number becomes the username. Up to 1,000 rows, 1 MB. Save from Excel as “CSV UTF-8”.
          </p>
        </div>
        <Button variant="secondary" onClick={downloadTemplate}>Download template</Button>
      </div>

      <label
        className={s.drop}
        data-over={over || undefined}
        data-state={phase.kind}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void check(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(e) => void check(e.target.files?.[0])} />
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={s.dropIcon}>
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4" />
        </svg>
        <span className={s.dropText}>
          {phase.kind === 'idle' && <>Drop the CSV here or <u>choose a file</u></>}
          {phase.kind === 'checking' && <>Checking <b>{phase.file}</b>…</>}
          {phase.kind === 'importing' && <>Importing <b>{phase.file}</b>…</>}
          {(phase.kind === 'preview' || phase.kind === 'error' || phase.kind === 'done') && <><b>{phase.file}</b> · drop another file or <u>choose again</u></>}
        </span>
        {(phase.kind === 'checking' || phase.kind === 'importing') && <span className={s.scan} aria-hidden="true" />}
      </label>

      <div aria-live="polite">
        {phase.kind === 'error' && (
          <div className={s.fileError} role="alert">
            <b>This file can’t be imported.</b> {phase.message}
          </div>
        )}

        {phase.kind === 'preview' && (
          <div className={`${s.preview} sig-step`}>
            <div className={s.summary}>
              <span className={s.count} data-tone="ok">{phase.result.rows.length} ready</span>
              <span className={s.count} data-tone={phase.issues.length ? 'bad' : 'ok'}>{phase.issues.length} to fix</span>
              {phase.result.rows.some((r) => r.status === 'WAITLISTED') && (
                <span className={s.count} data-tone="warn">{phase.result.rows.filter((r) => r.status === 'WAITLISTED').length} will be waitlisted (check-in cap)</span>
              )}
              {phase.blank > 0 && <span className={styles.muted}>{phase.blank} blank lines ignored</span>}
            </div>

            {phase.issues.length > 0 && (
              <section className={s.issues} aria-labelledby="issues-title">
                <h3 id="issues-title">Fix these in the file, then upload it again. Nothing has been imported.</h3>
                <ul>
                  {phase.issues.map((i, k) => (
                    <li key={k}>
                      <span className={s.where}>{i.line ? `Line ${i.line}` : 'Row'}{i.column ? ` · ${i.column}` : ''}</span>
                      <span>{i.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {phase.result.rows.length > 0 && (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <caption className="visually-hidden">Participants ready to import</caption>
                  <thead><tr><th scope="col">Line</th><th scope="col">Enrolment</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Will be</th></tr></thead>
                  <tbody>
                    {phase.result.rows.slice(0, 200).map((r) => (
                      <tr key={`${r.line}-${r.enrolmentNo}`}>
                        <td>{r.line ?? ''}</td><td>{r.enrolmentNo}</td><td>{r.name}</td><td>{r.email ?? ''}</td>
                        <td>{r.status === 'WAITLISTED' ? 'waitlisted' : 'registered'}{r.existingAccount ? ' · existing account' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {phase.result.rows.length > 200 && <p className={styles.muted}>…and {phase.result.rows.length - 200} more.</p>}
              </div>
            )}

            <div className={styles.row}>
              <Button onClick={() => void commit()} disabled={phase.issues.length > 0 || phase.result.rows.length === 0}>
                Import {phase.result.rows.length} {phase.result.rows.length === 1 ? "participant" : "participants"}
              </Button>
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              {phase.issues.length > 0 && <span className={styles.muted}>All rows must be valid: one bad row stops the whole import.</span>}
            </div>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className={`${s.done} sig-step`} role="status">
            <svg className={`${s.check} sig-check`} viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path pathLength={1} d="M4 12.5 9.5 18 20 6.5" />
            </svg>
            <div>
              <b>{phase.created} {phase.created === 1 ? "participant" : "participants"} imported.</b>
              {phase.waitlisted > 0 && <> {phase.waitlisted} are on the waitlist (over the check-in cap).</>}
              <div className={styles.muted}>Next: issue badges, or set the event password in step 06.</div>
            </div>
            <Button variant="secondary" onClick={reset}>Import another file</Button>
          </div>
        )}
      </div>
    </div>
  );
}
