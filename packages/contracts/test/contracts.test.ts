import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import {
  EventConfig,
  GatewayChatRequest,
  LoginRequest,
  MAX_SOURCE_BYTES,
  ParticipantProblem,
  ParticipantVerdict,
  ProblemInput,
  ProjectorView,
  PromptRequest,
  RunRequest,
  SubmissionRequest,
  TopUpRequest,
} from '../src/index.ts';

const minimalConfig = {
  branding: { title: 'T' },
  schedule: { checkInAt: '2026-11-07T09:00:00+05:30', startsAt: '2026-11-07T10:00:00+05:30' },
  model: { baseUrl: 'http://127.0.0.1:8000/v1', name: 'm', systemPromptVersion: 'v1' },
  judge: { rubricVersion: 'v1' },
  consent: { text: 'ok' },
};

const problem = {
  slug: 'sum-two',
  title: 'Sum',
  statement: 'Add two numbers.',
  difficulty: 'EASY',
  ord: 0,
  timeLimitMs: 1000,
  memoryLimitMb: 64,
  visibleTests: [{ input: '1 2', expectedOutput: '3' }],
  hiddenTests: [{ input: '2 2', expectedOutput: '4' }],
};

const participantProblem = {
  id: 'p1',
  slug: 'sum-two',
  title: 'Sum',
  statement: 'Add two numbers.',
  difficulty: 'EASY',
  ord: 0,
  timeLimitMs: 1000,
  memoryLimitMb: 64,
  practice: false,
  visibleTests: [{ input: '1 2', expectedOutput: '3' }],
};

test('EventConfig fills every default from a minimal config', () => {
  const config = EventConfig.parse(minimalConfig);
  assert.equal(config.budget.tokensPerParticipant, 60000);
  assert.equal(config.scoring.weights.correctness, 0.55);
  assert.equal(config.access.checkInCap, 40);
  assert.equal(config.access.sebRequired, true);
  assert.equal(config.timeMultiplier.python, 3);
  assert.equal(config.languages.length, 4);
  assert.equal(config.schedule.durationMinutes, 180);
});

test('EventConfig rejects bad weights, duplicate languages, unknown keys, offset-less times', () => {
  const weights = { correctness: 0.5, tokenEfficiency: 0.5, resourceEfficiency: 0.5, processQuality: 0 };
  assert.equal(EventConfig.safeParse({ ...minimalConfig, scoring: { weights } }).success, false);
  assert.equal(EventConfig.safeParse({ ...minimalConfig, languages: ['c', 'c'] }).success, false);
  assert.equal(EventConfig.safeParse({ ...minimalConfig, surprise: true }).success, false);
  const schedule = { ...minimalConfig.schedule, startsAt: '2026-11-07T10:00:00' };
  assert.equal(EventConfig.safeParse({ ...minimalConfig, schedule }).success, false);
});

test('ProblemInput validates slug and hidden tests, defaults the checker', () => {
  assert.equal(ProblemInput.safeParse({ ...problem, hiddenTests: [] }).success, false);
  assert.equal(ProblemInput.safeParse({ ...problem, slug: 'Bad Slug' }).success, false);
  assert.equal(ProblemInput.parse(problem).checker.kind, 'caseInsensitive');
});

test('ParticipantProblem cannot carry hidden tests or the reference solution', () => {
  assert.equal(ParticipantProblem.safeParse(participantProblem).success, true);
  assert.equal(ParticipantProblem.safeParse({ ...participantProblem, hiddenTests: problem.hiddenTests }).success, false);
  assert.equal(ParticipantProblem.safeParse({ ...participantProblem, referenceSolution: 'print(1)' }).success, false);
});

test('PromptRequest needs a UUID key and a non-blank prompt', () => {
  assert.equal(PromptRequest.safeParse({ problemId: 'p', prompt: 'hi', idempotencyKey: 'abc' }).success, false);
  assert.equal(PromptRequest.safeParse({ problemId: 'p', prompt: '   ', idempotencyKey: randomUUID() }).success, false);
  assert.equal(PromptRequest.parse({ problemId: 'p', prompt: ' hi ', idempotencyKey: randomUUID() }).prompt, 'hi');
});

test('SubmissionRequest accepts a valid request; ParticipantVerdict is strict', () => {
  SubmissionRequest.parse({ problemId: 'p', codeVersionId: 'v', kind: 'SUBMIT', idempotencyKey: randomUUID() });
  assert.equal(ParticipantVerdict.safeParse({ submissionId: 's', status: 'DONE', results: [] }).success, false);
});

test('RunRequest bounds source size; LoginRequest needs a username', () => {
  const run = {
    language: 'python',
    source: 'x'.repeat(MAX_SOURCE_BYTES + 1),
    tests: [{ id: 't1', input: '', expectedOutput: '' }],
    limits: { timeLimitMs: 1000, memoryLimitMb: 64 },
  };
  assert.equal(RunRequest.safeParse(run).success, false);
  assert.equal(LoginRequest.safeParse({ username: '', password: 'pw' }).success, false);
});

test('GatewayChatRequest requires the codehaunt caps and rejects unknown fields', () => {
  const ok = {
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 100,
    codehaunt: { budgetTokens: 500, contextLimit: 8192, sessionId: 's1' },
  };
  assert.equal(GatewayChatRequest.parse(ok).temperature, 0.2);
  assert.equal(GatewayChatRequest.safeParse({ ...ok, codehaunt: undefined }).success, false);
  assert.equal(GatewayChatRequest.safeParse({ ...ok, model: 'other' }).success, false);
  assert.equal(GatewayChatRequest.safeParse({ ...ok, messages: [{ role: 'tool', content: 'x' }] }).success, false);
});

test('projector view is strict: an extra field (an enrolment number) fails', () => {
  const view = { title: 'T', phase: 'running', msLeft: 0, frozen: false, final: false, problems: 6, rows: [{ rank: 1, name: 'A', solved: 2 }] };
  assert.ok(ProjectorView.safeParse(view).success);
  assert.equal(ProjectorView.safeParse({ ...view, rows: [{ rank: 1, name: 'A', solved: 2, enrolmentNo: 'E1' }] }).success, false);
});

test('top-ups need a reason and an idempotency key, and are bounded', () => {
  assert.ok(TopUpRequest.safeParse({ tokens: 5000, reason: 'gateway glitch', idempotencyKey: randomUUID() }).success);
  assert.equal(TopUpRequest.safeParse({ tokens: 5000, reason: ' ', idempotencyKey: randomUUID() }).success, false);
  assert.equal(TopUpRequest.safeParse({ tokens: 0, reason: 'x', idempotencyKey: randomUUID() }).success, false);
  assert.equal(TopUpRequest.safeParse({ tokens: 5000, reason: 'x' }).success, false);
});

test('appeal window defaults to 30 minutes', () => {
  assert.equal(EventConfig.parse(minimalConfig).leaderboard.appealMinutes, 30);
});
