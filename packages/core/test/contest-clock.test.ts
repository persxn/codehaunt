import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contestClock } from '../src/contest-clock.ts';

const base = {
  status: 'RUNNING' as const,
  startsAt: '2023-01-01T00:00:00Z',
  durationMinutes: 60,
  freezeMinutes: 10,
};

test('DRAFT status => not_started', () => {
  const state = contestClock({ ...base, status: 'DRAFT' as const }, new Date('2023-01-01T00:00:00Z'));
  assert.equal(state.phase, 'not_started');
});

test('CHECK_IN status => not_started', () => {
  const state = contestClock({ ...base, status: 'CHECK_IN' as const }, new Date('2023-01-01T00:00:00Z'));
  assert.equal(state.phase, 'not_started');
});

test('RUNNING before start => not_started', () => {
  const now = new Date('2022-12-31T23:30:00Z'); // 30 min before start
  const state = contestClock({ ...base, status: 'RUNNING' as const }, now);
  assert.equal(state.phase, 'not_started');
  assert.equal(state.msLeft, 0);
  assert.equal(state.frozen, false);
});

test('RUNNING during contest => running', () => {
  const now = new Date('2023-01-01T00:30:00Z'); // halfway
  const state = contestClock({ ...base, status: 'RUNNING' as const }, now);
  assert.equal(state.phase, 'running');
  // msLeft should be 30 min * 60_000 = 1800000
  assert.equal(state.msLeft, 30 * 60_000);
  // not frozen yet (freeze at 50 min)
  assert.equal(state.frozen, false);
});

test('RUNNING after end => ended', () => {
  const now = new Date('2023-01-01T01:10:00Z'); // 70 min after start
  const state = contestClock({ ...base, status: 'RUNNING' as const }, now);
  assert.equal(state.phase, 'ended');
  assert.equal(state.msLeft, 0);
  assert.equal(state.frozen, true);
});

test('extra minutes extend contest', () => {
  const now = new Date('2023-01-01T01:00:00Z'); // after original end but before extended end
  const state = contestClock({ ...base, status: 'RUNNING' as const, extraMinutes: 30 }, now);
  // endsAt should be start + (60+30) min = 90 min, freeze at 80 min
  assert.equal(state.phase, 'running');
  assert.equal(state.msLeft, (90 - 60) * 60_000); // 30 min left
  // now is at 60 min, freeze at 80 min, so not frozen yet
  assert.equal(state.frozen, false);
});

test('frozen exactly at freeze time', () => {
  const now = new Date('2023-01-01T00:50:00Z'); // freeze at 50 min (end 60 - freeze 10)
  const state = contestClock({ ...base, status: 'RUNNING' as const }, now);
  assert.equal(state.phase, 'running');
  assert.equal(state.frozen, true);
  // msLeft should be 10 min * 60_000
  assert.equal(state.msLeft, 10 * 60_000);
});

test('PAUSED status respects freeze', () => {
  const now = new Date('2023-01-01T00:55:00Z'); // after freeze
  const state = contestClock({ ...base, status: 'PAUSED' as const }, now);
  assert.equal(state.phase, 'paused');
  assert.equal(state.frozen, true);
  // msLeft = 5 min left
  assert.equal(state.msLeft, 5 * 60_000);
});

test('ENDED status => ended, frozen true, msLeft 0', () => {
  const now = new Date('2023-01-01T01:00:00Z');
  const state = contestClock({ ...base, status: 'ENDED' as const }, now);
  assert.equal(state.phase, 'ended');
  assert.equal(state.frozen, true);
  assert.equal(state.msLeft, 0);
});

test('JUDGING status => ended, frozen true, msLeft 0', () => {
  const now = new Date('2023-01-01T01:00:00Z');
  const state = contestClock({ ...base, status: 'JUDGING' as const }, now);
  assert.equal(state.phase, 'ended');
  assert.equal(state.frozen, true);
  assert.equal(state.msLeft, 0);
});

test('PUBLISHED status => ended, frozen true, msLeft 0', () => {
  const now = new Date('2023-01-01T01:00:00Z');
  const state = contestClock({ ...base, status: 'PUBLISHED' as const }, now);
  assert.equal(state.phase, 'ended');
  assert.equal(state.frozen, true);
  assert.equal(state.msLeft, 0);
});



test('the actual start overrides the scheduled one', () => {
  const state = contestClock({ ...base, startedAt: '2023-01-01T00:10:00Z' }, new Date('2023-01-01T01:05:00Z'));
  assert.equal(state.phase, 'running');
  assert.equal(state.endsAt.toISOString(), '2023-01-01T01:10:00.000Z');
  assert.equal(state.elapsedMs, 55 * 60_000);
});

test('a running pause freezes time left and elapsed time; finished pauses push the end back', () => {
  const input = { ...base, status: 'PAUSED' as const, pausedAt: '2023-01-01T00:20:00Z', pausedMs: 5 * 60_000 };
  const a = contestClock(input, new Date('2023-01-01T00:30:00Z'));
  const b = contestClock(input, new Date('2023-01-01T00:40:00Z'));
  assert.equal(a.phase, 'paused');
  assert.equal(a.msLeft, b.msLeft);
  assert.equal(a.elapsedMs, 15 * 60_000);
  assert.equal(b.elapsedMs, 15 * 60_000);
  // After resuming (pause of 20 min folded into pausedMs), the end is 25 min later than scheduled.
  const resumed = contestClock({ ...base, pausedMs: 25 * 60_000 }, new Date('2023-01-01T00:40:00Z'));
  assert.equal(resumed.endsAt.toISOString(), '2023-01-01T01:25:00.000Z');
  assert.equal(resumed.elapsedMs, 15 * 60_000);
});

test('elapsed time stops at the end and is 0 before the start', () => {
  assert.equal(contestClock(base, new Date('2023-01-01T03:00:00Z')).elapsedMs, 60 * 60_000);
  assert.equal(contestClock({ ...base, status: 'CHECK_IN' as const }, new Date('2023-01-01T00:30:00Z')).elapsedMs, 0);
});
