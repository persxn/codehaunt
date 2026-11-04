import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeStandings, decayedPoints, type ScoringParticipant, type ScoringSubmission } from '../src/scoring.ts';

const rules = {
  weights: { correctness: 0.55, tokenEfficiency: 0.15, resourceEfficiency: 0.1, processQuality: 0.2 },
  wrongSubmissionPenaltyPct: 20,
  decayPerMinute: 2,
};
const problems = [{ id: 'a', difficulty: 'EASY' as const }, { id: 'b', difficulty: 'HARD' as const }];
const MIN = 60_000;

const sub = (problemId: string, verdict: string | null, minute: number, extra: Partial<ScoringSubmission> = {}): ScoringSubmission => ({
  problemId, language: 'python', verdict, contestMs: minute * MIN, maxTimeMs: 20, maxMemoryKb: 10_000, counts: true, ...extra,
});
const person = (id: string, submissions: ScoringSubmission[], tokens = 1000, extra: Partial<ScoringParticipant> = {}): ScoringParticipant => ({
  id, name: id, disqualified: false, submissions, tokens, judgeScore: null, overrides: {}, ...extra,
});

test('decay: full value at 0, 2 points per minute per 500, floor 30%; each rejection 20% of the value after the floor', () => {
  assert.equal(decayedPoints(500, 0, 0, rules), 500);
  assert.equal(decayedPoints(500, 10 * MIN, 0, rules), 480);
  assert.equal(decayedPoints(1500, 10 * MIN, 0, rules), 1440);
  assert.equal(decayedPoints(500, 10 * MIN, 2, rules), 480 - 200);
  assert.equal(decayedPoints(500, 180 * MIN, 0, rules), 150);
  // ADR-034: the floor covers decay only, so every rejection keeps costing its full 20%.
  assert.equal(decayedPoints(500, 180 * MIN, 1, rules), 150 - 100);
  assert.equal(decayedPoints(500, 0, 5, rules), 0);
  assert.equal(decayedPoints(500, 0, 6, rules), -100);
  assert.equal(decayedPoints(1500, 0, 1, { ...rules, wrongSubmissionPenaltyPct: 10 }), 1350);
});

test('rejections on unsolved problems cost 20% of the value each; the correctness total never goes below 0', () => {
  const run = (subs: ScoringSubmission[]) => computeStandings({ problems, references: new Map(), rules, participants: [person('p', subs)] })[0]!;
  assert.equal(run([sub('b', 'WA', 1)]).problems[1]!.points, -300);
  assert.equal(run([sub('b', 'WA', 1), sub('b', 'WA', 2)]).problems[1]!.points, -600);
  assert.equal(run([sub('b', 'CE', 1), sub('b', 'TLE', 2, { counts: false })]).problems[1]!.points, 0, 'CE and reversed cost nothing');
  // 500 for a (AC at 0) − 300 for one WA on b = 200 of 2000.
  assert.equal(run([sub('a', 'AC', 0), sub('b', 'WA', 1)]).correctness, 10);
  // 500 − 6 × 300 < 0 → 0, never negative.
  assert.equal(run([sub('a', 'AC', 0), ...Array.from({ length: 6 }, (_, i) => sub('b', 'WA', i + 1))]).correctness, 0);
});

test('penalties: only judged non-AC non-CE submits before the first AC, unless reversed', () => {
  const [s] = computeStandings({
    problems, references: new Map(), rules,
    participants: [person('p', [
      sub('a', 'WA', 1), sub('a', 'CE', 2), sub('a', null, 3), sub('a', 'IE', 4), sub('a', 'TLE', 5, { counts: false }),
      sub('a', 'AC', 10), sub('a', 'WA', 11),
    ])],
  });
  assert.equal(s!.problems[0]!.rejected, 2); // WA + IE
  assert.equal(s!.problems[0]!.points, 500 - 20 - 2 * 100);
  assert.equal(s!.problems[0]!.attempts, 7);
  assert.equal(s!.correctness, Math.round((100 * 280) / 2000 * 100) / 100);
});

