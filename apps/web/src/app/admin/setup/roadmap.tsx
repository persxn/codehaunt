'use client';
/**
 * Event setup roadmap (WP-11, ADR-044): seven numbered steps, one focused panel each. Progress comes from
 * `GET /api/admin/events/:id/setup` (derived on the server); settings steps save the whole config with the reason
 * `setup:NN`, which marks the step. Unsaved edits live in one draft shared by all steps (and in sessionStorage, so a
 * reload keeps them) until saved. Launch = open check-in, refused by the server while a required step fails.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { EventConfig, Language } from '@codehaunt/contracts';

import { Button } from '@/components/button';
import { Field, inputClass } from '@/components/field';

import styles from '../admin.module.css';
import { getJSON, postJSON, putJSON } from '../api';
import { Dialog } from '../dialog';
import { defaultConfig, fromLocalInput, toLocalInput } from '../event/config-fields';
import { ParticipantImport } from '../participants/participant-import';
import s from './setup.module.css';

type Issue = { text: string; level: 'required' | 'todo' | 'warning' };
type Step = { n: number; key: string; title: string; state: 'done' | 'todo' | 'blocked'; summary: string[]; issues: Issue[] };
type Setup = {
  event: { id: string; slug: string; name: string; status: string; locked: boolean; hasDefaultPassword: boolean };
  steps: Step[]; done: number; total: number; canLaunch: boolean; launched: boolean;
};
type EventView = { id: string; slug: string; name: string; status: string; locked: boolean; config: EventConfig };
type ProblemRow = { id: string; title: string; slug: string; difficulty: string; practice: boolean; hintsOnly: boolean; visibleTests: number; hiddenTests: number };

const LANGS: Array<[Language, string]> = [['c', 'C'], ['cpp', 'C++'], ['java', 'Java'], ['python', 'Python 3']];
const LEADS: Record<number, string> = {
  1: 'Name the event and choose what participants may write in.',
  2: 'When check-in opens, when the contest starts and how long it runs.',
  3: 'How much tutor help each participant gets, and how many can check in.',
  4: 'Problems with statements and tests; written in the Problems editor.',
  5: 'Upload the participant list as a CSV; nothing is saved until every row is valid.',
  6: 'How participants sign in on the day.',
  7: 'Check everything once more, then open check-in.',
};
const pad = (n: number) => String(n).padStart(2, '0');
const draftKey = (id: string) => `codehaunt:setup-draft:${id}`;

function readDraft(id: string): { name: string; config: EventConfig } | null {
  try {
    const raw = sessionStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as { name: string; config: EventConfig }) : null;
  } catch {
    return null;
  }
}
function writeDraft(id: string, value: { name: string; config: EventConfig } | null) {
  try {
    if (value) sessionStorage.setItem(draftKey(id), JSON.stringify(value));
    else sessionStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable: the draft lives in memory only */
  }
}

export function Roadmap() {
  const params = useSearchParams();
  const eventId = params.get('event');
  const creating = params.get('new') === '1' || !eventId;
  if (creating) return <CreateEvent />;
  return <EventRoadmap eventId={eventId} />;
}

