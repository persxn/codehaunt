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

// judge-v2 (ADR-033)
import { JudgeInputV2, JudgeOutputV2 } from '../src/index.ts';

const metricsV2 = { accepted: true, prompts: 1, tokens: 300, attempts: 1, rejectedBeforeAccept: 0, timeToAcceptMs: 60_000, tokensAfterAccept: 0, timeRatio: 1, memoryRatio: 1 };
const problemV2 = (problemId: string) => ({
  problemId, title: 'Sum', statement: 'Add.', language: 'cpp', metrics: metricsV2,
  transcript: [
    { kind: 'question', atMs: 1000, tokens: 40, text: 'Why can int overflow?' },
    { kind: 'reply', atMs: 2000, text: 'An int holds about 2.1e9.' },
    { kind: 'save', atMs: 20_000, chars: 120, burst: false },
    { kind: 'submit', atMs: 60_000, verdict: 'AC', testsPassed: 5, testsTotal: 5 },
  ],
  codeSnapshots: [{ atMs: 20_000, code: 'int main(){}' }],
  finalCode: 'int main(){}',
  flags: { saveBursts: 0, aiCopiedLines: 0, codeHeavyQuestions: 0 },
});

test('judge-v2 input: tutor transcript, snapshots, flags; v1 kinds and extra fields refused', () => {
  const ok = JudgeInputV2.parse({ participantRef: 'p1', problems: [problemV2('A')] });
  assert.equal(ok.problems[0]!.transcript.length, 4);
  const withPrompt = { participantRef: 'p1', problems: [{ ...problemV2('A'), transcript: [{ kind: 'prompt', atMs: 0, tokens: 1, text: 'x' }] }] };
  assert.equal(JudgeInputV2.safeParse(withPrompt).success, false, 'v1 "prompt" entries are not v2');
  const tooMany = { participantRef: 'p1', problems: [{ ...problemV2('A'), codeSnapshots: Array.from({ length: 5 }, () => ({ atMs: 0, code: '' })) }] };
  assert.equal(JudgeInputV2.safeParse(tooMany).success, false, 'at most 4 snapshots');
});

test('judge-v2 output: tutor-mode criteria only, strict', () => {
  const criteria = { questionQuality: 4, independence: 5, debugging: 3, improvement: 4, complexity: 5, tokenEconomy: 4 };
  const review = { problemId: 'A', score: 82, criteria, complexityAchieved: 'O(n)', complexityOptimal: 'O(n)', rationale: 'Asked about overflow at 1000.' };
  const output = { problems: [review], overall: { score: 82, rationale: 'Good.' }, injectionFlag: false, injectionEvidence: '' };
  assert.equal(JudgeOutputV2.safeParse(output).success, true);
  assert.equal(judgeOutputMismatch(JudgeInputV2.parse({ participantRef: 'p', problems: [problemV2('A')] }), JudgeOutputV2.parse(output)), null);
  const v1Criteria = { specificity: 4, memoryAwareness: 4, mistakeCorrection: 4, debugging: 4, complexity: 4, tokenEconomy: 4 };
  assert.equal(JudgeOutputV2.safeParse({ ...output, problems: [{ ...review, criteria: v1Criteria }] }).success, false);
  assert.equal(JudgeOutputV2.safeParse({ ...output, extra: 1 }).success, false);
});
