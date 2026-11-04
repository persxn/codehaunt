import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createReplyFilter, filterReply, looksLikeCode, REMOVED_EXAMPLE } from '../src/reply-filter.ts';

const F = '\x60\x60\x60'; // ```
const lines = (n: number, make = (i: number) => `x${i} = ${i};`) => Array.from({ length: n }, (_, i) => make(i));

/** Feeds the reply in uneven chunks, as a stream would. */
function streamed(text: string, maxLines: number, size = 7): string {
  const f = createReplyFilter(maxLines);
  let out = '';
  for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
  return out + f.end();
}

test('prose passes through unchanged', () => {
  const text = 'An int holds up to about 2.1 x 10^9.\n\nUse a 64-bit type for large sums.';
  assert.equal(filterReply(text, 6), text);
});

test('a fenced example of 6 lines is shown', () => {
  const text = ['Like this:', `${F}cpp`, ...lines(6), F, 'Done.'].join('\n');
  assert.equal(filterReply(text, 6), text);
});

test('a fenced block of 7 lines is replaced, prose around it kept', () => {
  const text = ['Here:', `${F}cpp`, ...lines(7), F, 'That is all.'].join('\n');
  assert.equal(filterReply(text, 6), `Here:\n${REMOVED_EXAMPLE}\nThat is all.`);
});

test('an unfenced run of 7 code lines is replaced', () => {
  const text = ['Try:', ...lines(7), 'Good luck.'].join('\n');
  assert.equal(filterReply(text, 6), `Try:\n${REMOVED_EXAMPLE}\nGood luck.`);
});

test('the limit is per reply: two 4-line examples show only the first', () => {
  const text = [`${F}`, ...lines(4), F, 'and', `${F}`, ...lines(4), F].join('\n');
  assert.equal(filterReply(text, 6), [`${F}`, ...lines(4), F, 'and', REMOVED_EXAMPLE, ''].join('\n'));
});

test('one long line of code counts by characters', () => {
  const oneLiner = 'for(int i=0;i<n;i++){' + 's+=a[i];'.repeat(80) + '}';
  assert.equal(filterReply(`${F}\n${oneLiner}\n${F}`, 6), `${REMOVED_EXAMPLE}\n`);
});

test('streaming gives the same text as the whole reply, and never leaks a removed block', () => {
  const text = ['Intro line.', `${F}py`, ...lines(9), F, 'Middle.', ...lines(3), '', 'End.'].join('\n');
  for (const size of [1, 3, 7, 50]) assert.equal(streamed(text, 6, size), filterReply(text, 6));
  const f = createReplyFilter(6);
  const early = f.push(['Intro.', `${F}`, ...lines(6)].join('\n') + '\n');
  assert.equal(early, 'Intro.\n', 'a block is held until it closes or passes the limit');
});

test('an unclosed fence that fits is shown at the end', () => {
  const text = `${F}\n${lines(2).join('\n')}`;
  assert.equal(filterReply(text, 6), text);
});

test('blank lines inside a code run do not split it', () => {
  const text = [...lines(4), '', ...lines(4), 'Prose.'].join('\n');
  assert.equal(filterReply(text, 6), `${REMOVED_EXAMPLE}\nProse.`);
});

test('code detection', () => {
  for (const code of ['int x = 0;', '#include <bits/stdc++.h>', 'for (int i = 0; i < n; i++)', 'def solve(n):', 'if n > 0:', 'total += x', 'cout << sum;', '}'])
    assert.ok(looksLikeCode(code), code);
  for (const prose of ['An int holds up to 2.1 billion.', 'For example, think about overflow.', 'Why does it fail?', ''])
    assert.ok(!looksLikeCode(prose), prose);
});