/** Step 01 for a new event: name and short name; everything else starts from sensible defaults. */
function CreateEvent() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<Array<{ id: string; name: string; status: string }>>([]);
  useEffect(() => {
    getJSON<{ events: Array<{ id: string; name: string; status: string }> }>('/api/admin/events').then((r) => setEvents(r.events)).catch(() => {});
  }, []);
  const auto = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const config = defaultConfig(name.trim());
      const { id } = await postJSON<{ id: string }>('/api/admin/events', { slug, name: name.trim(), config });
      // Creating it is step 01: mark it saved from the roadmap.
      await putJSON(`/api/admin/events/${id}`, { name: name.trim(), config, reason: 'setup:01' });
      router.replace(`/admin/setup?event=${encodeURIComponent(id)}&step=2`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className={s.createGrid}>
      <form className={`${s.panel} sig-border`} onSubmit={create}>
        <div className={`${s.panelInner} sig-step`}>
          <div className={s.panelHead}>
            <span className={s.bigNum} aria-hidden="true">01</span>
            <div>
              <h2 className={s.panelTitle}>Create your event</h2>
              <p className={s.panelLead}>Two fields to start. Schedule, limits, problems and participants follow, one step at a time; you can stop and come back whenever you like.</p>
            </div>
          </div>
          <Field label="Event name" id="new-name" hint="Shown to participants, e.g. “CodeHaunt 2026”.">
            <input id="new-name" className={inputClass} value={name} required maxLength={120}
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(auto(e.target.value)); }} />
          </Field>
          <Field label="Short name" id="new-slug" hint="Lower-case letters, digits and dashes; used in links. Can’t be changed later.">
            <input id="new-slug" className={inputClass} value={slug} required pattern="[a-z0-9\-]{1,40}"
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
          </Field>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={s.footer}>
            <span className={s.spacer} />
            <Button type="submit" busy={busy}>Create and continue →</Button>
          </div>
        </div>
      </form>
      <section className={s.panel} aria-labelledby="continue-title">
        <div className={s.panelInner}>
          <h2 id="continue-title" className={s.panelTitle}>Or continue one</h2>
          {events.length ? (
            <ul className={s.list}>
              {events.map((e) => (
                <li key={e.id} className={s.listItem}>
                  <span>{e.name} <span className={s.tag}>{e.status.toLowerCase().replace('_', ' ')}</span></span>
                  <Link href={`/admin/setup?event=${encodeURIComponent(e.id)}`}>Open roadmap →</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No events yet. The one you create appears here.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function EventRoadmap({ eventId }: { eventId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = Number(params.get('step'));
  const step = Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : null;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [saved, setSaved] = useState<EventView | null>(null);
  const [draft, setDraft] = useState<{ name: string; config: EventConfig } | null>(null);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState('');
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');

  const reload = useCallback(async () => {
    const [st, ev] = await Promise.all([
      getJSON<Setup>(`/api/admin/events/${encodeURIComponent(eventId)}/setup`),
      getJSON<EventView>(`/api/admin/events/${encodeURIComponent(eventId)}`),
    ]);
    setSetup(st);
    setSaved(ev);
    return { st, ev };
  }, [eventId]);

  useEffect(() => {
    setSetup(null);
    reload()
      .then(({ ev }) => {
        const kept = readDraft(eventId);
        if (kept && JSON.stringify(kept) !== JSON.stringify({ name: ev.name, config: ev.config })) {
          setDraft(kept);
          setRestored(true);
        } else setDraft({ name: ev.name, config: ev.config });
      })
      .catch((e: Error) => setError(e.message));
  }, [eventId, reload]);

  const dirty = useMemo(() => Boolean(saved && draft && JSON.stringify(draft) !== JSON.stringify({ name: saved.name, config: saved.config })), [saved, draft]);
  useEffect(() => {
    if (saved && draft) writeDraft(eventId, dirty ? draft : null);
  }, [eventId, saved, draft, dirty]);

  // Default to the first step that isn't done.
  const current = step ?? setup?.steps.find((x) => x.state !== 'done')?.n ?? 7;
  const go = (n: number) => {
    setDir(n < current ? 'back' : 'fwd');
    router.replace(`/admin/setup?event=${encodeURIComponent(eventId)}&step=${n}`, { scroll: false });
  };

  const save = async (n: number, patch?: (c: EventConfig) => EventConfig) => {
    if (!draft) return;
    const config = patch ? patch(draft.config) : draft.config;
    await putJSON(`/api/admin/events/${encodeURIComponent(eventId)}`, { name: draft.name, config, reason: `setup:${pad(n)}` });
    const { ev } = await reload();
    setDraft({ name: ev.name, config: ev.config });
    setRestored(false);
  };

  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!setup || !draft || !saved) return <div className="sig-skeleton" style={{ height: 320 }} aria-busy="true" aria-label="Loading the roadmap" />;
  const active = setup.steps.find((x) => x.n === current)!;

  return (
    <div className={styles.stack}>
      <div className={s.progressHead}>
        <div className={s.progressText}>
          <span><b>{setup.event.name}</b> · {setup.event.status.toLowerCase().replace('_', ' ')}</span>
          <span>{setup.done} of {setup.total} steps done</span>
        </div>
        <span className="sig-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={setup.total} aria-valuenow={setup.done}>
          <span style={{ transform: `scaleX(${setup.done / setup.total})` }} />
        </span>
      </div>
      {setup.event.locked && <p className={s.banner} role="note">The contest has started: only the schedule and the token limits can still change.</p>}
      {restored && (
        <p className={s.banner} role="status">
          Unsaved changes from earlier were restored.{' '}
          <button type="button" className={s.linkButton} onClick={() => { setDraft({ name: saved.name, config: saved.config }); setRestored(false); }}>Discard them</button>
        </p>
      )}

      <div className={s.layout}>
        <nav aria-label="Setup steps">
          <ol className={s.rail}>
            {setup.steps.map((x) => (
              <li key={x.n} data-state={x.state}>
                <button type="button" className={s.stepLink} aria-current={x.n === current ? 'step' : undefined} onClick={() => go(x.n)}>
                  <span className={s.num}>
                    {x.state === 'done' && x.n !== current ? (
                      <svg className={s.numCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" /></svg>
                    ) : pad(x.n)}
                  </span>
                  <span className={s.stepText}>
                    <span className={s.stepTitle}>{x.title}</span>
                    <span className={s.stepState}>
                      {x.state === 'done' ? 'Done' : x.state === 'blocked' ? 'Needs attention' : 'To do'}
                      {dirty && x.n === current && <span className={s.unsaved}> · unsaved</span>}
                    </span>
                  </span>
                  <span className="visually-hidden">{`Step ${x.n}, ${x.state === 'done' ? 'done' : x.state === 'blocked' ? 'needs attention' : 'to do'}`}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className={`${s.panel} sig-border`} aria-labelledby="step-title">
          <div key={current} className={`${s.panelInner} sig-step`} data-dir={dir === 'back' ? 'back' : undefined}>
            <div className={s.panelHead}>
              <span className={s.bigNum} aria-hidden="true">{pad(current)}</span>
              <div>
                <h2 id="step-title" className={s.panelTitle}>{active.title}</h2>
                <p className={s.panelLead}>{LEADS[current]}</p>
              </div>
            </div>
            {active.issues.length > 0 && current !== 7 && (
              <ul className={s.issues} aria-label="What this step still needs">
                {active.issues.map((i) => <li key={i.text} data-level={i.level}>{i.text}</li>)}
              </ul>
            )}
            {current === 1 && <StepEvent draft={draft} setDraft={setDraft} locked={setup.event.locked} />}
            {current === 2 && <StepSchedule draft={draft} setDraft={setDraft} />}
            {current === 3 && <StepLimits draft={draft} setDraft={setDraft} locked={setup.event.locked} />}
            {current === 4 && <StepProblems eventId={eventId} />}
            {current === 5 && <StepParticipants eventId={eventId} step={active} onImported={() => void reload()} />}
            {current === 6 && <StepAccess draft={draft} setDraft={setDraft} setup={setup} onChanged={() => void reload()} locked={setup.event.locked} />}
            {current === 7 && <StepReview setup={setup} go={go} onLaunched={() => void reload()} dirty={dirty} />}
            {current !== 7 && (
              <StepFooter
                n={current}
                saves={[1, 2, 3, 6].includes(current)}
                validate={current === 2 ? () => scheduleProblem(draft.config) : () => null}
                save={() => save(current)}
                back={() => go(current - 1)}
                next={() => go(current + 1)}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StepFooter({ n, saves, validate, save, back, next }: {
  n: number; saves: boolean; validate: () => string | null; save: () => Promise<void>; back: () => void; next: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    const problem = validate();
    if (problem) return setMessage({ ok: false, text: problem });
    setBusy(true);
    setMessage(null);
    try {
      await save();
      next();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.footer}>
      {n > 1 && <Button variant="secondary" onClick={back}>← Back</Button>}
      <span className={s.spacer} />
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error} style={{ margin: 0 }}>{message.text}</p>}
      {saves ? <Button busy={busy} onClick={() => void run()}>Save and continue →</Button> : <Button onClick={next}>Continue →</Button>}
    </div>
  );
}

type DraftProps = { draft: { name: string; config: EventConfig }; setDraft: (d: { name: string; config: EventConfig }) => void };

function StepEvent({ draft, setDraft, locked }: DraftProps & { locked: boolean }) {
  const c = draft.config;
  const patch = (next: Partial<EventConfig>) => setDraft({ ...draft, config: { ...c, ...next } });
  return (
    <fieldset className={s.grid} disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
      <Field label="Event name" id="s1-name">
        <input id="s1-name" className={inputClass} value={draft.name} maxLength={120} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <Field label="Title on the participant screens" id="s1-title">
        <input id="s1-title" className={inputClass} value={c.branding.title} maxLength={120} onChange={(e) => patch({ branding: { ...c.branding, title: e.target.value } })} />
      </Field>
      <div className={s.wide}>
        <Field label="Subtitle (optional)" id="s1-sub">
          <input id="s1-sub" className={inputClass} value={c.branding.subtitle ?? ''} maxLength={200}
            onChange={(e) => {
              const { subtitle: _old, ...rest } = c.branding;
              patch({ branding: e.target.value ? { ...rest, subtitle: e.target.value } : rest });
            }} />
        </Field>
      </div>
      <div className={s.wide} role="group" aria-labelledby="s1-langs">
        <p id="s1-langs" className={styles.heroLabel} style={{ margin: '0 0 var(--space-2)' }}>Languages participants may use</p>
        <div className={styles.row}>
          {LANGS.map(([l, label]) => (
            <label key={l} className={styles.check}>
              <input type="checkbox" checked={c.languages.includes(l)}
                onChange={(e) => patch({ languages: e.target.checked ? [...c.languages, l] : c.languages.filter((x) => x !== l) })} /> {label}
            </label>
          ))}
        </div>
        {c.languages.length === 0 && <p className={styles.error} role="alert">Pick at least one language.</p>}
      </div>
      <div className={s.wide}>
        <Field label="Consent text participants accept at first sign-in" id="s1-consent">
          <textarea id="s1-consent" className={inputClass} rows={3} value={c.consent.text} onChange={(e) => patch({ consent: { ...c.consent, text: e.target.value } })} />
        </Field>
      </div>
    </fieldset>
  );
}

function scheduleProblem(c: EventConfig): string | null {
  const checkIn = new Date(c.schedule.checkInAt).getTime();
  const start = new Date(c.schedule.startsAt).getTime();
  if (Number.isNaN(checkIn) || Number.isNaN(start)) return 'Enter both times.';
  if (checkIn > start) return 'Check-in must open before the contest starts.';
  if (c.schedule.durationMinutes < 10 || c.schedule.durationMinutes > 1440) return 'The contest lasts 10 to 1,440 minutes.';
  if (c.schedule.freezeMinutes >= c.schedule.durationMinutes) return 'The freeze must be shorter than the contest.';
  return null;
}

function StepSchedule({ draft, setDraft }: DraftProps) {
  const c = draft.config;
  const sch = c.schedule;
  const patch = (next: Partial<EventConfig['schedule']>) => setDraft({ ...draft, config: { ...c, schedule: { ...sch, ...next } } });
  const start = new Date(sch.startsAt);
  const freeze = new Date(start.getTime() + (sch.durationMinutes - sch.freezeMinutes) * 60_000);
  const end = new Date(start.getTime() + sch.durationMinutes * 60_000);
  const t = (d: Date) => (Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  const problem = scheduleProblem(c);
  return (
    <>
      <div className={s.grid}>
        <Field label="Check-in opens" id="s2-checkin">
          <input id="s2-checkin" type="datetime-local" className={inputClass} value={toLocalInput(sch.checkInAt)} onChange={(e) => e.target.value && patch({ checkInAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field label="Contest starts" id="s2-start">
          <input id="s2-start" type="datetime-local" className={inputClass} value={toLocalInput(sch.startsAt)} onChange={(e) => e.target.value && patch({ startsAt: fromLocalInput(e.target.value) })} />
        </Field>
        <Field label="Duration (minutes)" id="s2-dur" hint="10 to 1,440. Extensions during the contest are made in Contest controls.">
          <input id="s2-dur" type="number" min={10} max={1440} className={inputClass} value={sch.durationMinutes} onChange={(e) => patch({ durationMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="Leaderboard freeze (minutes before the end)" id="s2-freeze" hint="The projector stops updating for the last minutes; 0 = no freeze.">
          <input id="s2-freeze" type="number" min={0} max={240} className={inputClass} value={sch.freezeMinutes} onChange={(e) => patch({ freezeMinutes: Number(e.target.value) })} />
        </Field>
      </div>
      <div className={s.timeline} aria-label="Timeline">
        <div className={s.mark}><div className={s.markLabel}>Check-in</div><div className={s.markTime}>{t(new Date(sch.checkInAt))}</div></div>
        <div className={s.mark}><div className={s.markLabel}>Start</div><div className={s.markTime}>{t(start)}</div></div>
        <div className={s.mark}><div className={s.markLabel}>Freeze</div><div className={s.markTime}>{sch.freezeMinutes ? t(freeze) : 'none'}</div></div>
        <div className={s.mark}><div className={s.markLabel}>End</div><div className={s.markTime}>{t(end)}</div></div>
      </div>
      {problem && <p className={styles.error} role="alert">{problem}</p>}
    </>
  );
}

function NumberField({ id, label, hint, value, min, max, onChange, disabled = false }: {
  id: string; label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <Field label={label} id={id} {...(hint ? { hint } : {})}>
      <input id={id} type="number" min={min} max={max} className={inputClass} value={Number.isFinite(value) ? value : ''} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function StepLimits({ draft, setDraft, locked }: DraftProps & { locked: boolean }) {
  const c = draft.config;
  const budget = (next: Partial<EventConfig['budget']>) => setDraft({ ...draft, config: { ...c, budget: { ...c.budget, ...next } } });
  const model = (next: Partial<EventConfig['model']>) => setDraft({ ...draft, config: { ...c, model: { ...c.model, ...next } } });
  const access = (next: Partial<EventConfig['access']>) => setDraft({ ...draft, config: { ...c, access: { ...c.access, ...next } } });
  return (
    <div className={s.grid}>
      <NumberField id="s3-tokens" label="Tokens per participant" hint="Their whole tutor budget. A change during the contest adjusts everyone checked in." value={c.budget.tokensPerParticipant} min={1000} max={10_000_000} onChange={(v) => budget({ tokensPerParticipant: v })} />
      <NumberField id="s3-cap" label="Check-in cap (seats)" hint="Imports beyond this are waitlisted." value={c.access.checkInCap} min={1} max={10_000} disabled={locked} onChange={(v) => access({ checkInCap: v })} />
      <NumberField id="s3-question" label="Longest question (characters)" value={c.budget.maxPromptChars} min={100} max={20_000} onChange={(v) => budget({ maxPromptChars: v })} />
      <NumberField id="s3-reply" label="Longest reply (tokens)" value={c.budget.replyTokens} min={64} max={4096} onChange={(v) => budget({ replyTokens: v })} />
      <NumberField id="s3-context" label="Conversation memory (tokens)" hint="When full, the participant starts a fresh chat." value={c.budget.contextTokens} min={512} max={131_072} onChange={(v) => budget({ contextTokens: v })} />
      <Field label="Code lines the tutor may show per reply" id="s3-lines" hint="0 recommended: the tutor explains in words only, no code (ADR-046). Hints-only problems always get 0.">
        <select id="s3-lines" className={inputClass} value={c.model.maxExampleLines} disabled={locked} onChange={(e) => model({ maxExampleLines: Number(e.target.value) })}>
          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? '0 · words only (recommended)' : n}</option>)}
        </select>
      </Field>
      <Field label="Tutor behaviour" id="s3-prompt" hint="tutor-v2 notices requests for the answer and gives step-by-step hints instead.">
        <select id="s3-prompt" className={inputClass} value={c.model.systemPromptVersion} disabled={locked} onChange={(e) => model({ systemPromptVersion: e.target.value })}>
          <option value="tutor-v2">tutor-v2 · hint ladder (recommended)</option>
          <option value="tutor-v1">tutor-v1 · earlier tutor</option>
        </select>
      </Field>
    </div>
  );
}

function StepProblems({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ProblemRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getJSON<{ problems: ProblemRow[] }>(`/api/admin/events/${encodeURIComponent(eventId)}/problems`).then((r) => setRows(r.problems)).catch((e: Error) => setError(e.message));
  }, [eventId]);
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (!rows) return <div className="sig-skeleton" style={{ height: 120 }} />;
  return (
    <>
      {rows.length ? (
        <ul className={s.list}>
          {rows.map((p) => (
            <li key={p.id} className={s.listItem}>
              <span><b>{p.title}</b> <span className={styles.muted}>{p.slug}</span></span>
              <span className={styles.row} style={{ gap: 'var(--space-2)' }}>
                {p.practice && <span className={s.tag}>warm-up</span>}
                <span className={s.tag}>{p.difficulty.toLowerCase()}</span>
                {p.hintsOnly && <span className={s.tag} data-tone="brand">hints only</span>}
                <span className={s.tag} data-tone={p.hiddenTests ? 'ok' : 'bad'}>{p.visibleTests} sample · {p.hiddenTests} hidden tests</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={s.info}><p>No problems yet. Each problem needs a statement, sample tests and hidden tests. The tutor answers in words only by default (ADR-046); “hints only” keeps a problem words-only even if code examples are switched on.</p></div>
      )}
      <div><Link href={`/admin/problems?event=${encodeURIComponent(eventId)}`}>Open the Problems editor →</Link></div>
    </>
  );
}

function StepParticipants({ eventId, step, onImported }: { eventId: string; step: Step; onImported: () => void }) {
  return (
    <>
      <div className={styles.row}>{step.summary.map((x) => <span key={x} className={s.tag}>{x}</span>)}</div>
      <ParticipantImport eventId={eventId} onImported={onImported} />
      <div><Link href={`/admin/participants?event=${encodeURIComponent(eventId)}`}>Manage participants (search, reset passwords, end sessions) →</Link></div>
    </>
  );
}

function StepAccess({ draft, setDraft, setup, onChanged, locked }: DraftProps & { setup: Setup; onChanged: () => void; locked: boolean }) {
  const c = draft.config;
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const setDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== again) return setMessage({ ok: false, text: 'The two passwords are different.' });
    setBusy(true);
    setMessage(null);
    try {
      const r = await postJSON<{ applied: number }>(`/api/admin/events/${encodeURIComponent(setup.event.id)}/default-password`, { password: pw });
      setShown(pw);
      setPw('');
      setAgain('');
      setMessage({ ok: true, text: `Saved. ${r.applied} participant accounts now use it.` });
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await postJSON(`/api/admin/events/${encodeURIComponent(setup.event.id)}/default-password`, { password: null });
      setShown(null);
      setMessage({ ok: true, text: 'Removed. Badges issued from now on carry per-person passwords.' });
      setClearOpen(false);
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className={styles.check}>
        <input type="checkbox" checked={c.access.sebRequired} disabled={locked}
          onChange={(e) => setDraft({ ...draft, config: { ...c, access: { ...c.access, sebRequired: e.target.checked } } })} />
        Participants must use Safe Exam Browser (recommended)
      </label>

      <section className={s.info} aria-labelledby="pw-title">
        <p id="pw-title"><b>Event password</b> · {setup.event.hasDefaultPassword ? 'set' : 'not set: each badge carries its own password'}</p>
        <p>
          Optional. With an event password, everyone signs in with it the first time and must then choose their own (ADR-041).
          It is stored only as a hash: after you leave this page nobody, including you, can see it again. Accounts still work only
          after their badge is scanned at the door.
        </p>
      </section>

      {shown && (
        <div className={s.secretShown} role="status">
          <span>Event password, shown once:</span> <code>{shown}</code>
          <Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(shown).catch(() => {})}>Copy</Button>
        </div>
      )}

      <form className={s.grid} onSubmit={setDefault} aria-label="Set the event password">
        <Field label={setup.event.hasDefaultPassword ? 'New event password' : 'Event password'} id="s6-pw" hint="At least 12 characters; a few unrelated words are easy to say aloud.">
          <input id="s6-pw" type="password" autoComplete="new-password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={200} required />
        </Field>
        <Field label="Repeat it" id="s6-again">
          <input id="s6-again" type="password" autoComplete="new-password" className={inputClass} value={again} onChange={(e) => setAgain(e.target.value)} maxLength={200} required />
        </Field>
        <div className={`${s.wide} ${styles.row}`}>
          <Button type="submit" variant="secondary" busy={busy}>{setup.event.hasDefaultPassword ? 'Change event password' : 'Set event password'}</Button>
          {setup.event.hasDefaultPassword && <Button type="button" variant="danger" onClick={() => setClearOpen(true)}>Remove event password</Button>}
          {message && <span role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>{message.text}</span>}
        </div>
      </form>

      <section className={s.info} aria-labelledby="login-title">
        <p id="login-title"><b>What participants need on the day</b></p>
        <p>Open <code>{origin}/login</code>{c.access.sebRequired ? ' inside Safe Exam Browser (the badge QR is for check-in only)' : ''}.</p>
        <p>Username: their enrolment number in lower case. Password: {setup.event.hasDefaultPassword ? 'the event password, then one they choose.' : 'the one printed on their badge.'}</p>
      </section>

      <Dialog open={clearOpen} title="Remove the event password?" confirmLabel="Remove" tone="danger" busy={busy} onConfirm={() => void clear()} onClose={() => setClearOpen(false)}>
        <p>Accounts that still use it keep it until their badge is reissued or a staff member resets their password. New badges get per-person passwords.</p>
      </Dialog>
    </>
  );
}

function StepReview({ setup, go, onLaunched, dirty }: { setup: Setup; go: (n: number) => void; onLaunched: () => void; dirty: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('Setup complete');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const launch = async () => {
    setBusy(true);
    setError('');
    try {
      await postJSON(`/api/admin/events/${encodeURIComponent(setup.event.id)}/setup`, { action: 'launch', reason });
      setOpen(false);
      onLaunched();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const blockers = setup.steps.slice(0, 6).flatMap((x) => x.issues.filter((i) => i.level === 'required'));
  return (
    <>
      {setup.launched && (
        <div className={`${s.launched} sig-step`} role="status">
          <svg className={`${s.launchCheck} sig-check`} viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path pathLength={1} d="M4 12.5 9.5 18 20 6.5" />
          </svg>
          <h3 className="sig-glitch">Launched</h3>
          <p className={styles.muted}>{setup.event.status === 'CHECK_IN' ? 'Check-in is open.' : `The event is ${setup.event.status.toLowerCase().replace('_', ' ')}.`} Run the day from the dashboard and Contest controls.</p>
          <div className={styles.row}>
            <Link href={`/admin?event=${encodeURIComponent(setup.event.id)}`}>Event dashboard →</Link>
            <Link href={`/admin/contest?event=${encodeURIComponent(setup.event.id)}`}>Contest controls →</Link>
          </div>
        </div>
      )}
      <div className={s.review}>
        {setup.steps.slice(0, 6).map((x) => (
          <div key={x.n} className={s.reviewRow} data-state={x.state}>
            <span className={s.reviewNum}>{pad(x.n)}</span>
            <div className={s.reviewBody}>
              <b>{x.title}</b>
              {x.summary.map((line) => <span key={line} className={styles.muted}>{line}</span>)}
              {x.issues.length > 0 && (
                <ul className={s.issues}>{x.issues.map((i) => <li key={i.text} data-level={i.level}>{i.text}</li>)}</ul>
              )}
            </div>
            <Button variant="secondary" onClick={() => go(x.n)}>Edit</Button>
          </div>
        ))}
      </div>
      {!setup.launched && (
        <div className={s.footer}>
          <Button variant="secondary" onClick={() => go(6)}>← Back</Button>
          <span className={s.spacer} />
          {dirty && <span className={styles.error}>You have unsaved changes in a step.</span>}
          {!setup.canLaunch && <span className={styles.muted}>{blockers.length} required item{blockers.length === 1 ? '' : 's'} left</span>}
          <Button disabled={!setup.canLaunch || dirty} onClick={() => setOpen(true)} className={setup.canLaunch && !dirty ? 'sig-glow' : undefined}>Launch: open check-in</Button>
        </div>
      )}
      <Dialog open={open} title={`Launch ${setup.event.name}?`} confirmLabel="Open check-in" busy={busy} error={error} confirmDisabled={!reason.trim()} onConfirm={() => void launch()} onClose={() => setOpen(false)}>
        <p>Check-in opens: volunteers can scan badges and participants who are checked in can sign in. The contest itself starts only when you press Start in Contest controls.</p>
        <p>You can still edit every step until the contest starts.</p>
        <Field label="Note for the audit log" id="launch-reason"><input id="launch-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      </Dialog>
    </>
  );
}
