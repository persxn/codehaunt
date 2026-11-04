import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  saveBursts,
  shownCodeLines,
  aiCopy,
  codeHeavyQuestions,
  SAVE_BURST_CHARS,
} from '../src/integrity-flags.ts';

// helper to generate source strings of given length
function src(n: number): string {
  return 'x'.repeat(n);
}

// 1. typing normally
test('saveBursts normal typing', () => {
  const saves = [
    { atMs: 0, source: src(100) },
    { atMs: 20000, source: src(200) },
    { atMs: 40000, source: src(300) },
    { atMs: 60000, source: src(400) },
  ];
  assert.deepEqual(saveBursts(saves), []);
});

// 2. burst
test('saveBursts burst detection', () => {
  const saves = [
    { atMs: 0, source: src(100) },
    { atMs: 20000, source: src(600) },
  ];
  assert.deepEqual(saveBursts(saves), [20000]);
});

// 3. slow growth: typing for a minute autosaves every 20 s (R15-2: a single +500 save is no longer "slow")
test('saveBursts slow growth not flagged', () => {
  const saves = [
    { atMs: 0, source: src(100) },
    { atMs: 20000, source: src(260) },
    { atMs: 40000, source: src(420) },
    { atMs: 60000, source: src(600) },
  ];
  assert.deepEqual(saveBursts(saves), []);
});

// 4. first save large
test('saveBursts first large save flagged', () => {
  const saves = [{ atMs: 5000, source: src(500) }];
  assert.deepEqual(saveBursts(saves), [5000]);
});

// 5. restore case
test('saveBursts restore does not flag later growth', () => {
  const saves = [
    { atMs: 0, source: src(1100) },
    { atMs: 10000, source: src(100) },
    { atMs: 20000, source: src(1100) }, // same as first save
  ];
  assert.deepEqual(saveBursts(saves), [0]);
});

// 6. unsorted input and immutability
test('saveBursts unsorted input preserves original array', () => {
  const original = [
    { atMs: 20000, source: src(600) },
    { atMs: 0, source: src(100) },
  ];
  const copy = JSON.parse(JSON.stringify(original));
  const result = saveBursts(original);
  assert.deepEqual(result, [20000]);
  assert.deepEqual(original, copy, 'input array must not be mutated');
});

// Helper to build fenced reply with given lines
function fenced(lines: string[]): string {
  return ['```cpp', ...lines, '```'].join('\n');
}

// 7. aiCopy flagged
test('aiCopy flagged when many lines copied', () => {
  const lines = [
    'int n = read();',
    'long long total = 0;',
    'vector<int> a(n);',
    'for (int i = 0; i < n; i++) {',
    'total += a[i] * 2;',
    'printf("%lld", total);',
  ];
  const replies = [fenced(lines)];
  const finalCode = lines.join('\n');
  const res = aiCopy(finalCode, replies);
  assert.deepEqual(res, { copiedLines: 6, totalLines: 6, flagged: true });
});

// 8. aiCopy one matching line
test('aiCopy single matching line not flagged', () => {
  const replies = [fenced(['long long total = 0;'])];
  const matching = 'long long total = 0;';
  const other = [
    'int a = 1;',
    'int b = 2;',
    'int c = 3;',
    'int d = 4;',
    'int e = 5;',
  ];
  const finalCode = [matching, ...other].join('\n');
  const res = aiCopy(finalCode, replies);
  assert.deepEqual(res, { copiedLines: 1, totalLines: 6, flagged: false });
});

// 9. whitespace normalization
test('aiCopy whitespace normalized matches', () => {
  const replies = [fenced(['long long total = 0;'])];
  const finalLine = '   long   long  total =   0;';
  const other = 'int x = 42;';
  const finalCode = [finalLine, other].join('\n');
  const res = aiCopy(finalCode, replies);
  assert.deepEqual(res, { copiedLines: 1, totalLines: 2, flagged: false });
});

// 10. short lines ignored
test('aiCopy short lines ignored', () => {
  const replies = [fenced(['}', 'x = 1;'])];
  const finalCode = '}\nx = 1;';
  const res = aiCopy(finalCode, replies);
  assert.deepEqual(res, { copiedLines: 0, totalLines: 0, flagged: false });
});

// 11. shownCodeLines behavior
test('shownCodeLines extracts correctly', () => {
  const reply = [
    'Here is some text.',
    'int x = 5;',
    '```',
    'int y = 6;',
    '',
    'void foo() {}',
    '```',
    'Another line.',
  ].join('\n');
  const lines = shownCodeLines([reply]);
  // should contain the unfenced code line and the two fenced lines (non-blank)
  assert.deepEqual(lines, ['int x = 5;', 'int y = 6;', 'void foo() {}']);
});

// 12. codeHeavyQuestions detection
test('codeHeavyQuestions identifies heavy code question', () => {
  const fiveLineC = '#include <stdio.h>\nint main() {\n  int n;\n  scanf("%d", &n);\n  return 0;\n}';
  const mixed = 'Why is my loop wrong?\nint i = 0;\nI think it runs too many times.\nCan you explain the bound?';
  const questions = [
    'How do prefix sums work for range queries?',
    fiveLineC,
    mixed,
  ];
  const res = codeHeavyQuestions(questions);
  assert.deepEqual(res, [1]);
});

test('audit R14-2/R15-2: idling before a paste does not hide it; fast sustained typing is caught; normal typing is not', () => {
  const base = 'x'.repeat(100);
  const grow = (n: number) => base + 'y'.repeat(n);
  assert.deepEqual(saveBursts([{ atMs: 0, source: base }, { atMs: 40_000, source: grow(2400) }]), [40_000], '2400 chars after a 40 s idle');
  assert.deepEqual(saveBursts([{ atMs: 0, source: base }, { atMs: 4 * 60_000, source: grow(2400) }]), [240_000], 'after a 4-minute idle too (R15-2)');
  // 390 chars per autosave (19.5 chars/s): each save is under 400, the minute is not.
  const fast = Array.from({ length: 4 }, (_, k) => ({ atMs: (k + 1) * 20_000, source: grow(390 * (k + 1)) }));
  assert.ok(saveBursts([{ atMs: 0, source: base }, ...fast]).length > 0, 'sustained 20 chars/s');
  // 100 chars per autosave (5 chars/s) for ten minutes: never flagged.
  const normal = Array.from({ length: 30 }, (_, k) => ({ atMs: (k + 1) * 20_000, source: grow(100 * (k + 1)) }));
  assert.deepEqual(saveBursts([{ atMs: 0, source: base }, ...normal]), []);
});

// Audit R16-1: a shown example wrapped in backticks or numbered still matches the same line in the final code.
test('aiCopy matches lines shown wrapped in backticks or numbered', () => {
  const code = ['n, q = map(int, input().split())', 'a = list(map(int, input().split()))', 'p = [0] * (n + 1)'];
  for (const reply of [code.map((l) => '`' + l + '`').join('\n'), code.map((l, i) => `${i + 1}. ${l}`).join('\n'), code.map((l) => `> ${l}`).join('\n')]) {
    const res = aiCopy(code.join('\n') + '\nprint(sum(a))', [reply]);
    assert.equal(res.copiedLines, 3, reply);
    assert.equal(res.flagged, true, reply);
  }
});

test('shownCodeLines sees code inside a quoted fence', () => {
  const reply = '> ```python\n> total = 0\n> ```';
  assert.deepEqual(shownCodeLines([reply]), ['> total = 0']);
});
