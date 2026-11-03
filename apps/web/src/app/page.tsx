import '@fontsource/creepster/400.css';

import { redirect } from 'next/navigation';

import { currentUser } from '@/lib/session';

import coderAsleep from './_landing/coder-asleep.webp';
import coderDebug from './_landing/coder-debug.webp';
import coderWave from './_landing/coder-wave.webp';
import { Countdown } from './_landing/countdown';
import divider from './_landing/divider.webp';
import ghostsPeek from './_landing/ghosts-peek.webp';
import heroLab from './_landing/hero-lab.webp';
import hood from './_landing/hood.webp';
import bat from './_landing/icon-bat.webp';
import ghost from './_landing/icon-ghost.webp';
import { JuniorDemo } from './_landing/junior-demo';
import poster from './_landing/poster.jpg';
import reaper from './_landing/reaper.webp';
import { Reveal } from './_landing/reveal';
import winner from './_landing/winner.webp';
import styles from './landing.module.css';

export const metadata = {
  title: 'CodeHaunt · AI coding competition · 7 Nov 2026',
  description:
    'Solve problems by directing an AI junior developer under a token budget. Plus a tech talk. 7 November 2026, 10 AM, IEM Newtown Campus.',
  openGraph: { title: 'CodeHaunt', description: 'AI coding competition and tech talk · 7 Nov 2026, 10 AM · IEM Newtown Campus' },
};

/**
 * Public event page (ADR-029, art direction ADR-030): anyone, any browser. Signed-in people go straight to their own
 * area. Facts come from the client's poster; nothing here reads contest data.
 */
