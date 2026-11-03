import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toParticipantVerdict, type StoredRun } from '../src/verdict-projection.ts';

const results = [
  { testId: 'v1', verdict: 'AC', timeMs: 3, memoryKb: 900, outputExcerpt: '3' },
  { testId: 'h1', verdict: 'WA', timeMs: 4, memoryKb: 900, outputExcerpt: 'SECRET-HIDDEN-INPUT' },
];
const run = (kind: StoredRun['kind'], verdict: string, extra: Partial<NonNullable<StoredRun['verdict']>> = {}): StoredRun => ({
  id: 's1',
  kind,
  status: 'DONE',
  verdict: { verdict, testsPassed: 1, testsTotal: 2, maxTimeMs: 4.4, maxMemoryKb: 900, compileLog: 'gcc: ok', results, ...extra },
});

test('a failed submission shows the verdict and counts only (time/memory are a side channel, ADR-027)', () => {
  const v = toParticipantVerdict(run('SUBMIT', 'WA'), new Set(['v1', 'h1']));
  assert.deepEqual(v, { submissionId: 's1', status: 'DONE', verdict: 'WA', testsPassed: 1, testsTotal: 2 });
  assert.doesNotMatch(JSON.stringify(v), /SECRET/);
  for (const verdict of ['TLE', 'MLE', 'RE', 'IE']) assert.equal(toParticipantVerdict(run('SUBMIT', verdict), new Set()).maxMemoryKb, undefined);
});

test('an accepted submission and every sample run show time and memory', () => {
  assert.deepEqual(toParticipantVerdict(run('SUBMIT', 'AC'), new Set()), { submissionId: 's1', status: 'DONE', verdict: 'AC', testsPassed: 1, testsTotal: 2, maxTimeMs: 4, maxMemoryKb: 900 });
  assert.equal(toParticipantVerdict(run('SAMPLE', 'WA'), new Set()).maxTimeMs, 4);
});

test('a sample run shows only the tests the caller lists as visible', () => {
  const v = toParticipantVerdict(run('SAMPLE', 'WA'), new Set(['v1']));
  assert.deepEqual(v.sampleResults?.map((r) => r.testId), ['v1']);
  assert.doesNotMatch(JSON.stringify(v), /SECRET/);
});

test('the compiler log is shown for CE only, and bounded', () => {
  assert.equal(toParticipantVerdict(run('SUBMIT', 'WA'), new Set()).compileLog, undefined);
  const ce = toParticipantVerdict(run('SUBMIT', 'CE', { compileLog: 'x'.repeat(20_000) }), new Set());
  assert.equal(ce.compileLog?.length, 8000);
});

test('IE and unknown verdicts show as IE without detail; internalError never leaves', () => {
  const ie = toParticipantVerdict(run('SAMPLE', 'IE', { results, internalError: 'runner said SECRET' } as never), new Set(['v1', 'h1']));
  assert.equal(ie.verdict, 'IE');
  assert.equal(ie.sampleResults, undefined);
  assert.doesNotMatch(JSON.stringify(ie), /SECRET|runner/);
  assert.equal(toParticipantVerdict(run('SUBMIT', 'all tests passed'), new Set()).verdict, 'IE');
});

test('queued, running and failed runs carry only their status', () => {
  for (const status of ['QUEUED', 'RUNNING', 'FAILED'] as const) {
    assert.deepEqual(toParticipantVerdict({ ...run('SUBMIT', 'AC'), status }, new Set()), { submissionId: 's1', status });
  }
});
