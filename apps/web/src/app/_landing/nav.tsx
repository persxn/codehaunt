'use client';

import { useEffect, useState } from 'react';

import hood from '../_public/hood.webp';
import { CalendarIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import styles from './nav.module.css';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#day', label: 'The day' },
  { href: '#faq', label: 'FAQ' },
];

/** Sticky bar; its edge line appears once the page has scrolled. `signIn` only when the full launch is configured. */
export function Nav({ calendar, signIn }: { calendar: string; signIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={styles.bar} data-scrolled={scrolled || undefined}>
      <nav className={`${ui.container} ${styles.inner}`} aria-label="Main">
        <a className={styles.mark} href="#top" aria-label="CodeHaunt, back to top">
          <img src={hood.src} width={36} height={36} alt="" />
          <span>CodeHaunt</span>
        </a>
        <ul className={styles.links}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          {signIn && (
            <a className={`${ui.btn} ${ui.secondary} ${styles.compact}`} href="/login">
              Sign in
            </a>
          )}
          <a className={`${ui.btn} ${ui.primary} ${styles.compact}`} href={calendar} download="codehaunt.ics">
            <CalendarIcon />
            <span className={styles.longLabel}>Add to calendar</span>
            <span className={styles.shortLabel}>Save date</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
