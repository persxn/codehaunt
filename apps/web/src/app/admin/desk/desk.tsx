'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Field, inputClass } from '@/components/field';
import { Button } from '@/components/button';
import { getJSON, postJSON, eventOptions, type EventOption } from '../api';
import styles from '../admin.module.css';

interface Participant {
  id: string;
  enrolmentNo: string;
  name: string;
  status: 'REGISTERED' | 'WAITLISTED' | 'CHECKED_IN' | 'DISQUALIFIED';
  seatLabel?: string;
  checkedInAt?: string;
  badgeIssued: boolean;
}

export default function Desk() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [eventId, setEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load eventId from query param
  useEffect(() => {
    const id = searchParams.get('event');
    setEventId(id);
  }, [searchParams]);

  // Load event options if no event selected
  useEffect(() => {
    if (!eventId) {
      setLoading(true);
      eventOptions(false)
        .then(setEvents)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed.'))
        .finally(() => setLoading(false));
    }
  }, [eventId]);

  const loadParticipants = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON<{ participants: Participant[] }>(
        `/api/staff/participants?eventId=${eventId}`
      );
      setParticipants(data.participants);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Load participants when eventId changes
  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  // Filter participants based on search string
  const filtered = participants.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.enrolmentNo.toLowerCase().includes(q) ||
      (p.seatLabel?.toLowerCase().includes(q) ?? false)
    );
  });

  // Promote a waitlisted participant
  const promote = async (id: string) => {
    try {
      await postJSON<{ ok: true }>(`/api/staff/participants/${id}/promote`, {});
      await loadParticipants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  };

  return (
    <div className={styles.stack}>
      {/* Event selector if no eventId */}
      {!eventId && (
        <div className={styles.stack}>
          <h2>Select event</h2>
          {loading && <p>Loading events…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <label htmlFor="event">Event</label>
          <select
            id="event"
            className={inputClass}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              setEventId(id);
              router.replace(`?event=${id}`);
            }}
          >
            <option value="" disabled>
              -- Choose an event --
            </option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main desk UI when an event is selected */}
      {eventId && (
        <div className={styles.stack}>
          <h2>Desk – Event {eventId}</h2>
          <div className={styles.row}>
            <Field label="Search name, enrolment or seat" id="search">
              <input
                id="search"
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
            <Button onClick={loadParticipants} disabled={loading}>
              Refresh
            </Button>
          </div>
          {loading && <p>Loading participants…</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Enrolment</th>
                <th>Status</th>
                <th>Seat</th>
                <th>Checked in at</th>
                <th>Badge issued</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.enrolmentNo}</td>
                  <td className={styles.muted}>{p.status.toLowerCase()}</td>
                  <td>{p.seatLabel ?? ''}</td>
                  <td>{p.checkedInAt ? new Date(p.checkedInAt).toLocaleString() : ''}</td>
                  <td>{p.badgeIssued ? 'Yes' : 'No'}</td>
                  <td>
                    {p.status === 'WAITLISTED' && (
                      <Button variant="secondary" onClick={() => promote(p.id)}>
                        Promote
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
