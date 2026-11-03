import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeProcessMetrics,
  type MetricsSubmission,
  type MetricsPrompt,
  type ProcessMetrics,
} from '../src/process-metrics.ts';
import type { ReferenceResult } from '../src/scoring.ts';

const MIN = 60_000;

const sub = (
  problemId: string,
  verdict: string | null,
  contestMs: number,
  extra: Partial<MetricsSubmission> = {},
): MetricsSubmission => ({
  problemId,
  language: 'python',
  verdict,
  contestMs,
  maxTimeMs: 10,
  maxMemoryKb: 1000,
  ...extra,
});

const prm = (
  problemId: string,
  contestMs: number,
  tokens: number,
  extra: Partial<MetricsPrompt> = {},
): MetricsPrompt => ({
  problemId,
  contestMs,
  tokens,
  ...extra,
});

test('no submissions or prompts', () => {
  const input = {
    problemIds: ['a', 'b'] as const,
    submissions: [] as const,
    prompts: [] as const,
    references: {} as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  assert.deepEqual(out.problems.map(p => p.problemId), ['a', 'b']);
  for (const p of out.problems) {
    assert.equal(p.accepted, false);
    assert.equal(p.prompts, 0);
    assert.equal(p.tokens, 0);
    assert.equal(p.attempts, 0);
    assert.equal(p.rejectedBeforeAccept, 0);
    assert.equal(p.timeToAcceptMs, null);
    assert.equal(p.tokensAfterAccept, 0);
    assert.equal(p.timeRatio, null);
    assert.equal(p.memoryRatio, null);
  }
  assert.equal(out.totalTokens, 0);
  assert.equal(out.tokensPerAccepted, null);
  assert.equal(out.solved, 0);
});

test('metrics with various verdicts and prompts', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [
      sub('a', 'WA', 1 * MIN),
      sub('a', 'CE', 2 * MIN),
      sub('a', null, 3 * MIN),
      sub('a', 'TLE', 4 * MIN),
      sub('a', 'AC', 5 * MIN, { maxTimeMs: 8, maxMemoryKb: 2000 }),
      sub('a', 'WA', 6 * MIN), // after AC, should be ignored
    ],
    prompts: [
      prm('a', 0 * MIN, 5),
      prm('a', 3 * MIN, 10),
      prm('a', 6 * MIN, 15), // after AC
    ],
    references: {
      'a:python': { maxTimeMs: 10, maxMemoryKb: 4000 } as ReferenceResult,
    } as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  const p = out.problems[0]!;
  assert.equal(p.accepted, true);
  assert.equal(p.prompts, 3);
  assert.equal(p.tokens, 30);
  assert.equal(p.attempts, 4); // WA, CE, TLE, AC (null ignored, WA after AC ignored)
  assert.equal(p.rejectedBeforeAccept, 2); // WA and TLE, CE excluded
  assert.equal(p.timeToAcceptMs, 5 * MIN);
  assert.equal(p.tokensAfterAccept, 15);
  // Ratios: 8/10 = 0.8, 2000/4000 = 0.5, rounded to 3 decimals
  assert.equal(p.timeRatio, 0.8);
  assert.equal(p.memoryRatio, 0.5);
  assert.equal(out.totalTokens, 30);
  assert.equal(out.solved, 1);
  assert.equal(out.tokensPerAccepted, 30);
});

test('null verdicts ignored and submissions after AC not counted', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [
      sub('a', null, 1 * MIN),
      sub('a', 'AC', 2 * MIN, { maxTimeMs: 5, maxMemoryKb: 500 }),
      sub('a', 'WA', 3 * MIN), // after AC
    ],
    prompts: [],
    references: {} as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  const p = out.problems[0]!;
  assert.equal(p.attempts, 1);
  assert.equal(p.rejectedBeforeAccept, 0);
});

test('unsorted input sorted by contestMs', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [
      sub('a', 'WA', 3 * MIN),
      sub('a', 'AC', 2 * MIN),
      sub('a', 'WA', 1 * MIN),
    ],
    prompts: [],
    references: {} as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  const p = out.problems[0]!;
  // First AC is at 1*MIN, attempts should include WA at 2*MIN and AC at 1*MIN (sorted order), so attempts = 2
  assert.equal(p.attempts, 2);
  assert.equal(p.rejectedBeforeAccept, 1); // WA before AC (at 2*MIN) counted
});

test('ignore problem ids not listed', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [sub('b', 'AC', 1 * MIN)],
    prompts: [prm('b', 0, 10)],
    references: {} as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  const p = out.problems[0]!;
  assert.equal(p.accepted, false);
  assert.equal(p.prompts, 0);
  assert.equal(p.tokens, 0);
});

test('tokensPerAccepted null when nothing solved', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [sub('a', 'WA', 1 * MIN)],
    prompts: [],
    references: {} as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  assert.equal(out.solved, 0);
  assert.equal(out.tokensPerAccepted, null);
});

test('reference with zero maxTimeMs yields null ratios', () => {
  const input = {
    problemIds: ['a'] as const,
    submissions: [sub('a', 'AC', 1 * MIN, { maxTimeMs: 5, maxMemoryKb: 500 })],
    prompts: [],
    references: {
      'a:python': { maxTimeMs: 0, maxMemoryKb: 0 } as ReferenceResult,
    } as Record<string, ReferenceResult>,
  };
  const out = computeProcessMetrics(input);
  const p = out.problems[0]!;
  assert.equal(p.timeRatio, null);
  assert.equal(p.memoryRatio, null);
});

test('input not mutated', () => {
  const submissions = [sub('a', 'WA', 1 * MIN)];
  const prompts = [prm('a', 0, 5)];
  const references = {} as Record<string, ReferenceResult>;
  const input = {
    problemIds: ['a'] as const,
    submissions,
    prompts,
    references,
  };
  const copy = JSON.stringify(input);
  computeProcessMetrics(input);
  assert.equal(JSON.stringify(input), copy);
});
