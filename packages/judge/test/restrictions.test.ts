import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  bannedKeywordMessage,
  enforceableKeywords,
  findBannedKeywords,
  isBannableKeyword,
  stripNonCode,
} from '../src/restrictions.ts';
import { definesMain } from '../src/harness.ts';

describe('what may be banned', () => {
  test('language keywords are allowed', () => {
    assert.equal(isBannableKeyword('for'), true);
    assert.equal(isBannableKeyword('switch'), true);
  });

  test('identifiers are not', () => {
    // A teacher who could ban `i` would make a question unsolvable in a way no
    // student could debug, and banning a function name is a promise this cannot
    // keep — a call can always be built through a pointer.
    assert.equal(isBannableKeyword('i'), false);
    assert.equal(isBannableKeyword('printf'), false);
    assert.equal(isBannableKeyword(''), false);
  });
});

describe('finding banned keywords', () => {
  test('catches the construct the question was meant to rule out', () => {
    const code = 'int total = 0;\nfor (int i = 0; i < n; i++) total += i;\n';
    assert.deepEqual(findBannedKeywords(code, ['for']), ['for']);
  });

  test('reports every one at once rather than the first', () => {
    const code = 'if (n > 0) { for (int i = 0; i < n; i++) puts("x"); }';
    assert.deepEqual(findBannedKeywords(code, ['for', 'if']), ['for', 'if']);
  });

  test('nothing banned means nothing found', () => {
    assert.deepEqual(findBannedKeywords('for (;;) {}', []), []);
  });

  test('a longer word containing the keyword is not a match', () => {
    const code = 'int format = 1; int iffy = 2; int doing = 3; int whiler = 4;';
    assert.deepEqual(findBannedKeywords(code, ['for', 'if', 'do', 'while']), []);
  });

  test('an identifier with the keyword as a part is not a match', () => {
    assert.deepEqual(findBannedKeywords('int my_if = 1; int if2 = 2;', ['if']), []);
  });

  test('a mention in a comment is not a violation', () => {
    const code = '// solve this with a for loop\n/* no if statements */\nwhile (n--) puts("x");';
    assert.deepEqual(findBannedKeywords(code, ['for', 'if']), []);
  });

  test('a mention in a string is not a violation', () => {
    assert.deepEqual(findBannedKeywords('printf("for if switch");', ['for', 'if', 'switch']), []);
  });

  test('code after a comment mentioning it is still checked', () => {
    const code = '// no for loops please\nfor (int i = 0; i < 3; i++) puts("x");';
    assert.deepEqual(findBannedKeywords(code, ['for']), ['for']);
  });
});

describe('stripping', () => {
  test('leaves code and blanks the rest', () => {
    const stripped = stripNonCode('int a = 1; // for\nputs("if"); /* while */');
    assert.match(stripped, /int a = 1;/);
    assert.doesNotMatch(stripped, /\bfor\b/);
    assert.doesNotMatch(stripped, /\bif\b/);
    assert.doesNotMatch(stripped, /\bwhile\b/);
  });

  test('definesMain still uses the same definition of code', () => {
    // The check moved onto the shared stripper; these are the cases harness.ts
    // documented, asserted here so a change to stripNonCode cannot quietly break
    // the main() guard.
    assert.equal(definesMain('int main(void) { return 0; }'), true);
    assert.equal(definesMain('// call from main()'), false);
    assert.equal(definesMain('printf("main(");'), false);
  });
});

describe('a restriction the judge cannot enforce', () => {
  /*
   * A question saved with `*` as its restriction — a teacher meaning "no
   * multiplication", from before the write side filtered what it stored — closed
   * that question completely. `new RegExp('\\b*\\b')` throws "Nothing to
   * repeat", the throw happened before the submission row was written, and the
   * student got a connection error with no record that they had ever tried.
   *
   * The rule these pin down: a stored restriction is looked up, never compiled.
   * Anything unrecognised is inert.
   */
  test('a stored value that is not a keyword cannot throw', () => {
    assert.doesNotThrow(() => findBannedKeywords('int x = a * b;', ['*']));
    assert.doesNotThrow(() => findBannedKeywords('int x = 1;', ['(', '[a-z]+', '\\', '?']));
  });

  test('and is not enforced against the student', () => {
    assert.deepEqual(findBannedKeywords('int x = a * b;', ['*']), []);
    // A regex metacharacter sequence is not a pattern here; it matches nothing.
    assert.deepEqual(findBannedKeywords('anything at all', ['.*']), []);
  });

  test('an unenforceable restriction never reaches the student', () => {
    // What the note under the question is built from: promising a restriction
    // the judge does not apply teaches the wrong lesson to whoever obeys it.
    assert.deepEqual(enforceableKeywords(['*', 'for', 'pow']), ['for']);
    assert.deepEqual(enforceableKeywords([]), []);
  });

  test('the keywords either side of it still work', () => {
    // The failure mode worth guarding: one bad entry silently disabling the
    // real restrictions that share the row.
    assert.deepEqual(findBannedKeywords('if (n) { }', ['*', 'if']), ['if']);
  });
});

describe('the message', () => {
  test('names what was used', () => {
    assert.match(bannedKeywordMessage(['for']), /`for`/);
    assert.match(bannedKeywordMessage(['for', 'if']), /`for`, `if`/);
  });
});
