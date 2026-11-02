import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { judge } from '../src/judge.ts';
import { backend, cases, skipReason } from './helpers.ts';

describe('compile and run pipeline', () => {
  test('a correct program is accepted on every test', { skip: skipReason }, async () => {
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
int main(void) {
  int a, b;
  if (scanf("%d %d", &a, &b) != 2) return 1;
  printf("%d\\n", a + b);
  return 0;
}`,
      },
      tests: cases([
        ['2 3\n', '5\n'],
        ['10 -4\n', '6\n'],
        ['0 0\n', '0\n'],
      ]),
    });

    assert.equal(result.verdict, 'AC');
    assert.equal(result.testsPassed, 3);
    assert.equal(result.score, 1);
  });

  test('case differences do not fail a student', { skip: skipReason }, async () => {
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
int main(void) { printf("Hello World\\n"); return 0; }`,
      },
      tests: cases([['', 'hello world\n']]),
    });

    assert.equal(result.verdict, 'AC');
  });

  test('a wrong answer reports the first failing test', { skip: skipReason }, async () => {
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
int main(void) {
  int a, b;
  if (scanf("%d %d", &a, &b) != 2) return 1;
  printf("%d\\n", a - b);
  return 0;
}`,
      },
      tests: cases([
        ['2 2\n', '4\n'],
        ['5 1\n', '6\n'],
      ]),
    });

    assert.equal(result.verdict, 'WA');
    assert.equal(result.testsPassed, 0);
    assert.equal(result.results[0]?.outputExcerpt.trim(), '0');
  });

  test('partial credit in practice, all-or-nothing in tests', { skip: skipReason }, async () => {
    // Correct for even inputs only: passes 1 of 2.
    const source = `#include <stdio.h>
int main(void) {
  int n;
  if (scanf("%d", &n) != 1) return 1;
  printf("%d\\n", n % 2 == 0 ? n * 2 : 0);
  return 0;
}`;
    const tests = cases([
      ['4\n', '8\n'],
      ['3\n', '6\n'],
    ]);

    const practice = await judge(backend!, { program: { source }, tests, scoring: 'partial' });
    assert.equal(practice.testsPassed, 1);
    assert.equal(practice.score, 0.5);

    const graded = await judge(backend!, { program: { source }, tests, scoring: 'allOrNothing' });
    assert.equal(graded.testsPassed, 1);
    assert.equal(graded.score, 0, 'a graded test gives nothing for a partial solution');
  });

  test('a compile error yields CE with usable diagnostics', { skip: skipReason }, async () => {
    const result = await judge(backend!, {
      program: { source: `int main(void) { this is not C }` },
      tests: cases([['', '']]),
    });

    assert.equal(result.verdict, 'CE');
    assert.equal(result.testsPassed, 0);
    assert.match(result.compileLog, /error/i);
  });

  test('multi-line input and output are handled verbatim', { skip: skipReason }, async () => {
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
int main(void) {
  int n;
  if (scanf("%d", &n) != 1) return 1;
  for (int i = 0; i < n; i++) {
    int x;
    if (scanf("%d", &x) != 1) return 1;
    printf("line %d: %d\\n", i + 1, x * x);
  }
  return 0;
}`,
      },
      tests: cases([['3\n2\n3\n4\n', 'LINE 1: 4\nline 2: 9\nLine 3: 16\n']]),
    });

    assert.equal(result.verdict, 'AC');
  });
});
