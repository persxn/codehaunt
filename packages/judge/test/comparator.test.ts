import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  check,
  checkCaseInsensitive,
  checkFloat,
  checkStrictWhitespace,
  firstDifference,
} from '../src/comparator.ts';

test('case is ignored — the headline requirement', () => {
  assert.ok(checkCaseInsensitive('Hello World', 'hello world'));
  assert.ok(checkCaseInsensitive('HELLO WORLD', 'hello world'));
  assert.ok(checkCaseInsensitive('YES\nNO', 'yes\nno'));
});

test('trailing whitespace and trailing newlines are ignored', () => {
  assert.ok(checkCaseInsensitive('42   \n', '42'));
  assert.ok(checkCaseInsensitive('42\n\n\n', '42'));
  assert.ok(checkCaseInsensitive('42', '42\n'));
  assert.ok(checkCaseInsensitive('a\t\nb  ', 'a\nb'));
});

test('CRLF from a Windows-authored expected file still matches', () => {
  assert.ok(checkCaseInsensitive('line1\nline2', 'line1\r\nline2\r\n'));
});

test('interior whitespace and line structure still matter', () => {
  assert.ok(!checkCaseInsensitive('1 2', '1  2'), 'interior spacing is significant');
  assert.ok(!checkCaseInsensitive('1\n2', '1 2'), 'a newline is not a space');
  assert.ok(!checkCaseInsensitive('1\n2', '1\n2\n3'), 'a missing line fails');
  assert.ok(!checkCaseInsensitive('1\n\n2', '1\n2'), 'an interior blank line fails');
});

test('empty output only matches empty expectations', () => {
  assert.ok(checkCaseInsensitive('', ''));
  assert.ok(checkCaseInsensitive('\n\n', ''));
  assert.ok(!checkCaseInsensitive('', '0'));
});

test('strict checker keeps case and interior whitespace', () => {
  assert.ok(!checkStrictWhitespace('Hello', 'hello'));
  assert.ok(!checkStrictWhitespace('a  b', 'a b'));
  assert.ok(checkStrictWhitespace('a b\n', 'a b'), 'trailing newline is still forgiven');
  assert.ok(checkStrictWhitespace('a b\r\n', 'a b\n'), 'CRLF is still normalized');
});

test('float checker tolerates last-digit printf noise', () => {
  assert.ok(checkFloat('3.141592', '3.1415926535', 1e-5));
  assert.ok(!checkFloat('3.14', '3.1415926535', 1e-6));
  assert.ok(checkFloat('1e9', '1000000000.0000001'));
  assert.ok(checkFloat('area = 12.50', 'AREA = 12.5'), 'non-numeric tokens compare case-insensitively');
  assert.ok(!checkFloat('1 2', '1 2 3'), 'token count must match');
});

test('float checker accepts relative error on large magnitudes', () => {
  // Absolute diff is 100 but relative diff is 1e-7 — acceptable for a double.
  assert.ok(checkFloat('1000000000.0', '1000000100.0', 1e-6));
});

test('check() dispatches on configured checker kind', () => {
  assert.ok(check('YES', 'yes', { kind: 'caseInsensitive' }));
  assert.ok(!check('YES', 'yes', { kind: 'strictWhitespace' }));
  assert.ok(check('1.0000001', '1.0', { kind: 'float', tolerance: 1e-5 }));
});

test('firstDifference points at the diverging line for sample feedback', () => {
  const diff = firstDifference('1\n2\n9', '1\n2\n3');
  assert.deepEqual(diff, { line: 3, actual: '9', expected: '3' });
  assert.equal(firstDifference('a\nb', 'A\nB'), null);

  const missing = firstDifference('1', '1\n2');
  assert.equal(missing?.line, 2);
  assert.equal(missing?.actual, '<no line>');
});
