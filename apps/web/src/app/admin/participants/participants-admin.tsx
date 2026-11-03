'use client';
/** Participant table, CSV import with preview, single-person form, and (admins) export / delete on request. */
import { useCallback, useEffect, useState } from 'react';

import type { ParticipantRow } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { deleteJSON, getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { participantsFromCsv, type ParsedRow } from './csv';

type Participant = {
  id: string; enrolmentNo: string; status: string; seatLabel: string | null; name: string; username: string;
  badgeIssued: boolean; checkedInAt: string | null; consented: boolean;
};
type ImportResult = { created: number; skipped: Array<{ enrolmentNo: string; reason: string }> };

export function ParticipantsAdmin({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const [list, setList] = useState<Participant[]>([]);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [one, setOne] = useState({ name: '', enrolmentNo: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setList((await getJSON<{ participants: Participant[] }>(`/api/staff/participants?eventId=${encodeURIComponent(eventId)}`)).participants);
  }, [eventId]);
  useEffect(() => { load().catch((e: Error) => setError(e.message)); }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    const parsed = participantsFromCsv(await file.text());
    setError(parsed.error ?? '');
    setPreview(parsed.error ? null : parsed.rows);
  };

  const send = async (rows: ParticipantRow[]) => {
    if (!eventId || !rows.length) return;
    setBusy(true);
    setError('');
    try {
      setResult(await postJSON<ImportResult>('/api/admin/participants/import', { eventId, rows }));
      setPreview(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addOne = async (e: React.FormEvent) => {
    e.preventDefault();
    const row: ParticipantRow = { name: one.name.trim(), enrolmentNo: one.enrolmentNo.trim(), ...(one.email ? { email: one.email.trim() } : {}), ...(one.phone ? { phone: one.phone.trim() } : {}) };
    await send([row]);
    setOne({ name: '', enrolmentNo: '', email: '', phone: '' });
  };

  const exportOne = async (p: Participant) => {
    try {
      const data = await getJSON<unknown>(`/api/admin/participants/${p.id}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `codehaunt-${p.enrolmentNo}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteOne = async (p: Participant) => {
    const reason = window.prompt(`Delete ${p.name}'s data? Their name, contact details, prompts and code are erased for good. Reason:`);
    if (!reason?.trim()) return;
    try {
      await deleteJSON(`/api/admin/participants/${p.id}`, { reason: reason.trim() });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const valid = preview?.filter((r) => r.row).map((r) => r.row!) ?? [];
  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {eventId && (
        <>
          <div className={`${styles.card} ${styles.stack}`}>
            <h2>Import</h2>
            <Field label="CSV file (columns: name, enrolment, email, phone)" id="csv">
              <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => void upload(e.target.files?.[0])} />
            </Field>
            {preview && (
              <>
                <table className={styles.table}>
                  <thead><tr><th scope="col">Line</th><th scope="col">Name</th><th scope="col">Enrolment</th><th scope="col">Email</th><th scope="col">Problem</th></tr></thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r.line}><td>{r.line}</td><td>{r.row?.name ?? '—'}</td><td>{r.row?.enrolmentNo ?? '—'}</td><td>{r.row?.email ?? ''}</td><td className={styles.error}>{r.error ?? ''}</td></tr>
                    ))}
                  </tbody>
                </table>
                <Button busy={busy} disabled={!valid.length} onClick={() => send(valid)}>Import {valid.length} rows</Button>
              </>
            )}
            <form className={styles.row} onSubmit={addOne} aria-label="Add one participant">
              <Field label="Name" id="one-name"><input id="one-name" className={inputClass} value={one.name} required onChange={(e) => setOne({ ...one, name: e.target.value })} /></Field>
              <Field label="Enrolment number" id="one-enr"><input id="one-enr" className={inputClass} value={one.enrolmentNo} required pattern="[A-Za-z0-9/_\-]{1,40}" onChange={(e) => setOne({ ...one, enrolmentNo: e.target.value })} /></Field>
              <Field label="Email (optional)" id="one-email"><input id="one-email" type="email" className={inputClass} value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} /></Field>
              <Field label="Phone (optional)" id="one-phone"><input id="one-phone" className={inputClass} value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} /></Field>
              <Button type="submit" busy={busy}>Add</Button>
            </form>
            {result && (
              <p role="status" className={styles.success}>
                Added {result.created}.{result.skipped.length ? ` Skipped ${result.skipped.length}: ${result.skipped.map((s) => `${s.enrolmentNo} (${s.reason})`).join(', ')}.` : ''}
              </p>
            )}
          </div>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Name</th><th scope="col">Enrolment</th><th scope="col">Status</th><th scope="col">Seat</th><th scope="col">Badge</th><th scope="col">Checked in</th><th scope="col">Consent</th>{admin && <th scope="col">Data</th>}</tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td><td>{p.enrolmentNo}</td><td>{p.status.toLowerCase().replace('_', ' ')}</td><td>{p.seatLabel ?? ''}</td>
                  <td>{p.badgeIssued ? 'issued' : '—'}</td><td>{p.checkedInAt ? new Date(p.checkedInAt).toLocaleTimeString() : '—'}</td><td>{p.consented ? 'yes' : '—'}</td>
                  {admin && (
                    <td className={styles.row}>
                      <Button variant="secondary" onClick={() => exportOne(p)}>Export</Button>
                      <Button variant="danger" onClick={() => deleteOne(p)}>Delete…</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
