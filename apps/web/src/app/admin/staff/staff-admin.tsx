'use client';
/** Staff table and actions. The server enforces who may do what (staff-service.ts); the UI only hides what won't work. */
import { useCallback, useEffect, useState } from 'react';

import type { Role, StaffRole } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { getJSON, patchJSON, postJSON, putJSON } from '../api';

type Staff = { id: string; username: string; name: string; email: string | null; role: StaffRole; active: boolean; lastLoginAt: string | null };
const ROLES: StaffRole[] = ['ADMIN', 'ORGANIZER', 'VOLUNTEER'];

export function StaffAdmin({ role, selfId }: { role: Role; selfId: string }) {
  const isAdmin = role === 'ADMIN';
  const [staff, setStaff] = useState<Staff[]>([]);
  const [form, setForm] = useState({ username: '', name: '', email: '', role: 'VOLUNTEER' as StaffRole, password: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setStaff((await getJSON<{ staff: Staff[] }>('/api/admin/staff')).staff), []);
  useEffect(() => { load().catch((e: Error) => setMessage({ ok: false, text: e.message })); }, [load]);

  /** Runs one action and reports it; true on success. */
  const act = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      await load();
      return true;
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      return false;
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Keep what was typed when the server refuses it (e.g. a weak password), so only that field needs fixing.
    if (await act(() => postJSON('/api/admin/staff', form), `${form.name} added.`)) {
      setForm({ username: '', name: '', email: '', role: 'VOLUNTEER', password: '' });
    }
    setBusy(false);
  };

  const changeRole = (s: Staff) => {
    const next = window.prompt(`New role for ${s.name} (ADMIN, ORGANIZER or VOLUNTEER):`, s.role)?.trim().toUpperCase();
    if (!next || next === s.role) return;
    if (!ROLES.includes(next as StaffRole)) return setMessage({ ok: false, text: 'Role must be ADMIN, ORGANIZER or VOLUNTEER.' });
    const reason = window.prompt('Reason (kept in the audit log):')?.trim();
    if (!reason) return;
    void act(() => putJSON(`/api/admin/roles/${s.id}`, { role: next, reason }), `${s.name} is now ${next.toLowerCase()}; they must sign in again.`);
  };

  const resetPassword = (s: Staff) => {
    const newPassword = window.prompt(`New password for ${s.name} (at least 12 characters; a few unrelated words work well):`);
    if (!newPassword) return;
    void act(() => postJSON(`/api/admin/users/${s.id}/password`, { newPassword }), `Password reset; ${s.name}'s sessions were signed out.`);
  };

  const manageable = (s: Staff) => s.id !== selfId && (isAdmin || s.role === 'VOLUNTEER');
  return (
    <div className={styles.stack}>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>{message.text}</p>}
      <table className={styles.table}>
        <thead><tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Active</th><th scope="col">Last sign-in</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.username}</td><td>{s.email ?? ''}</td><td>{s.role.toLowerCase()}</td>
              <td>{s.active ? 'yes' : 'no'}</td><td>{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : '—'}</td>
              <td className={styles.row}>
                {manageable(s) && (
                  <>
                    <Button variant={s.active ? 'danger' : 'secondary'} onClick={() => act(() => patchJSON(`/api/admin/staff/${s.id}`, { active: !s.active }), s.active ? `${s.name} removed and signed out.` : `${s.name} can sign in again.`)}>
                      {s.active ? 'Remove' : 'Add back'}
                    </Button>
                    <Button variant="secondary" onClick={() => resetPassword(s)}>Reset password</Button>
                    {isAdmin && <Button variant="secondary" onClick={() => changeRole(s)}>Change role</Button>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className={`${styles.card} ${styles.fieldset}`} onSubmit={add} aria-label="Add staff">
        <Field label="Username" id="s-user"><input id="s-user" className={inputClass} value={form.username} required pattern="[a-z0-9._\-]{3,40}" onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></Field>
        <Field label="Name" id="s-name"><input id="s-name" className={inputClass} value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email (for Cloudflare Access)" id="s-email"><input id="s-email" type="email" className={inputClass} value={form.email} required onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role" id="s-role">
          <select id="s-role" className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
            {(isAdmin ? ROLES : (['VOLUNTEER'] as StaffRole[])).map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
          </select>
        </Field>
        <Field label="Password" id="s-pass" hint="At least 12 characters; must not contain the username.">
          <input id="s-pass" type="password" autoComplete="new-password" className={inputClass} value={form.password} required onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className={styles.wide}><Button type="submit" busy={busy}>Add staff</Button></div>
      </form>
    </div>
  );
}
