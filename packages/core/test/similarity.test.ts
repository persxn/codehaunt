import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  tokenize,
  similarity,
  similarityFlags,
  SIMILARITY_THRESHOLD,
} from '../src/similarity.ts';

// Tokenize tests
test('tokenize splits symbols and lowercases', () => {
  const t = tokenize('Hello, World!');
  assert.deepEqual(t, ['hello', ',', 'world', '!']);
});

test('similarity of two empty strings is 0', () => {
  assert.equal(similarity('', ''), 0);
});

// Helper to build items
function item(pid: string, prob: string, kind: 'prompt' | 'code', text: string) {
  return { participantId: pid, problemId: prob, kind, text };
}

// Identical code flagged with score 1
test('identical code from two participants flagged with score 1', () => {
  const longCode = "print('hello') # this is a longer code example with many tokens";
  const items = [
    item('alice', 'p1', 'code', longCode),
    item('bob', 'p1', 'code', longCode),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 1);
  const f = flags[0]!;
  assert.equal(f.problemId, 'p1');
  assert.equal(f.kind, 'code');
  assert.equal(f.a, 'alice');
  assert.equal(f.b, 'bob');
  assert.equal(f.score, 1);
});

// Whitespace/case differences flagged (score 1)
test('whitespace and case differences still flagged with score 1', () => {
  const longCode = "print('hello') # this is a longer code example with many tokens";
  const items = [
    item('alice', 'p1', 'code', longCode),
    item('bob', 'p1', 'code', "   PRINT('hello')   # THIS IS A LONGER CODE EXAMPLE WITH MANY TOKENS"),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.score, 1);
});

// Clearly different code not flagged
test('different code not flagged', () => {
  const items = [
    item('alice', 'p1', 'code', 'a = 1'),
    item('bob', 'p1', 'code', 'b = 2'),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 0);
});

// Same participant never paired with itself
test('same participant not compared to itself', () => {
  const items = [
    item('alice', 'p1', 'code', 'a = 1'),
    // another item for same participant (concatenated) should not produce a flag
    item('alice', 'p1', 'code', 'a = 1'),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 0);
});

// Different problems never compared
test('different problems not compared', () => {
  const longCode = "print('hello') # this is a longer code example with many tokens";
  const items = [
    item('alice', 'p1', 'code', longCode),
    item('bob', 'p2', 'code', longCode),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 0);
});

// Prompt and code kinds separate
test('prompt and code kinds are separate groups', () => {
  const longPrompt = "How to sum numbers in a list using Python? Provide example code and explanation.";
  const longCode = "print('hello') # this is a longer code example with many tokens";
  const items = [
    item('alice', 'p1', 'prompt', longPrompt),
    item('bob', 'p1', 'code', longCode),
    item('carol', 'p1', 'prompt', longPrompt),
  ];
  const flags = similarityFlags(items);
  // Only prompt pair should be flagged
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.kind, 'prompt');
});

// Short texts (<10 tokens) are skipped
test('short texts are ignored', () => {
  const items = [
    item('alice', 'p1', 'code', 'a'), // 1 token
    item('bob', 'p1', 'code', 'a'),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 0);
});

// a < b ordering enforced
test('flag ordering enforces a < b lexicographically', () => {
  const longCode = "print('hello') # this is a longer code example with many tokens";
  const items = [
    item('bob', 'p1', 'code', longCode),
    item('alice', 'p1', 'code', longCode),
  ];
  const flags = similarityFlags(items);
  assert.equal(flags.length, 1);
  const f = flags[0]!;
  assert.equal(f.a, 'alice');
  assert.equal(f.b, 'bob');
});

// Output sorted by score desc then problemId, kind, a, b
test('flags are sorted correctly', () => {
  const items = [
    // High similarity (score 1)
    item('alice', 'p1', 'code', "print('hello') # this is a longer code example with many tokens"),
    item('bob', 'p1', 'code', "print('hello') # this is a longer code example with many tokens"),
    // Medium similarity (score > threshold but < 1)
    item('carol', 'p1', 'code', "int a = 1; int b = 2; int c = 3; int d = 4; int e = 5; int f = 6;"),
    item('dave', 'p1', 'code', "float a = 1; int b = 2; int c = 3; int d = 4; int e = 5; int f = 6;"),
  ];
  const flags = similarityFlags(items);
  // Expect two flags, the score 1 flag first
  assert.equal(flags.length, 2);
  assert.equal(flags[0]!.score, 1);
  assert.equal(flags[1]!.score > SIMILARITY_THRESHOLD, true);
});

// Custom threshold respected
test('custom similarity threshold works', () => {
  const items = [
    item('alice', 'p1', 'code', "int a = 1; int b = 2; int c = 3; int d = 4;"),
    item('bob', 'p1', 'code', "int a = 1; int b = 2; int c = 3; float d = 4;"),
  ];
  // Compute similarity directly to verify it's ~0.6
  const sim = similarity(items[0]!.text, items[1]!.text);
  assert.ok(sim > 0.5 && sim < 0.85);
  const flags = similarityFlags(items, 0.5);
  assert.equal(flags.length, 1);
  assert.equal(flags[0]!.score, Math.round(sim * 1000) / 1000);
});
