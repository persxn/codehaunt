import { CodeIcon, LockIcon, MicIcon, ScanIcon, TrophyIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import archCompetition from './arch-competition.webp';
import archTalk from './arch-talk.webp';
import { DAY, STEPS } from './content';
import styles from './sections.module.css';

export function HowItWorks() {
  return (
    <section id="how" className={ui.section} aria-labelledby="how-title">
      <div className={ui.container}>
        <header className={styles.head} data-reveal>
          <h2 id="how-title" className={ui.title}>How it works</h2>
          <p className={ui.lead}>
            The junior writes all the code. You decide what it writes, and every word you send comes out of a fixed
            token budget.
          </p>
        </header>
        <ol className={styles.steps}>
          {STEPS.map((s) => (
            <li key={s.title} className={styles.step} data-reveal>
              <div className={`${ui.arch} ${styles.stepArch}`}>
                <img src={s.art.src} width={s.art.width} height={s.art.height} alt={s.alt} loading="lazy" />
              </div>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepText}>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Halves() {
  const halves = [
    {
      title: 'AI Coding Competition',
      text: 'Data-structure problems in Python, C, C++ or Java, solved only by instructing the junior. Correct answers, lean prompts and sound reasoning all score.',
      art: archCompetition,
      alt: 'Poster art: a hooded skeleton typing on a laptop under an orange moon',
    },
    {
      title: 'Tech Talk',
      text: 'The other half of the day: a talk from the stage. Follow csi.uemkolkata for the speaker and the topic.',
      art: archTalk,
      alt: 'Poster art: a skeleton speaker at a lectern in a candlelit gothic hall',
    },
  ];
  return (
    <section className={`${ui.section} ${styles.halvesBand}`} aria-labelledby="halves-title">
      <div className={ui.container}>
        <h2 id="halves-title" className={`${ui.title} ${styles.center}`} data-reveal>
          One day, two halves
        </h2>
        <div className={styles.halves}>
          {halves.map((h) => (
            <article key={h.title} className={styles.half} data-reveal>
              <div className={`${ui.arch} ${styles.halfArch}`}>
                <img className={styles.halfImg} src={h.art.src} width={h.art.width} height={h.art.height} alt={h.alt} loading="lazy" />
              </div>
              <div>
                <h3 className={styles.halfTitle}>{h.title}</h3>
                <p className={styles.halfText}>{h.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const DAY_ICONS = { scan: ScanIcon, lock: LockIcon, code: CodeIcon, mic: MicIcon, trophy: TrophyIcon };

export function TheDay() {
  return (
    <section id="day" className={ui.section} aria-labelledby="day-title">
      <div className={ui.container}>
        <header className={styles.head} data-reveal>
          <h2 id="day-title" className={ui.title}>The day</h2>
          <p className={ui.lead}>Doors open at 10 AM. From the desk to the leaderboard, in order.</p>
        </header>
        <ol className={styles.track}>
          {DAY.map((d) => {
            const Icon = DAY_ICONS[d.icon];
            return (
              <li key={d.title} className={styles.stop} data-reveal>
                <span className={styles.stopIcon}>
                  <Icon />
                </span>
                <h3 className={styles.stopTitle}>{d.title}</h3>
                <p className={styles.stopText}>{d.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
