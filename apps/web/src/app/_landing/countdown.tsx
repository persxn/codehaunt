'use client';

import { useEffect, useState } from 'react';

/** 7 Nov 2026, 10:00 IST (UTC+5:30). */
const START = Date.UTC(2026, 10, 7, 4, 30);
const DAY_END = Date.UTC(2026, 10, 7, 13, 30);

function parts(ms: number) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Server renders the date; the client swaps in a live countdown (no hydration mismatch: first paint is the same). */
export function Countdown({ className }: { className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <p className={className}>Doors at 10 AM</p>;
  if (now >= DAY_END) return <p className={className}>That&rsquo;s a wrap. Thanks for haunting.</p>;
  if (now >= START) return <p className={className}>Happening now at IEM Newtown</p>;
  const { d, h, m, s } = parts(START - now);
  return (
    <p className={className} aria-live="off">
      <span>Starts in </span>
      <strong>{d}</strong>d <strong>{h}</strong>h <strong>{m}</strong>m <strong>{s}</strong>s
    </p>
  );
}
