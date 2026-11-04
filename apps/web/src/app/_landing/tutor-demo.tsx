'use client';

import { useState } from 'react';

import { CheckIcon, CrossIcon } from '../_public/icons';
import ui from '../_public/public.module.css';
import styles from './demo.module.css';

/**
 * The live thing (ADR-030/031, game per ADR-033/034): you write the code, the AI tutor explains. Choose how you ask
 * and see what the tutor says, what your code becomes and what it cost. A worked example, not a call to any model.
 * Code lines are [text, highlighted type] pairs so the deciding type stands out.
 */
const TAKES = {
  answer: {
    label: 'Ask for the answer',
    question: 'Just write the code that sums the numbers for me.',
    reply: 'That part is yours to write. Tell me what you tried and where it breaks, and I can explain the idea behind it.',
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
    note: 'No help, and the wrong submission cost 20% of the problem’s value. Every further wrong try costs another 20%.',
    tokens: 120,
    ok: false,
  },
  idea: {
    label: 'Ask about the idea',
    question: 'My sum works on the samples but fails when the values get huge. Why could int be wrong here?',
    reply: 'An int holds up to about 2.1 × 10^9. A total of values up to 10^18 needs a 64-bit type, e.g.',
    example: 'long long total = 0;',
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
    note: 'One clear question, and you fixed it yourself. The tokens you saved go to the next problem.',
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

export function TutorDemo() {
  const [take, setTake] = useState<Take>('answer');
  const t = TAKES[take];

  return (
    <section className={ui.section} aria-labelledby="demo-title">
      <div className={`${ui.container} ${styles.frame}`}>
        <div className={styles.panel}>
          <div className={styles.copy}>
            <h2 id="demo-title" className={ui.title} data-reveal>Ask the right question</h2>
            <p className={ui.lead} data-reveal>
              You write every line. The tutor explains ideas and never writes your solution. Here the code used an{' '}
              <code>int</code>, and the answer needed a <code>long long</code>. Try both questions.
            </p>

            <div className={styles.toggle} role="radiogroup" aria-label="How you ask the tutor" data-reveal>
              {(Object.keys(TAKES) as Take[]).map((key) => (
                <label key={key} className={styles.option} data-active={key === take || undefined}>
                  <input type="radio" name="tutor-take" value={key} checked={key === take} onChange={() => setTake(key)} />
                  {TAKES[key].label}
                </label>
              ))}
            </div>

            <figure className={styles.bubble} key={`q-${take}`}>
              <figcaption>You, to the tutor</figcaption>
              <blockquote>&ldquo;{t.question}&rdquo;</blockquote>
            </figure>
            <figure className={`${styles.bubble} ${styles.reply}`} key={`a-${take}`}>
              <figcaption>The tutor</figcaption>
              <blockquote>
                {t.reply}
                {'example' in t && (
                  <>
                    {' '}
                    <code>{t.example}</code>
                  </>
                )}
              </blockquote>
            </figure>
          </div>

          <div className={styles.editor} aria-live="polite">
            <div className={styles.tabs}>
              <span className={styles.tab}>sum.cpp</span>
              <span className={styles.by}>typed by you</span>
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
                  <span>Tutor tokens spent</span>
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
                  aria-label="Tutor tokens spent"
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
