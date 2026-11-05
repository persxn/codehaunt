'use client';
/**
 * Participants (WP-11, ADR-041/044): strict CSV import, add one person, search and filter, and per person: end their
 * sessions, reset their password (new one or the event default), export and remove (admins). Every change asks for
 * confirmation in a dialog that says exactly what will happen; existing passwords are never shown.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ApiError, ImportIssue } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';
import { StateArt } from '@/components/state-art/state-art';

import styles from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { Dialog } from '../dialog';
import { EventPicker, useEventId } from '../event-picker';
import { ParticipantImport } from './participant-import';
import s from './participants.module.css';

type Participant = {
  id: string; userId: string; enrolmentNo: string; status: string; seatLabel: string | null; name: string; username: string;
  active: boolean; signedIn: boolean; mustChangePassword: boolean; badgeIssued: boolean; checkedInAt: string | null; consented: boolean;
};
type Action =
  | { kind: 'end'; p: Participant }
  | { kind: 'reset'; p: Participant }
  | { kind: 'delete'; p: Participant };

const STATUSES = ['ALL', 'REGISTERED', 'WAITLISTED', 'CHECKED_IN', 'DISQUALIFIED'] as const;
const label = (s: string) => s.toLowerCase().replace('_', ' ');

async function send(method: string, url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null; message: string }> {
  try {
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await r.json().catch(() => null)) as (Record<string, unknown> & Partial<ApiError>) | null;
    return { ok: r.ok, data: json, message: r.ok ? '' : json?.error?.message ?? `Request failed (${r.status}).` };
  } catch {
    return { ok: false, data: null, message: 'Network problem, try again.' };
  }
}

export function ParticipantsAdmin({ admin }: { admin: boolean }) {
  const eventId = useEventId();
  const [list, setList] = useState<Participant[] | null>(null);
  const [hasDefault, setHasDefault] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL');
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const data = await getJSON<{ participants: Participant[]; eventDefaultPassword: boolean }>(`/api/staff/participants?eventId=${encodeURIComponent(eventId)}`);
    setList(data.participants);
    setHasDefault(data.eventDefaultPassword);
    // An empty event opens the import panel; it stays open after the first import or add.
    if (data.participants.length === 0) setShowImport(true);
  }, [eventId]);
  useEffect(() => {
    setList(null);
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((p) => (status === 'ALL' || p.status === status)
      && (!q || p.name.toLowerCase().includes(q) || p.enrolmentNo.toLowerCase().includes(q) || (p.seatLabel ?? '').toLowerCase().includes(q)));
  }, [list, query, status]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((st) => [st, (list ?? []).filter((p) => st === 'ALL' || p.status === st).length])), [list]);

  if (!eventId) {
    return (
      <div className={styles.stack}>
        <EventPicker admin={admin} />
        <p className={styles.muted}>Choose an event to see and import its participants.</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <EventPicker admin={admin} />
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <section className={`${styles.card} ${styles.stack}`} aria-labelledby="import-title">
        <div className={s.sectionHead}>
          <h2 id="import-title" style={{ margin: 0 }}>Import</h2>
          <Button variant="secondary" onClick={() => setShowImport((v) => !v)} aria-expanded={showImport}>
            {showImport ? 'Hide' : list && list.length ? 'Import more' : 'Import a CSV'}
          </Button>
        </div>
        {showImport && (
          <>
            <ParticipantImport eventId={eventId} onImported={() => void load()} />
            <AddOne eventId={eventId} onAdded={() => void load()} />
          </>
        )}
      </section>

      {list === null ? (
        <div className="sig-skeleton" style={{ height: 160 }} aria-busy="true" aria-label="Loading participants" />
      ) : list.length === 0 ? (
        <section className={s.empty}>
          <StateArt kind="checked-in" size={110} />
          <h2>No participants yet</h2>
          <p>Download the template, fill in one row per person and upload it above. You see every problem before anything is saved.</p>
        </section>
      ) : (
        <section className={styles.stack} aria-labelledby="list-title">
          <h2 id="list-title" className="visually-hidden">Participant list</h2>
          <div className={s.toolbar}>
            <Field label="Search name, enrolment or seat" id="p-search">
              <input id="p-search" type="search" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <div className={s.filters} role="radiogroup" aria-label="Filter by status">
              {STATUSES.map((st) => (
                <button key={st} type="button" role="radio" aria-checked={status === st} className={s.filter} onClick={() => setStatus(st)}>
                  {st === 'ALL' ? 'All' : label(st)} <span className={s.filterCount}>{counts[st]}</span>
                </button>
              ))}
            </div>
          </div>
          <Table rows={shown} admin={admin} hasDefault={hasDefault} eventId={eventId} onChanged={(text) => { setNotice(text); void load(); }} />
          {shown.length === 0 && <p className={styles.muted}>Nobody matches this search.</p>}
        </section>
      )}
    </div>
  );
}

function AddOne({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [one, setOne] = useState({ name: '', enrolmentNo: '', email: '', phone: '' });
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setIssues([]);
    setMessage('');
    const row = { name: one.name, enrolmentNo: one.enrolmentNo, ...(one.email.trim() ? { email: one.email } : {}), ...(one.phone.trim() ? { phone: one.phone } : {}) };
    const res = await send('POST', '/api/admin/participants/import', { eventId, rows: [row] });
    setBusy(false);
    const data = res.data as { issues?: ImportIssue[]; created?: number } | null;
    if (data?.issues?.length) return setIssues(data.issues);
    if (!res.ok) return setMessage(res.message);
    setOne({ name: '', enrolmentNo: '', email: '', phone: '' });
    setMessage(`Added 1 participant: ${one.name.trim()}.`);
    onAdded();
  };
  return (
    <form className={s.addOne} onSubmit={submit} aria-label="Add one participant">
      <p className={s.addTitle}>Or add one person</p>
      <div className={styles.row}>
        <Field label="Name" id="one-name"><input id="one-name" className={inputClass} value={one.name} required maxLength={120} onChange={(e) => setOne({ ...one, name: e.target.value })} /></Field>
        <Field label="Enrolment number" id="one-enr"><input id="one-enr" className={inputClass} value={one.enrolmentNo} required pattern="[A-Za-z0-9/_\-]{1,40}" onChange={(e) => setOne({ ...one, enrolmentNo: e.target.value })} /></Field>
        <Field label="Email (optional)" id="one-email"><input id="one-email" type="email" className={inputClass} value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} /></Field>
        <Field label="Phone (optional)" id="one-phone"><input id="one-phone" className={inputClass} value={one.phone} pattern="[0-9+ \-]{6,20}" onChange={(e) => setOne({ ...one, phone: e.target.value })} /></Field>
        <Button type="submit" busy={busy}>Add</Button>
      </div>
      {issues.map((i, k) => <p key={k} className={styles.error} role="alert">{i.column ? `${i.column}: ` : ''}{i.message}</p>)}
      {message && <p className={issues.length ? styles.error : styles.success} role="status">{message}</p>}
    </form>
  );
}

function Table({ rows, admin, hasDefault, eventId, onChanged }: {
  rows: Participant[]; admin: boolean; hasDefault: boolean; eventId: string; onChanged: (text: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'default' | 'new'>('default');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (a: Action) => {
    setAction(a);
    setReason('');
    setPw('');
    setMode(hasDefault ? 'default' : 'new');
    setError('');
  };
  const close = () => setAction(null);

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    setError('');
    const { p } = action;
    let res: Awaited<ReturnType<typeof send>>;
    if (action.kind === 'end') res = await send('POST', `/api/admin/ops/participants/${p.id}/action`, { action: 'end_session', reason });
    else if (action.kind === 'reset') {
      res = await send('POST', `/api/admin/users/${p.userId}/password`, mode === 'default' ? { eventDefault: true, eventId } : { newPassword: pw });
    } else res = await send('DELETE', `/api/admin/participants/${p.id}`, { reason });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    close();
    if (action.kind === 'end') onChanged(`${p.name} was signed out everywhere.`);
    else if (action.kind === 'reset') onChanged(mode === 'default' ? `${p.name} is back on the event password and must choose a new one.` : `${p.name}'s password was changed; they were signed out.`);
    else onChanged((res.data as { mode?: string } | null)?.mode === 'deleted' ? `${p.name} was deleted.` : `${p.name}'s data was anonymised (they had contest activity).`);
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

  return (
    <>
      <div className={styles.scroll}>
        <table className={`${styles.table} ${s.responsive}`}>
          <thead>
            <tr>
              <th scope="col">Name</th><th scope="col">Enrolment</th><th scope="col">Status</th><th scope="col">Seat</th>
              <th scope="col">Sign-in</th><th scope="col">Badge</th><th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td data-label="Name" className={s.nameCell}>{p.name}</td>
                <td data-label="Enrolment" className={s.mono}>{p.enrolmentNo}</td>
                <td data-label="Status"><span className={s.status} data-status={p.status}>{label(p.status)}</span></td>
                <td data-label="Seat">{p.seatLabel ?? '—'}</td>
                <td data-label="Sign-in">
                  {p.signedIn ? <span className={s.live}><span className={s.dot} aria-hidden="true" />signed in</span> : <span className={styles.muted}>—</span>}
                  {p.mustChangePassword && <span className={s.flag} title="Still on the event password">event password</span>}
                </td>
                <td data-label="Badge">{p.checkedInAt ? `in ${new Date(p.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : p.badgeIssued ? 'issued' : '—'}</td>
                <td className={s.actionsCell}>
                  <div className={s.actions}>
                    <Button variant="secondary" disabled={!p.signedIn} onClick={() => open({ kind: 'end', p })} title={p.signedIn ? undefined : 'No live session'}>End sessions</Button>
                    <Button variant="secondary" onClick={() => open({ kind: 'reset', p })}>Reset password</Button>
                    {admin && <Button variant="secondary" onClick={() => void exportOne(p)}>Export</Button>}
                    {admin && <Button variant="danger" onClick={() => open({ kind: 'delete', p })}>Delete</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={action?.kind === 'end'}
        title={`End ${action?.p.name ?? ''}'s sessions?`}
        confirmLabel="End sessions"
        tone="danger"
        busy={busy}
        error={error}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        <p>They are signed out at once, on every device; any request they send afterwards is refused. They can sign in again with their password.</p>
        <Field label="Reason (kept in the audit log)" id="end-reason"><input id="end-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required /></Field>
      </Dialog>

      <Dialog
        open={action?.kind === 'reset'}
        title={`Reset ${action?.p.name ?? ''}'s password`}
        confirmLabel="Reset password"
        busy={busy}
        error={error}
        confirmDisabled={mode === 'new' && pw.length < 12}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        <p>Their current password is never shown. Resetting signs them out everywhere.</p>
        <div className={s.choice} role="radiogroup" aria-label="New password">
          <label><input type="radio" name="reset-mode" checked={mode === 'default'} disabled={!hasDefault} onChange={() => setMode('default')} /> Back to the event password (they choose their own at the next sign-in){hasDefault ? '' : ' — this event has none'}</label>
          <label><input type="radio" name="reset-mode" checked={mode === 'new'} onChange={() => setMode('new')} /> A new password I give them</label>
        </div>
        {mode === 'new' && (
          <Field label="New password" id="reset-pw" hint="At least 12 characters; a few unrelated words work well. Tell it to them in person.">
            <input id="reset-pw" type="text" autoComplete="off" spellCheck={false} className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={200} />
          </Field>
        )}
      </Dialog>

      <Dialog
        open={action?.kind === 'delete'}
        title={`Delete ${action?.p.name ?? ''}?`}
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        error={error}
        confirmDisabled={!reason.trim()}
        onConfirm={() => void confirm()}
        onClose={close}
      >
        <p>If they have no contest activity yet, they are <b>deleted</b> (and their account, unless they belong to another event).</p>
        <p>If they already asked the tutor, ran code or got tokens, their name, contact details, questions and code are <b>erased</b> instead and the anonymous ledger rows stay, so scores and budgets remain consistent.</p>
        <p>This cannot be undone.</p>
        <Field label="Reason (kept in the audit log)" id="del-reason"><input id="del-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required /></Field>
      </Dialog>
    </>
  );
}

