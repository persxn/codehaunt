'use client';
/**
 * Issues badges (a fresh password and a single-use check-in code per participant not yet checked in) and lays them
 * out for A4 printing, 2 × 4 per page. The response is the only copy: nothing is stored or cached in the browser.
 */
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { Button } from '@/components/button';
import { GhostMark } from '@/components/ghost-mark';

import admin from '../admin.module.css';
import { getJSON, postJSON } from '../api';
import { EventPicker, useEventId } from '../event-picker';
import styles from './badges.module.css';

type Badge = { participantId: string; name: string; enrolmentNo: string; username: string; password: string; checkInCode: string };

export function BadgeSheet({ admin: isAdmin }: { admin: boolean }) {
  const eventId = useEventId();
  const [eventName, setEventName] = useState('');
  const [badges, setBadges] = useState<Array<Badge & { qr: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBadges([]);
    if (!eventId) return;
    getJSON<{ events: Array<{ id: string; name: string }> }>('/api/staff/events')
      .then((d) => setEventName(d.events.find((e) => e.id === eventId)?.name ?? ''))
      .catch(() => {});
  }, [eventId]);

  const issue = async () => {
    if (!eventId || !window.confirm('Issuing badges replaces any earlier badge and password for everyone not yet checked in. Continue?')) return;
    setBusy(true);
    setError('');
    try {
      const { badges: issued } = await postJSON<{ badges: Badge[] }>('/api/admin/badges', { eventId });
      setBadges(await Promise.all(issued.map(async (b) => ({ ...b, qr: await QRCode.toDataURL(b.checkInCode, { errorCorrectionLevel: 'M', margin: 1, width: 160 }) }))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={admin.stack}>
      <div className={`no-print ${admin.stack}`}>
        <EventPicker admin={isAdmin} />
        {eventId && (
          <div className={admin.row}>
            <Button busy={busy} onClick={issue}>Issue badges</Button>
            {badges.length > 0 && <Button variant="secondary" onClick={() => window.print()}>Print</Button>}
          </div>
        )}
        <p className={admin.muted}>Badges show the password once. Print them before leaving this page; reissuing replaces them.</p>
        {error && <p className={admin.error} role="alert">{error}</p>}
        {badges.length > 0 && <p role="status">{badges.length} badges ready.</p>}
      </div>
      <div className={styles.sheet}>
        {badges.map((b) => (
          <article key={b.participantId} className={styles.badge}>
            <div className={styles.head}><GhostMark size={24} /> {eventName || 'CodeHaunt'}</div>
            <div className={styles.name}>{b.name}</div>
            <div className={styles.meta}>{b.enrolmentNo}</div>
            <img src={b.qr} alt="Check-in code" width={120} height={120} className={styles.qr} />
            <dl className={styles.login}>
              <dt>Username</dt><dd>{b.username}</dd>
              <dt>Password</dt><dd>{b.password}</dd>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