export default async function Home() {
  const user = await currentUser();
  if (user) redirect(user.role === 'PARTICIPANT' ? '/contest' : user.role === 'VOLUNTEER' ? '/admin/checkin' : '/admin');

  const steps = [
    {
      verb: 'Direct',
      text: 'You never type code. You tell an AI junior developer what to build: the algorithm, the data structures, the types.',
      art: coderWave,
      alt: 'The hooded skeleton coder waving from behind a laptop',
      tone: styles.violet,
    },
    {
      verb: 'Debug',
      text: 'Sample runs are free. When a test fails, work out why and tell the junior exactly what to fix. Every token comes out of your budget.',
      art: coderDebug,
      alt: 'The skeleton coder scratching his skull at a cracked laptop while a ghost shrugs',
      tone: styles.wine,
    },
    {
      verb: 'Win',
      text: 'Hidden tests decide what is correct. A judge model reads how you got there. The sharpest directors take the night.',
      art: winner,
      alt: 'A cloaked skeleton lifting a jack-o-lantern trophy between two cheering ghosts',
      tone: styles.ember,
    },
  ];

  const faq = [
    {
      tab: 'Bring',
      q: 'What do I bring?',
      a: 'A Windows 10 or 11 laptop with Safe Exam Browser installed, and its charger. The organizers share the CodeHaunt config file before the day.',
    },
    {
      tab: 'Rules',
      q: 'Can I use ChatGPT or my own tools?',
      a: 'No. The contest runs inside Safe Exam Browser, which shuts out other apps and sites. The only AI you talk to is the junior.',
    },
    {
      tab: 'Languages',
      q: 'Which languages can the junior write?',
      a: 'Python 3, C, C++ and Java. You choose one per problem.',
    },
    {
      tab: 'Scoring',
      q: 'How is it scored?',
      a: 'Passing the hidden tests counts most. The tokens you spend, how fast and lean your solutions run, and how well you direct the junior count too.',
    },
    {
      tab: 'Entry',
      q: 'How do I get in on the day?',
      a: 'Come to the desk with your registration. A volunteer scans your QR badge, and that unlocks your account. Seats are limited.',
    },
    {
      tab: 'Prize',
      q: 'What is there to win?',
      a: 'A chance at double MAR points, and the right to haunt the leaderboard.',
    },
  ];

  return (
    <div className={styles.page}>
      <Reveal />

      <section className={styles.hero} aria-labelledby="title">
        <img className={styles.heroArt} src={heroLab.src} width={heroLab.width} height={heroLab.height} alt="" fetchPriority="high" />
        <div className={styles.bats} aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <img key={i} className={styles.bat} src={bat.src} width={bat.width} height={bat.height} alt="" />
          ))}
        </div>

        <header className={styles.heroBar}>
          <a className={styles.wordmark} href="/">
            <img src={hood.src} width={40} height={40} alt="" />
            CodeHaunt
          </a>
          <a className={styles.button} href="/login">Sign in</a>
        </header>

        <div className={styles.heroCopy}>
          <h1 id="title" className={styles.heroTitle}>
            <span className={styles.heroLine1}>Code</span>
            <span className={styles.heroLine2}>Haunt</span>
          </h1>
          <p className={styles.heroLede}>An AI coding competition and a tech talk, from CSI UEM Kolkata.</p>
          <p className={styles.heroWhen}>
            <time dateTime="2026-11-07T10:00+05:30">7 November, 10 AM</time>
            <span className={styles.heroWhere}>IEM Newtown Campus</span>
          </p>
          <Countdown className={styles.countdown} />
        </div>
      </section>

      <section className={styles.steps} aria-labelledby="steps-title">
        <h2 id="steps-title" className="visually-hidden">How the round works</h2>
        {steps.map((s, i) => (
          <article key={s.verb} className={`${styles.step} ${s.tone}`} data-flip={i % 2 ? '' : undefined}>
            <div className={styles.stepCopy}>
              <h3 className={styles.stepVerb} data-reveal>{s.verb}</h3>
              <p className={styles.stepText} data-reveal>{s.text}</p>
            </div>
            <img className={styles.stepArt} src={s.art.src} width={s.art.width} height={s.art.height} alt={s.alt} loading="lazy" />
          </article>
        ))}
      </section>

      <section className={styles.showcase} aria-labelledby="say-title">
        <div className={styles.wrap}>
          <div className={styles.showcaseHead}>
            <h2 id="say-title" className={styles.h2} data-reveal>Say what you mean</h2>
            <p className={styles.showcaseIntro} data-reveal>
              Leave a choice open and the junior takes the plain default: an int where you needed a long long. Sometimes
              that is fine. Sometimes the answer overflows and a hidden test catches it.
            </p>
          </div>
          <div className={styles.specimens} aria-hidden>
            <p className={styles.specimenWord}>int</p>
            <p className={styles.specimenWord}>long long</p>
          </div>
          <JuniorDemo />
        </div>
      </section>

      <section className={styles.day} aria-labelledby="day-title">
        <div className={`${styles.wrap} ${styles.dayGrid}`}>
          <div>
            <h2 id="day-title" className={styles.h2} data-reveal>The day</h2>
            <ol className={styles.dayList}>
              <li data-reveal>
                <strong>Check in.</strong> Bring your registration to the desk; a volunteer scans your QR badge and your
                account comes alive.
              </li>
              <li data-reveal>
                <strong>Lock in.</strong> Open CodeHaunt in Safe Exam Browser on your Windows laptop.
              </li>
              <li data-reveal>
                <strong>Haunt the problems.</strong> Direct the junior through as many as you can, in Python, C, C++ or
                Java.
              </li>
              <li data-reveal>
                <strong>Tech talk.</strong> The Reaper takes the stage. Stay for it.
              </li>
              <li data-reveal>
                <strong>Results.</strong> The leaderboard goes up on the big screen.
              </li>
            </ol>
          </div>
          <figure className={styles.dayArt}>
            <img src={reaper.src} width={reaper.width} height={reaper.height} alt="The Reaper pointing at the stage, holding a scroll" loading="lazy" />
          </figure>
        </div>
        <img className={styles.peek} src={ghostsPeek.src} width={ghostsPeek.width} height={ghostsPeek.height} alt="" loading="lazy" />
      </section>

      <section className={styles.faq} aria-labelledby="faq-title">
        <div className={styles.wrap}>
          <h2 id="faq-title" className={styles.h2} data-reveal>Before you come</h2>
          <div className={styles.faqGrid}>
          <div className={styles.cards}>
            {faq.map((f, i) => (
              <details key={f.tab} name="faq" className={styles.card} open={i === 0} style={{ ['--i' as string]: i }}>
                <summary className={styles.cardSummary}>
                  <span className={styles.cardTab}>{f.tab}</span>
                  <span className={styles.cardQ}>{f.q}</span>
                </summary>
                <p className={styles.cardA}>{f.a}</p>
              </details>
            ))}
          </div>
          <figure className={styles.faqArt}>
            <img src={coderAsleep.src} width={coderAsleep.width} height={coderAsleep.height} alt="The skeleton coder asleep on a closed laptop beside a candle" loading="lazy" />
            <figcaption>Sleep well on the 6th.</figcaption>
          </figure>
          </div>
        </div>
      </section>

      <a className={styles.cta} href="/login">
        <span className={styles.ctaNote}>Checked in? Open CodeHaunt in Safe Exam Browser and sign in.</span>
        <svg className={styles.ctaArrow} viewBox="0 0 48 48" aria-hidden>
          <path d="M12 36 36 12M16 12h20v20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="square" />
        </svg>
        <span className={styles.ctaWord}>Enter</span>
        <img className={styles.ctaGhost} src={ghost.src} width={ghost.width} height={ghost.height} alt="" loading="lazy" />
      </a>

      <footer className={styles.footer}>
        <img className={styles.divider} src={divider.src} width={divider.width} height={divider.height} alt="" loading="lazy" />
        <div className={`${styles.wrap} ${styles.footerTop}`}>
          <div>
            <h2 className={styles.footerInvite}>See you on the 7th</h2>
            <a className={styles.button} href={poster.src} download="codehaunt-poster.jpg">
              Download the poster
            </a>
          </div>
          <ul className={styles.socials}>
            <li>Instagram <span>csi.uemkolkata</span></li>
            <li>Facebook <span>csi.uemkolkata</span></li>
            <li>X <span>csi_uemkolkata</span></li>
            <li>LinkedIn <span>csi_uemkolkata</span></li>
          </ul>
        </div>
        <div className={`${styles.wrap} ${styles.legal}`}>
          <span>CSI Student Chapter, University of Engineering &amp; Management, Kolkata</span>
          <span>Venue: IEM Newtown Campus</span>
        </div>
        <p className={styles.bigName} aria-hidden>CodeHaunt</p>
      </footer>
    </div>
  );
}
