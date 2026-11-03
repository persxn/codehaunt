'use client';

import { useEffect, useState } from 'react';

import hood from '../_public/hood.webp';
import logoCsi from '../_public/logo-csi.webp';
import logoIem from '../_public/logo-iem.webp';
import logoUem from '../_public/logo-uem.webp';
import { CalendarIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import styles from './nav.module.css';

/** Organisers, in the poster's order. IEM and UEM in soft squares, CSI in a circle (client, 2026-11-04). */
const PARTNERS = [
  { src: logoIem.src, alt: 'Institute of Engineering & Management', round: false },
  { src: logoCsi.src, alt: 'Computer Society of India', round: true },
  { src: logoUem.src, alt: 'University of Engineering & Management', round: false },
];

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
        <ul className={styles.partners} aria-label="Organised by">
          {PARTNERS.map((p) => (
            <li key={p.alt}>
              <img className={p.round ? styles.round : styles.square} src={p.src} width={44} height={44} alt={p.alt} title={p.alt} />
            </li>
          ))}
        </ul>
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
