import '@fontsource/creepster/400.css';

import { redirect } from 'next/navigation';

import { sebConfig } from '@codehaunt/auth';

import { currentUser } from '@/lib/session';

import { calendarHref } from './_public/event';
import ui from './_public/public.module.css';
import { Faq, FinalCta, Footer } from './_landing/closing';
import { Hero } from './_landing/hero';
import { Nav } from './_landing/nav';
import { Reveal } from './_landing/reveal';
import { Halves, HowItWorks, TheDay } from './_landing/sections';
import { TutorDemo } from './_landing/tutor-demo';

export const metadata = {
  title: 'CodeHaunt · AI coding competition · 7 Nov 2026',
  description:
    'Write the code yourself and ask an AI tutor when you are stuck, under a token budget. Plus a tech talk. 7 November 2026, 10 AM, IEM Newtown Campus.',
  openGraph: { title: 'CodeHaunt', description: 'AI coding competition and tech talk · 7 Nov 2026, 10 AM · IEM Newtown Campus' },
};

/** "Sign in" is shown only once the full launch is configured (SEB keys set); the public preview blocks /login. */
function launched(): boolean {
  try {
    return sebConfig() !== null;
  } catch {
    return false;
  }
}

/**
 * Public event page (ADR-029; design ADR-031, plan in the control repo's docs/UI_UX_REDESIGN_PLAN.md).
 * Anyone, any browser. Signed-in people go straight to their own area.
 */
export default async function Home() {
  const user = await currentUser();
  if (user) redirect(user.role === 'PARTICIPANT' ? '/contest' : user.role === 'VOLUNTEER' ? '/admin/checkin' : '/admin');

  const calendar = calendarHref();
  return (
    <div className={`${ui.theme} ${ui.textured}`} id="top">
      <a className={ui.skip} href="#main">Skip to content</a>
      <Reveal />
      <Nav calendar={calendar} signIn={launched()} />
      <main id="main">
        <Hero calendar={calendar} />
        <HowItWorks />
        <TutorDemo />
        <Halves />
        <TheDay />
        <Faq />
        <FinalCta calendar={calendar} />
      </main>
      <Footer />
    </div>
  );
}