test('unsolved problems earn nothing, and wrong tries take the total no lower than 0', () => {
  const [s] = computeStandings({ problems, references: new Map(), rules, participants: [person('p', [sub('b', 'WA', 1), sub('b', 'WA', 2)])] });
  assert.equal(s!.correctness, 0);
  assert.equal(s!.tokenEfficiency, 0);
  assert.equal(s!.resourceEfficiency, 0);
  assert.equal(s!.solved, 0);
});

test('token efficiency is 50 at the median, higher with fewer tokens per solve, 0 at twice the median', () => {
  const out = computeStandings({
    problems, references: new Map(), rules,
    participants: [
      person('low', [sub('a', 'AC', 5)], 500),
      person('mid', [sub('a', 'AC', 5)], 1000),
      person('high', [sub('a', 'AC', 5)], 2000),
      person('two', [sub('a', 'AC', 5), sub('b', 'AC', 6)], 2000), // 1000 per solve
    ],
  });
  const by = Object.fromEntries(out.map((s) => [s.participantId, s.tokenEfficiency]));
  assert.equal(by.low, 75);
  assert.equal(by.mid, 50);
  assert.equal(by.two, 50);
  assert.equal(by.high, 0);
});

test('resource efficiency compares with the reference in the same language and flags a missing one', () => {
  const references = new Map([['a:python', { maxTimeMs: 20, maxMemoryKb: 10_000 }]]);
  const out = computeStandings({
    problems, references, rules,
    participants: [
      person('same', [sub('a', 'AC', 1)]),
      person('slow', [sub('a', 'AC', 1, { maxTimeMs: 50 })]),
      person('cpp', [sub('a', 'AC', 1, { language: 'cpp', maxTimeMs: 500 })]),
    ],
  });
  const by = Object.fromEntries(out.map((s) => [s.participantId, s]));
  assert.equal(by.same!.resourceEfficiency, 100);
  assert.equal(by.slow!.resourceEfficiency, Math.round(100 * (0.5 * (30 / 60) + 0.5) * 100) / 100);
  assert.equal(by.cpp!.resourceEfficiency, 100);
  assert.deepEqual(by.cpp!.missingReference, ['a']);
});

test('total uses the weights; a pending judge adds 0; overrides replace a component', () => {
  const [a] = computeStandings({ problems, references: new Map(), rules, participants: [person('p', [sub('a', 'AC', 0), sub('b', 'AC', 0)])] });
  assert.equal(a!.correctness, 100);
  assert.equal(a!.processQuality, null);
  assert.equal(a!.total, 55 + 0.15 * 50 + 10);
  const [b] = computeStandings({
    problems, references: new Map(), rules,
    participants: [person('p', [sub('a', 'AC', 0), sub('b', 'AC', 0)], 1000, { judgeScore: 80, overrides: { correctness: 50 } })],
  });
  assert.equal(b!.correctness, 50);
  assert.equal(b!.processQuality, 80);
  assert.deepEqual(b!.overridden, ['correctness']);
  assert.equal(b!.total, Math.round((27.5 + 7.5 + 10 + 16) * 100) / 100);
});

test('ties: correctness, then fewer tokens, then earlier last acceptance; equal on all = same rank', () => {
  // Same total by construction (overrides), different tie-break keys.
  const o = { overrides: { correctness: 50, tokenEfficiency: 50, resourceEfficiency: 50 } };
  const out = computeStandings({
    problems, references: new Map(), rules,
    participants: [
      person('late', [sub('a', 'AC', 30)], 1000, o),
      person('early', [sub('a', 'AC', 10)], 1000, o),
      person('twin', [sub('a', 'AC', 10)], 1000, o),
      person('cheap', [sub('a', 'AC', 50)], 900, o),
      person('dq', [sub('a', 'AC', 0), sub('b', 'AC', 0)], 10, { disqualified: true }),
    ],
  });
  assert.deepEqual(out.map((s) => [s.participantId, s.rank]), [['cheap', 1], ['early', 2], ['twin', 2], ['late', 4], ['dq', null]]);
});

test('disqualified participants do not move the token median', () => {
  const out = computeStandings({
    problems, references: new Map(), rules,
    participants: [person('p', [sub('a', 'AC', 1)], 1000), person('dq', [sub('a', 'AC', 1)], 1, { disqualified: true })],
  });
  assert.equal(out.find((s) => s.participantId === 'p')!.tokenEfficiency, 50);
});
