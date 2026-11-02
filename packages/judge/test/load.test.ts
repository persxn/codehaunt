/**
 * Load behaviour under a realistic worst case: the whole class submitting at
 * once, which is exactly what happens in the closing minute of a graded test.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { judge } from '../src/judge.ts';
import { JudgeQueue } from '../src/queue.ts';
import { backend, cases, skipReason } from './helpers.ts';

const CLASS_SIZE = 60;

describe('sixty concurrent submissions', () => {
  test('every submission gets a correct verdict', { skip: skipReason }, async () => {
    const queue = new JudgeQueue();

    // A program that does real work, so the run is not dominated by process
    // startup and contention would actually show up as inflated timings.
    const source = (studentIndex: number) => `#include <stdio.h>
int main(void) {
  int n;
  if (scanf("%d", &n) != 1) return 1;
  long long total = 0;
  for (int i = 1; i <= n; i++) total += (long long)i * ${studentIndex % 3 === 0 ? 1 : 1};
  printf("%lld\\n", total);
  return 0;
}`;

    const tests = cases([
      ['1000\n', '500500\n'],
      ['1\n', '1\n'],
      ['100000\n', '5000050000\n'],
    ]);

    const started = Date.now();
    const results = await queue.runAll(
      Array.from({ length: CLASS_SIZE }, (_, i) => () =>
        judge(backend!, {
          program: { source: source(i) },
          tests,
          limits: { timeLimitMs: 2000, memoryLimitMb: 256, outputLimitBytes: 65536, pidLimit: 64 },
        }),
      ),
    );
    const elapsedMs = Date.now() - started;

    assert.equal(results.length, CLASS_SIZE);

    const verdicts = new Map<string, number>();
    for (const result of results) {
      verdicts.set(result.verdict, (verdicts.get(result.verdict) ?? 0) + 1);
    }

    assert.equal(
      verdicts.get('AC'),
      CLASS_SIZE,
      `every correct submission must be accepted; got ${JSON.stringify([...verdicts])}`,
    );

    // The real risk this test exists to catch: a correct solution judged TLE
    // because the machine was busy rather than because the code was slow.
    const slowest = Math.max(...results.map((r) => r.maxTimeMs));
    assert.ok(
      slowest < 2000,
      `no submission should approach the time limit under load; slowest was ${slowest}ms`,
    );

    console.log(
      `      ${CLASS_SIZE} submissions x ${tests.length} tests in ${elapsedMs}ms ` +
        `at concurrency ${queue.concurrency} (slowest single test ${slowest}ms)`,
    );
  });

  test('the queue never exceeds its concurrency ceiling', async () => {
    const queue = new JudgeQueue({ concurrency: 4 });
    let peak = 0;

    await queue.runAll(
      Array.from({ length: 50 }, () => async () => {
        peak = Math.max(peak, queue.running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 0;
      }),
    );

    assert.ok(peak <= 4, `peak concurrency was ${peak}, ceiling is 4`);
    assert.equal(queue.running, 0, 'the queue drains completely');
    assert.equal(queue.queued, 0);
  });
});
