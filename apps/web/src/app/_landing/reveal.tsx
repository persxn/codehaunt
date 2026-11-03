'use client';

import { useEffect } from 'react';

/**
 * Staggered entrances: elements with `data-reveal` rise in once they reach the viewport, and anything already scrolled
 * past (a jump with End or a fast flick) shows at once. Nothing is hidden until this runs, so without script (or with
 * reduced motion) everything simply shows.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    let pending = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    let frame = 0;

    const check = () => {
      frame = 0;
      const line = window.innerHeight * 0.92;
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top > line) return true;
        el.setAttribute('data-shown', '');
        return false;
      });
      if (pending.length === 0) stop();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    const stop = () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };

    root.setAttribute('data-reveal-ready', '');
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      stop();
      cancelAnimationFrame(frame);
      root.removeAttribute('data-reveal-ready');
    };
  }, []);
  return null;
}
