'use client';

import { useState } from 'react';

import styles from '../landing.module.css';

/**
 * The live thing (ADR-030): pick how you direct the junior and see what it writes, what the judge says and what it
 * cost. A worked example of ADR-018's persona (plain defaults unless told), not a call to any model.
 */
const TAKES = {
  vague: {
    label: 'Vague',
    prompt: 'Add up all the numbers.',
    code: `int n; cin >> n;
int sum = 0;   // default: int
for (int i = 0; i < n; i++) {
  int x; cin >> x;
  sum += x;
}
cout << sum;`,
    verdict: 'Wrong answer on hidden test 7',
    note: 'The values reach 10^18. An int overflows long before that, and fixing it costs another prompt.',
    tokens: 214,
    ok: false,
  },
  precise: {
    label: 'Precise',
    prompt: 'Read n, then n integers up to 10^18. Sum them in a long long and print it.',
    code: `int n; cin >> n;
long long sum = 0;
for (int i = 0; i < n; i++) {
  long long x; cin >> x;
  sum += x;
}
cout << sum;`,
    verdict: 'Accepted',
    note: 'One clear instruction, one run. The tokens you saved go to the next problem.',
    tokens: 96,
    ok: true,
  },
} as const;

type Take = keyof typeof TAKES;
const BUDGET = 400;

export function JuniorDemo() {
  const [take, setTake] = useState<Take>('vague');
  const t = TAKES[take];
  const left = Math.max(0, 1 - t.tokens / BUDGET);

  return (
    <div className={styles.demo}>
      <div>
      <h3 id="junior-take" className={styles.demoLegend}>Tell the junior</h3>
      <div className={styles.demoPick} role="radiogroup" aria-labelledby="junior-take">
        {(Object.keys(TAKES) as Take[]).map((key) => (
          <label key={key} className={styles.demoOption} data-active={key === take || undefined}>
            <input
              type="radio"
              name="junior-take"
              value={key}
              checked={key === take}
              onChange={() => setTake(key)}
            />
            <span className={styles.demoOptionLabel}>{TAKES[key].label}</span>
            <span className={styles.demoPrompt}>&ldquo;{TAKES[key].prompt}&rdquo;</span>
          </label>
        ))}
      </div>
      </div>

      <div className={styles.demoResult} aria-live="polite">
        <pre className={styles.demoCode} key={take}>
          <code>{t.code}</code>
        </pre>
        <div className={styles.demoVerdictRow}>
          <p className={styles.demoVerdict} data-ok={t.ok || undefined}>
            {t.verdict}
          </p>
          <div
            className={styles.candle}
            style={{ ['--wax' as string]: 0.15 + left * 0.85 }}
            aria-label={`${t.tokens} of ${BUDGET} example tokens spent`}
            role="img"
          >
            <span className={styles.candleFlame} aria-hidden />
            <span className={styles.candleWax} aria-hidden />
          </div>
        </div>
        <p className={styles.demoNote}>
          {t.note} <strong>{t.tokens} tokens</strong> spent.
        </p>
      </div>
    </div>
  );
}
