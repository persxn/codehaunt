/**
 * Live budget changes while participants prompt (audit run-11 R11-2), on real Postgres: PGlite serialises connections
 * and cannot show lock conflicts. Gated on TEST_POSTGRES_URL (set by scripts/ci.sh when the compose Postgres is up).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reserveTokens, settleTokens, tokenBalance } from '@codehaunt/db';
import { createPostgresTestDatabase } from '@codehaunt/db/testing';

import { getEvent, updateEvent } from '../src/server/event-service.ts';
import { eventConfig } from './support/fixtures.ts';

const url = process.env.TEST_POSTGRES_URL;

test('budget changes and reserve/settle run concurrently without deadlocks or overdraft', { skip: !url && 'TEST_POSTGRES_URL not set' }, async () => {
  const db = await createPostgresTestDatabase(url!);
  try {
    const { prisma } = db;
    const config = eventConfig({ schedule: { checkInAt: new Date().toISOString(), startsAt: new Date(Date.now() - 60_000).toISOString(), durationMinutes: 180 } });
    const event = await prisma.event.create({ data: { slug: 'conc', name: 'C', status: 'RUNNING', config, lockedAt: new Date() } });
    const admin = await prisma.user.create({ data: { username: 'conc-admin', name: 'A', role: 'ADMIN', passwordHash: 'x', active: true } });
    const problem = await prisma.problem.create({ data: { eventId: event.id, slug: 'p', title: 'P', statement: 's', difficulty: 'EASY', ord: 0, timeLimitMs: 1000, memoryLimitMb: 64, checker: {} } });
    const participants = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const user = await prisma.user.create({ data: { username: `conc-${i}`, name: 'P', role: 'PARTICIPANT', passwordHash: 'x', active: true } });
      const p = await prisma.participant.create({ data: { eventId: event.id, userId: user.id, enrolmentNo: `C${i}`, status: 'CHECKED_IN' } });
      await prisma.tokenLedger.create({ data: { eventId: event.id, participantId: p.id, kind: 'GRANT', delta: config.budget.tokensPerParticipant, idempotencyKey: `grant:${p.id}` } });
      const session = await prisma.chatSession.create({ data: { participantId: p.id, problemId: problem.id, language: 'C' } });
      return { id: p.id, session: session.id };
    }));

    let ord = 0;
    const prompts = participants.map(async (p) => {
      for (let i = 0; i < 8; i++) {
        const turn = await prisma.promptTurn.create({ data: { chatSessionId: p.session, ord: ord++, idempotencyKey: `t-${p.id}-${i}`, prompt: 'x', model: 'junior' } });
        await reserveTokens(prisma, { eventId: event.id, participantId: p.id, promptTurnId: turn.id, wanted: 1500, now: new Date() });
        await settleTokens(prisma, { participantId: p.id, promptTurnId: turn.id, used: 300 });
      }
    });
    const changes = (async () => {
      for (const tokens of [25_000, 15_000, 30_000, 20_000]) {
        const ev = await getEvent(prisma, event.id);
        await updateEvent(prisma, event.id, { config: { ...ev.config, budget: { ...ev.config.budget, tokensPerParticipant: tokens } } }, { id: admin.id, requestId: 'r' });
      }
    })();
    const results = await Promise.allSettled([...prompts, changes]);
    assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason)), []);
    // Final budget 20,000 everywhere, minus 8 × 300 used: every balance is exactly that (no lost or double adjustment).
    for (const p of participants) assert.equal(await tokenBalance(prisma, p.id), 20_000 - 8 * 300);
  } finally {
    await db.close();
  }
});
