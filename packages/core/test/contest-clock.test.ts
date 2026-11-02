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


