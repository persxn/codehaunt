/** ADR-046: with 0 code lines (the default) the tutor prompt forbids all code and never says "at most 0 lines". */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EventConfig } from '@codehaunt/contracts';

import { systemPrompt } from '../src/server/system-prompt.ts';

test('default event config allows no code lines', () => {
  assert.equal(EventConfig.shape.model.shape.maxExampleLines.parse(undefined), 0);
});

for (const version of ['tutor-v1', 'tutor-v2']) {
  test(`${version}: 0 lines → words-only rule, no example bullet`, () => {
    const text = systemPrompt(version, 'python', 0);
    assert.match(text, /Never write code of any kind/);
    assert.doesNotMatch(text, /at most 0|\{maxLines\}|tiny example/);
  });
  test(`${version}: 3 lines keeps the example bullet`, () => {
    const text = systemPrompt(version, 'python', 3);
    assert.match(text, /at most 3 lines/);
    assert.doesNotMatch(text, /Never write code of any kind/);
  });
}
