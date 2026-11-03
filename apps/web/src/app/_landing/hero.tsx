import { EVENT } from '../_public/event';
import { ArrowDownIcon, CalendarIcon, ClockIcon, PinIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import { Countdown } from './countdown';
import heroPhone from './hero-lab-phone.webp';
import heroLab from './hero-lab.webp';
import bat from './icon-bat.webp';
import styles from './hero.module.css';

export function Hero({ calendar }: { calendar: string }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.bats} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <img key={i} src={bat.src} width={bat.width} height={bat.height} alt="" />
        ))}
      </div>
      <p className={styles.rail} aria-hidden>
        Dare to break the code, unleash the chaos
      </p>

      <div className={`${ui.container} ${styles.layout}`}>
      <div className={styles.content}>
        <h1 id="hero-title" className={styles.wordmark}>
          <span className={styles.line1}>Code</span>
          <span className={styles.line2}>Haunt</span>
        </h1>
        <p className={styles.lede}>
          An AI coding competition and a tech talk. Solve problems by directing an AI junior developer, one prompt at a
          time.
        </p>

        <ul className={styles.facts}>
          <li>
            <CalendarIcon />
            <time dateTime="2026-11-07">{EVENT.dateLabel}</time>
          </li>
          <li>
            <ClockIcon />
            <time dateTime="2026-11-07T10:00+05:30">{EVENT.timeLabel}</time>
          </li>
          <li>
            <PinIcon />
            <span>{EVENT.venue}</span>
          </li>
        </ul>

        <Countdown />

        <div className={styles.actions}>
          <a className={`${ui.btn} ${ui.primary}`} href={calendar} download="codehaunt.ics">
            <CalendarIcon />
            Add to calendar
          </a>
          <a className={`${ui.btn} ${ui.secondary}`} href="#how">
            How it works
            <ArrowDownIcon />
          </a>
        </div>
      </div>
      <picture className={styles.art}>
        <source media="(max-width: 899px)" srcSet={heroPhone.src} width={heroPhone.width} height={heroPhone.height} />
        <img
          src={heroLab.src}
          width={heroLab.width}
          height={heroLab.height}
          alt="The hooded skeleton coder at his laptop in a candlelit gothic computer lab under an orange moon"
          fetchPriority="high"
        />
      </picture>
      </div>
    </section>
  );
}
