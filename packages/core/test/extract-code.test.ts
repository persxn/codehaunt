import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCode } from '../src/extract-code.ts';

// fence constants without using backticks
const F3 = '\x60\x60\x60'; // ```
const F4 = '\x60\x60\x60\x60'; // ````

test('single tagged block', () => {
  const reply = [
    'Here is some code:',
    `${F3}cpp`,
    'int main(){return 0;}',
    `${F3}`,
    'Enjoy!'
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('multiple cpp blocks, last one used', () => {
  const reply = [
    `${F3}cpp`,
    'int a(){return 1;}',
    `${F3}`,
    `${F3}cpp`,
    'int b(){return 2;}',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int b(){return 2;}' + '\n' });
});

test('cpp request with python block and untagged block => untagged', () => {
  const reply = [
    `${F3}python`,
    'print(42)',
    `${F3}`,
    `${F3}`,
    'console.log("hi");',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'console.log("hi");' + '\n' });
});

test('cpp request with only python block => no_code', () => {
  const reply = [
    `${F3}python`,
    'print("hello")',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: false, reason: 'no_code' });
});

test('c++ tag alias works', () => {
  const reply = [
    `${F3}c++`,
    'int main(){return 0;}',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('tilde fences ~~~ work', () => {
  const reply = [
    '~~~cpp',
    'int main(){return 0;}',
    '~~~',
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('unclosed final fence runs to end', () => {
  const reply = [
    `${F3}cpp`,
    'int main(){return 0;}',
    // no closing fence
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('CRLF line endings are handled', () => {
  const reply = [
    `${F3}cpp`,
    'int main(){return 0;}',
    `${F3}`,
  ].join('\r\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('empty block is ignored', () => {
  const reply = [
    `${F3}cpp`,
    '   ',
    `${F3}`,
    `${F3}cpp`,
    'int main(){return 0;}',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('too_large block returns too_large', () => {
  const large = 'a'.repeat(70 * 1024);
  const reply = [
    `${F3}cpp`,
    large,
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: false, reason: 'too_large' });
});

test('4-backtick fence containing triple backticks inside body', () => {
  const reply = [
    `${F4}cpp`,
    'int main(){',
    '  console.log(' + F3 + ');',
    '}',
    `${F4}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  const expectedSource = 'int main(){\n  console.log(' + F3 + ');\n}' + '\n';
  assert.deepEqual(result, { ok: true, source: expectedSource });
});

test('fence with up to three leading spaces works', () => {
  const reply = [
    '   ' + F3 + 'cpp',
    'int main(){return 0;}',
    '   ' + F3,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('trailing whitespace trimmed and newline added', () => {
  const reply = [
    `${F3}cpp`,
    'int main(){return 0;}   ',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});

test('untagged block only returns code when no matching tags', () => {
  const reply = [
    `${F3}`,
    'int main(){return 0;}',
    `${F3}`,
  ].join('\n');
  const result = extractCode(reply, 'cpp');
  assert.deepEqual(result, { ok: true, source: 'int main(){return 0;}' + '\n' });
});


