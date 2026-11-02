/** Test data for the service tests: a running event, a problem with visible and hidden tests, a checked-in participant. */
import { EventConfig } from '@codehaunt/contracts';
import type { PrismaClient } from '@codehaunt/db';

import type { GatewayOutcome, ModelClient } from '../../src/server/gateway-client.ts';
import { participantContext } from '../../src/server/contest.ts';

/** Strings that exist only in hidden tests; a payload containing any of them leaked. */
export const HIDDEN_INPUT = 'HIDDEN-INPUT-7f3a';
export const HIDDEN_OUTPUT = 'HIDDEN-OUTPUT-9c1e';

let seq = 0;

export function eventConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return EventConfig.parse({
    branding: { title: 'Test' },
    schedule: { checkInAt: '2026-11-07T09:00:00+05:30', startsAt: new Date(Date.now() - 60_000).toISOString(), durationMinutes: 180 },
    model: { baseUrl: 'http://gateway.test', name: 'junior', systemPromptVersion: 'v1' },
    judge: { rubricVersion: 'r1' },
    consent: { text: 'I agree.' },
    budget: { tokensPerParticipant: 20_000, contextTokens: 4096, replyTokens: 512 },
    ...overrides,
  });
}

export async function setup(prisma: PrismaClient, options: { status?: 'CHECK_IN' | 'RUNNING'; tokens?: number; consented?: boolean; practice?: boolean } = {}) {
  const n = ++seq;
  const config = eventConfig(options.tokens ? { budget: { tokensPerParticipant: options.tokens, contextTokens: 4096, replyTokens: 512 } } : {});
  const event = await prisma.event.create({ data: { slug: `ev${n}`, name: `Event ${n}`, status: options.status ?? 'RUNNING', config } });
  const problem = await prisma.problem.create({
    data: {
      eventId: event.id, slug: 'sum', title: 'Sum', statement: 'Add two numbers.', difficulty: 'EASY', ord: 0,
      timeLimitMs: 1000, memoryLimitMb: 64, checker: { kind: 'caseInsensitive' }, practice: options.practice ?? false,
      testCases: {
        create: [
          { visibility: 'VISIBLE', ord: 0, input: '1 2', expectedOutput: '3' },
          { visibility: 'HIDDEN', ord: 0, input: HIDDEN_INPUT, expectedOutput: HIDDEN_OUTPUT },
        ],
      },
      solutions: { create: [{ language: 'PYTHON', kind: 'REFERENCE', source: 'print(sum(map(int,input().split())))' }] },
    },
  });
  const user = await prisma.user.create({ data: { username: `p${n}`, name: `P ${n}`, role: 'PARTICIPANT', passwordHash: 'x', active: true } });
  const participant = await prisma.participant.create({
    data: { eventId: event.id, userId: user.id, enrolmentNo: `E${n}`, status: 'CHECKED_IN', consentAt: options.consented === false ? null : new Date() },
  });
  await prisma.tokenLedger.create({
    data: { eventId: event.id, participantId: participant.id, kind: 'GRANT', delta: config.budget.tokensPerParticipant, idempotencyKey: `grant:${participant.id}` },
  });
  const admin = await prisma.user.create({ data: { username: `admin${n}`, name: 'Admin', role: 'ADMIN', passwordHash: 'x', active: true } });
  const ctx = () => participantContext(prisma, user.id, new Date(), { allowWithoutConsent: options.consented === false });
  return { event, problem, user, participant, admin, ctx };
}

/** A gateway stand-in: streams `text` in two deltas and reports `usage`, or fails as told. */
export function fakeModel(behaviour: { text?: string; usage?: { prompt_tokens: number; completion_tokens: number } | null; fail?: GatewayOutcome } = {}) {
  const calls: Array<Parameters<ModelClient['chat']>[0]> = [];
  const model: ModelClient = {
    async chat(request, _requestId, onDelta) {
      calls.push(request);
      if (behaviour.fail) return behaviour.fail;
      const text = behaviour.text ?? 'Here:\n```python\nprint(sum(map(int, input().split())))\n```\nDone.';
      onDelta(text.slice(0, 5));
      onDelta(text.slice(5));
      if (behaviour.usage === null) return { ok: false, code: 'stream_failed', partial: text };
      const usage = behaviour.usage ?? { prompt_tokens: 300, completion_tokens: 40 };
      return { ok: true, text, node: 'model-0', usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } };
    },
  };
  return { model, calls };
}
