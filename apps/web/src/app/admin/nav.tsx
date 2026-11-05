'use client';
/** Admin navigation by role (ADR-013): volunteers see only check-in and the desk. Keeps ?event= across pages. */
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import type { Role } from '@codehaunt/contracts';

import styles from './admin.module.css';

type IconName = 'route' | 'home' | 'flag' | 'trophy' | 'alert' | 'scale' | 'calendar' | 'puzzle' | 'users' | 'badge' | 'shield' | 'scan' | 'desk';

/** Line icons (Lucide-style, 24px grid, stroke currentColor), decorative: every link has its text. */
const ICON_PATHS: Record<IconName, string> = {
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  flag: 'M4 21V4m0 0h12l-2 4 2 4H4',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4',
  alert: 'M12 3 2 21h20zM12 10v5m0 3h.01',
  scale: 'M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zm12 0-3 7a3 3 0 0 0 6 0z',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4m8-4v4',
  puzzle: 'M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H5v-4a2 2 0 1 0 0-4z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0m1-10a3 3 0 1 0 0-6m3 16a6 6 0 0 0-3-5',
  badge: 'M4 4h16v16H4zM8 9h8M8 13h5m-5 4h3',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  scan: 'M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8 12h8',
  desk: 'M3 7h18v4H3zM5 11v9m14-9v9M9 15h6',
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const GROUPS: Array<{ title: string; links: Array<{ href: string; label: string; icon: IconName; roles: Role[] }> }> = [
  {
    title: 'Run the contest',
    links: [
      { href: '/admin', label: 'Overview', icon: 'home', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/contest', label: 'Contest', icon: 'flag', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/leaderboard', label: 'Leaderboard', icon: 'trophy', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/incidents', label: 'Incidents', icon: 'alert', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/review', label: 'Judge review', icon: 'scale', roles: ['ADMIN', 'ORGANIZER'] },
    ],
  },
  {
    title: 'Set up',
    links: [
      { href: '/admin/setup', label: 'Setup roadmap', icon: 'route', roles: ['ADMIN'] },
      { href: '/admin/event', label: 'All event settings', icon: 'calendar', roles: ['ADMIN'] },
      { href: '/admin/problems', label: 'Problems', icon: 'puzzle', roles: ['ADMIN'] },
      { href: '/admin/participants', label: 'Participants', icon: 'users', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/badges', label: 'Badges', icon: 'badge', roles: ['ADMIN', 'ORGANIZER'] },
      { href: '/admin/staff', label: 'Staff', icon: 'shield', roles: ['ADMIN', 'ORGANIZER'] },
    ],
  },
  {
    title: 'At the door',
    links: [
      { href: '/admin/checkin', label: 'Check-in', icon: 'scan', roles: ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] },
      { href: '/admin/desk', label: 'Desk', icon: 'desk', roles: ['ADMIN', 'ORGANIZER', 'VOLUNTEER'] },
    ],
  },
];

export function Nav({ role }: { role: Role }) {
  const pathname = usePathname();
  const event = useSearchParams().get('event');
  const query = event ? `?event=${encodeURIComponent(event)}` : '';
  return (
    <nav aria-label="Admin" className={styles.nav}>
      {GROUPS.map((g) => {
        const links = g.links.filter((l) => l.roles.includes(role));
        if (!links.length) return null;
        return (
          <div key={g.title} className={styles.navGroup}>
            <p className={styles.navTitle}>{g.title}</p>
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={`${l.href}${query}`} aria-current={pathname === l.href ? 'page' : undefined}>
                    <NavIcon name={l.icon} />
                    <span>{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
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
