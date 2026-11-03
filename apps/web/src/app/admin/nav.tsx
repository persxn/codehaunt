'use client';
/** Admin navigation by role (ADR-013): volunteers see only check-in and the desk. Keeps ?event= across pages. */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import type { Role } from '@codehaunt/contracts';

import styles from './admin.module.css';

const LINKS: Array<{ href: string; label: string; roles: Role[] }> = [
  { href: '/admin', label: 'Overview', roles: ['ADMIN', 'ORGANIZER'] },
  { href: '/admin/event', label: 'Event', roles: ['ADMIN'] },
  { href: '/admin/problems', label: 'Problems', roles: ['ADMIN'] },
  { href: '/admin/participants', label: 'Participants', roles: ['ADMIN', 'ORGANIZER'] },
  { href: '/admin/badges', label: 'Badges', roles: ['ADMIN', 'ORGANIZER'] },
  { href: '/admin/staff', label: 'Staff', roles: ['ADMIN', 'ORGANIZER'] },
  { href: '/admin/checkin', label: 'Check-in', roles: ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] },
  { href: '/admin/desk', label: 'Desk', roles: ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] },
];

export function Nav({ role }: { role: Role }) {
  const pathname = usePathname();
  const event = useSearchParams().get('event');
  const query = event ? `?event=${encodeURIComponent(event)}` : '';
  return (
    <nav aria-label="Admin" className={styles.nav}>
      <ul>
        {LINKS.filter((l) => l.roles.includes(role)).map((l) => (
          <li key={l.href}>
            <Link href={`${l.href}${query}`} aria-current={pathname === l.href ? 'page' : undefined}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SignOut() {
  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.assign('/login');
  };
  return <button type="button" className={styles.signOut} onClick={signOut}>Sign out</button>;
}
