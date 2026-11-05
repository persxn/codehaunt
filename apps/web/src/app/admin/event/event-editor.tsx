'use client';
/**
 * Create an event, then edit its config as one form. After the start (locked) only Budget and Schedule stay editable;
 * the server enforces the same rule and audit-logs every save.
 */
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { EventConfig, Language } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { getJSON, postJSON, putJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import { defaultConfig, fromLocalInput, get, LIVE_SECTIONS, SECTIONS, set, toLocalInput, type FieldSpec } from './config-fields';

type EventView = { id: string; slug: string; name: string; status: string; locked: boolean; config: EventConfig };
const LANGS: Array<[Language, string]> = [['c', 'C'], ['cpp', 'C++'], ['java', 'Java'], ['python', 'Python 3']];

function NewEvent() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { id } = await postJSON<{ id: string }>('/api/admin/events', { slug, name, config: defaultConfig(name) });
      router.replace(`?event=${id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={`${styles.card} ${styles.row}`} onSubmit={create}>
      <Field label="Short name (a-z, 0-9, -)" id="new-slug">
        <input id="new-slug" className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} pattern="[a-z0-9\-]{1,40}" required />
      </Field>
      <Field label="Event name" id="new-name">
        <input id="new-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Button type="submit" busy={busy}>New event</Button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  );
}

function Input({ spec, value, disabled, onChange }: { spec: FieldSpec; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const id = `f-${spec.path}`;
  if (spec.kind === 'bool') {
    return (
      <label className={styles.check}>
        <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {spec.label}
      </label>
    );
  }
  const common = { id, className: inputClass, disabled };
  return (
    <div className={spec.kind === 'textarea' ? styles.wide : undefined}>
      <Field label={spec.label} id={id} hint={spec.hint}>
        {spec.kind === 'textarea' ? (
          <textarea {...common} rows={4} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        ) : spec.kind === 'number' ? (
          <input {...common} type="number" step={spec.step ?? 1} value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
        ) : spec.kind === 'datetime' ? (
          <input {...common} type="datetime-local" value={value ? toLocalInput(String(value)) : ''} onChange={(e) => onChange(fromLocalInput(e.target.value))} />
        ) : (
          <input {...common} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || (spec.path === 'branding.subtitle' ? undefined : ''))} />
        )}
      </Field>
    </div>
  );
}

export function EventEditor() {
  const eventId = useEventId();
  const [event, setEvent] = useState<EventView | null>(null);
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    setMessage(null);
    getJSON<EventView>(`/api/admin/events/${encodeURIComponent(eventId)}`)
      .then((e) => { setEvent(e); setConfig(e.config); setName(e.name); })
      .catch((e: Error) => setMessage({ ok: false, text: e.message }));
  }, [eventId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !config) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await putJSON<EventView>(`/api/admin/events/${event.id}`, { name, config, ...(reason ? { reason } : {}) });
      setEvent(saved);
      setConfig(saved.config);
      setReason('');
      setMessage({ ok: true, text: 'Saved.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <EventPicker admin />
      <NewEvent />
      {event && config && (
        <form className={styles.stack} onSubmit={save}>
          <h2>{event.name} <span className={styles.muted}>({event.status.toLowerCase()})</span></h2>
          {event.locked && <p className={styles.muted} role="note">Locked: the contest has started. Only Budget and Schedule can change.</p>}
          <Field label="Event name" id="event-name">
            <input id="event-name" className={inputClass} value={name} disabled={event.locked} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <fieldset className={styles.fieldset} disabled={event.locked}>
            <legend>Languages</legend>
            {LANGS.map(([l, label]) => (
              <label key={l} className={styles.check}>
                <input type="checkbox" checked={config.languages.includes(l)}
                  onChange={(e) => setConfig({ ...config, languages: e.target.checked ? [...config.languages, l] : config.languages.filter((x) => x !== l) })} /> {label}
              </label>
            ))}
          </fieldset>
          {SECTIONS.map((section) => {
            const disabled = event.locked && !LIVE_SECTIONS.has(section.key);
            return (
              <fieldset key={section.key} className={styles.fieldset}>
                <legend>{section.title}</legend>
                {section.fields.map((spec) => (
                  <Input key={spec.path} spec={spec} value={get(config, spec.path)} disabled={disabled} onChange={(v) => setConfig(set(config, spec.path, v))} />
                ))}
              </fieldset>
            );
          })}
          <Field label="Reason for the change (kept in the audit log)" id="reason">
            <input id="reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <div className={styles.row}>
            <Button type="submit" busy={busy}>Save</Button>
            {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>{message.text}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
