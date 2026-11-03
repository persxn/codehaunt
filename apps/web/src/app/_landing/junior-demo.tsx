'use client';

import { useState } from 'react';

import { CheckIcon, CrossIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import styles from './demo.module.css';

/**
 * The live thing (ADR-030/031): choose how you instruct the junior and see what it writes, what the judge says and
 * what it cost. A worked example of ADR-018's persona (plain defaults unless told), not a call to any model.
 * Code lines are [text, highlighted type] pairs so the deciding type stands out.
 */
const TAKES = {
  vague: {
    label: 'Vague',
    prompt: 'Add up all the numbers.',
    code: [
      ['int n; cin >> n;', null],
      ['int sum = 0;', 'int'],
      ['for (int i = 0; i < n; i++) {', null],
      ['  int x; cin >> x;', 'int'],
      ['  sum += x;', null],
      ['}', null],
      ['cout << sum;', null],
    ],
    verdict: 'Wrong answer on hidden test 7',
    note: 'The values reach 10^18. An int overflows long before that, and fixing it costs another prompt.',
    tokens: 214,
    ok: false,
  },
  precise: {
    label: 'Precise',
    prompt: 'Read n, then n integers up to 10^18. Sum them in a long long and print it.',
    code: [
      ['int n; cin >> n;', null],
      ['long long sum = 0;', 'long long'],
      ['for (int i = 0; i < n; i++) {', null],
      ['  long long x; cin >> x;', 'long long'],
      ['  sum += x;', null],
      ['}', null],
      ['cout << sum;', null],
    ],
    verdict: 'Accepted on every hidden test',
    note: 'One clear instruction, one run. The tokens you saved go to the next problem.',
    tokens: 96,
    ok: true,
  },
} as const;

type Take = keyof typeof TAKES;
const BUDGET = 400;

function Line({ text, mark }: { text: string; mark: string | null }) {
  if (!mark) return <>{text}</>;
  const at = text.indexOf(mark);
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.type}>{mark}</mark>
      {text.slice(at + mark.length)}
    </>
  );
}

export function JuniorDemo() {
  const [take, setTake] = useState<Take>('vague');
  const t = TAKES[take];

  return (
    <section className={ui.section} aria-labelledby="demo-title">
      <div className={`${ui.container} ${styles.frame}`}>
        <div className={styles.panel}>
          <div className={styles.copy}>
            <h2 id="demo-title" className={ui.title} data-reveal>Say what you mean</h2>
            <p className={ui.lead} data-reveal>
              Leave a choice open and the junior takes the plain default. Here the default is an <code>int</code>, and
              the answer needed a <code>long long</code>. Try both instructions.
            </p>

            <div className={styles.toggle} role="radiogroup" aria-label="How you instruct the junior" data-reveal>
              {(Object.keys(TAKES) as Take[]).map((key) => (
                <label key={key} className={styles.option} data-active={key === take || undefined}>
                  <input type="radio" name="junior-take" value={key} checked={key === take} onChange={() => setTake(key)} />
                  {TAKES[key].label}
                </label>
              ))}
            </div>

            <figure className={styles.bubble} key={take}>
              <figcaption>You, to the junior</figcaption>
              <blockquote>&ldquo;{t.prompt}&rdquo;</blockquote>
            </figure>
          </div>

          <div className={styles.editor} aria-live="polite">
            <div className={styles.tabs}>
              <span className={styles.tab}>sum.cpp</span>
              <span className={styles.by}>written by the junior</span>
            </div>
            <pre className={styles.code} key={take}>
              <code>
                {t.code.map(([text, mark], i) => (
                  <span key={i} className={styles.line}>
                    <Line text={text} mark={mark} />
                  </span>
                ))}
              </code>
            </pre>
            <div className={styles.result}>
              <p className={styles.verdict} data-ok={t.ok || undefined} key={take}>
                {t.ok ? <CheckIcon /> : <CrossIcon />}
                {t.verdict}
              </p>
              <p className={styles.note}>{t.note}</p>
              <div className={styles.meter}>
                <div className={styles.meterHead}>
                  <span>Tokens spent</span>
                  <span>
                    <strong>{t.tokens}</strong> of {BUDGET} (example budget)
                  </span>
                </div>
                <div
                  className={styles.bar}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={BUDGET}
                  aria-valuenow={t.tokens}
                  aria-label="Tokens spent"
                >
                  <span style={{ transform: `scaleX(${t.tokens / BUDGET})` }} data-ok={t.ok || undefined} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
