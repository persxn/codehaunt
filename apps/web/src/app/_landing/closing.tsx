import { EVENT } from '../_public/event';
import hood from '../_public/hood.webp';
import { CalendarIcon, DownloadIcon, PlusIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import coderAsleep from './coder-asleep.webp';
import { FAQ } from './content';
import divider from './divider.webp';
import ghostsBanner from './ghosts-banner.webp';
import poster from './poster.jpg';
import styles from './closing.module.css';

export function Faq() {
  return (
    <section id="faq" className={`${ui.section} ${styles.faqBand}`} aria-labelledby="faq-title">
      <div className={`${ui.container} ${styles.faq}`}>
        <div className={styles.faqAside}>
          <h2 id="faq-title" className={ui.title} data-reveal>Before you come</h2>
          <p className={ui.lead} data-reveal>
            Anything else, ask CSI UEM Kolkata on Instagram at <strong>@csi.uemkolkata</strong>.
          </p>
          <div className={`${ui.arch} ${styles.faqArch}`} data-reveal>
            <img src={coderAsleep.src} width={coderAsleep.width} height={coderAsleep.height} alt="The skeleton coder asleep on his closed laptop beside a candle" loading="lazy" />
          </div>
        </div>
        <div className={styles.list}>
          {FAQ.map((f, i) => (
            <details key={f.q} name="faq" className={styles.item} open={i === 0} data-reveal>
              <summary className={styles.q}>
                <span>{f.q}</span>
                <PlusIcon className={styles.plus} />
              </summary>
              <p className={styles.a}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ calendar }: { calendar: string }) {
  return (
    <section className={`${ui.section} ${styles.cta}`} aria-labelledby="cta-title">
      <div className={ui.container}>
        <div className={styles.banner} data-reveal>
          <img src={ghostsBanner.src} width={ghostsBanner.width} height={ghostsBanner.height} alt="" loading="lazy" />
          <h2 id="cta-title" className={styles.bannerText}>
            See you on the 7th
          </h2>
        </div>
        <p className={styles.ctaLine} data-reveal>
          {EVENT.dateLabel} · {EVENT.timeLabel} · {EVENT.venue}
        </p>
        <div className={styles.ctaActions} data-reveal>
          <a className={`${ui.btn} ${ui.primary}`} href={calendar} download="codehaunt.ics">
            <CalendarIcon />
            Add to calendar
          </a>
          <a className={`${ui.btn} ${ui.secondary}`} href={poster.src} download="codehaunt-poster.jpg">
            <DownloadIcon />
            Download the poster
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className={styles.footer}>
      <img className={styles.divider} src={divider.src} width={divider.width} height={divider.height} alt="" loading="lazy" />
      <div className={`${ui.container} ${styles.footRow}`}>
        <div className={styles.footBrand}>
          <img src={hood.src} width={48} height={48} alt="" />
          <div>
            <p className={styles.footName}>CodeHaunt</p>
            <p className={styles.footMeta}>Presented by the {EVENT.organiser}</p>
            <p className={styles.footMeta}>
              Powered by {EVENT.poweredBy[0]}, {EVENT.poweredBy[1]}
            </p>
          </div>
        </div>
        <div className={styles.footCol}>
          <h2 className={styles.footLabel}>When &amp; where</h2>
          <p className={styles.footText}>
            {EVENT.dateLabel}
            <br />
            {EVENT.timeLabel}
            <br />
            {EVENT.venue}
          </p>
        </div>
        <div className={styles.footCol}>
          <h2 className={styles.footLabel}>Follow CSI UEM Kolkata</h2>
          <ul className={styles.socials}>
            {EVENT.socials.map((s) => (
              <li key={s.network}>
                <span>{s.network}</span>
                {s.handle}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={ui.container} aria-hidden>
        <p className={styles.bigName}>CodeHaunt</p>
      </div>
    </footer>
  );
}
