/** Judge I/O (WP-07): strict, bounded output; input carries no hidden tests; exact problem coverage. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JudgeInput, JudgeOutput, judgeOutputMismatch } from '../src/index.ts';

const metrics = {
  accepted: true, prompts: 3, tokens: 900, attempts: 2, rejectedBeforeAccept: 1,
  timeToAcceptMs: 600000, tokensAfterAccept: 0, timeRatio: 1.2, memoryRatio: 0.9,
};
const input = JudgeInput.parse({
  participantRef: 'p_01',
  problems: [
    {
      problemId: 'A', title: 'Sum', statement: 'Add numbers.', language: 'cpp', metrics,
      transcript: [
        { kind: 'prompt', atMs: 1000, tokens: 300, text: 'Read n then n long longs; print the sum.' },
        { kind: 'reply', atMs: 2000, text: '```cpp\n...\n```' },
        { kind: 'submit', atMs: 600000, verdict: 'AC', testsPassed: 10, testsTotal: 10 },
      ],
      finalCode: 'int main(){}',
    },
    { problemId: 'B', title: 'B', statement: 's', language: null, metrics: { ...metrics, accepted: false, timeToAcceptMs: null }, transcript: [], finalCode: null },
  ],
});
const review = (problemId: string) => ({
  problemId, score: 70,
  criteria: { specificity: 4, memoryAwareness: 3, mistakeCorrection: 3, debugging: 4, complexity: 4, tokenEconomy: 3 },
  complexityAchieved: 'O(n)', complexityOptimal: 'O(n)', rationale: 'Named types at 1000.',
});
const output = { problems: [review('A'), review('B')], overall: { score: 65, rationale: 'ok' }, injectionFlag: false, injectionEvidence: '' };

test('a well-formed output parses and covers exactly the input problems', () => {
  assert.equal(judgeOutputMismatch(input, JudgeOutput.parse(output)), null);
  assert.equal(judgeOutputMismatch(input, JudgeOutput.parse({ ...output, problems: [review('A')] })), 'B');
  assert.equal(judgeOutputMismatch(input, JudgeOutput.parse({ ...output, problems: [review('A'), review('A')] })), 'A');
  assert.equal(judgeOutputMismatch(input, JudgeOutput.parse({ ...output, problems: [review('A'), review('Z')] })), 'Z');
});

test('output is strict and bounded', () => {
  assert.equal(JudgeOutput.safeParse({ ...output, extra: 1 }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, problems: [{ ...review('A'), score: 101 }] }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, problems: [{ ...review('A'), score: 50.5 }] }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, problems: [{ ...review('A'), criteria: { ...review('A').criteria, debugging: 6 } }] }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, problems: [{ ...review('A'), criteria: { ...review('A').criteria, bonus: 5 } }] }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, overall: { score: 50, rationale: 'x'.repeat(1501) } }).success, false);
  assert.equal(JudgeOutput.safeParse({ ...output, injectionEvidence: 'x'.repeat(501) }).success, false);
});

test('run/submit entries carry counts only: no test input or output fields survive', () => {
  const parsed = JudgeInput.parse({
    ...input,
    problems: [{ ...input.problems[0], transcript: [{ kind: 'submit', atMs: 1, verdict: 'WA', testsPassed: 1, testsTotal: 9, hiddenInput: 'SECRET' }] }],
  });
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET/);
});

test('input strings are capped', () => {
  const long = { ...input, problems: [{ ...input.problems[0], finalCode: 'x'.repeat(8001) }] };
  assert.equal(JudgeInput.safeParse(long).success, false);
});
