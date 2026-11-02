/**
 * Reserve-then-settle accounting (ADR-022) on PGlite, plus a real-Postgres concurrency check
 * (gated on TEST_POSTGRES_URL, set by scripts/ci.sh).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import type { PrismaClient } from '../src/client.ts';
import { createPostgresTestDatabase, createTestDatabase, type TestDatabase } from '../src/testing.ts';
import { BudgetExhausted, reserveTokens, settleTokens, STALE_RESERVATION_MS, tokenBalance } from '../src/token-ledger.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

let seq = 0;
async function participantWithGrant(prisma: PrismaClient, grant: number) {
  const n = ++seq;
  const event = await prisma.event.create({ data: { slug: `e${n}`, name: 'E', config: {} } });
  const user = await prisma.user.create({ data: { username: `p${n}`, name: 'P', role: 'PARTICIPANT', passwordHash: 'x' } });
  const participant = await prisma.participant.create({ data: { eventId: event.id, userId: user.id, enrolmentNo: `E${n}` } });
  const problem = await prisma.problem.create({
    data: { eventId: event.id, slug: 'p', title: 'P', statement: 's', difficulty: 'EASY', ord: 0, timeLimitMs: 1000, memoryLimitMb: 64, checker: {} },
  });
  const session = await prisma.chatSession.create({ data: { participantId: participant.id, problemId: problem.id, language: 'CPP' } });
  await prisma.tokenLedger.create({ data: { eventId: event.id, participantId: participant.id, kind: 'GRANT', delta: grant, idempotencyKey: `grant:${n}` } });
  let ord = 0;
  const turn = async () => (await prisma.promptTurn.create({
    data: { chatSessionId: session.id, ord: ord++, idempotencyKey: `t${n}:${ord}`, prompt: 'x', model: 'junior' },
  })).id;
  return { eventId: event.id, participantId: participant.id, turn };
}

test('a turn reserves, then is charged only what it used', async () => {
  const p = await participantWithGrant(db.prisma, 1000);
  const t = await p.turn();
  assert.deepEqual(await reserveTokens(db.prisma, { ...p, promptTurnId: t, wanted: 600, now: new Date() }), { reserved: 600, remaining: 400 });
  assert.equal(await tokenBalance(db.prisma, p.participantId), 400);
  assert.equal(await settleTokens(db.prisma, { ...p, promptTurnId: t, used: 250 }), 250);
  assert.equal(await tokenBalance(db.prisma, p.participantId), 750);
});

test('a reservation never exceeds the balance; an empty balance is refused', async () => {
  const p = await participantWithGrant(db.prisma, 300);
  const t1 = await p.turn();
  assert.equal((await reserveTokens(db.prisma, { ...p, promptTurnId: t1, wanted: 5000, now: new Date() })).reserved, 300);
  await assert.rejects(reserveTokens(db.prisma, { ...p, promptTurnId: await p.turn(), wanted: 10, now: new Date() }), BudgetExhausted);
  assert.equal(await tokenBalance(db.prisma, p.participantId), 0);
});

test('a failed call (used 0) is never charged', async () => {
  const p = await participantWithGrant(db.prisma, 500);
  const t = await p.turn();
  await reserveTokens(db.prisma, { ...p, promptTurnId: t, wanted: 400, now: new Date() });
  assert.equal(await settleTokens(db.prisma, { ...p, promptTurnId: t, used: 0 }), 0);
  assert.equal(await tokenBalance(db.prisma, p.participantId), 500);
});

test('reserve and settle are idempotent per turn; over-reported usage is clamped', async () => {
  const p = await participantWithGrant(db.prisma, 1000);
  const t = await p.turn();
  await reserveTokens(db.prisma, { ...p, promptTurnId: t, wanted: 100, now: new Date() });
  assert.equal((await reserveTokens(db.prisma, { ...p, promptTurnId: t, wanted: 900, now: new Date() })).reserved, 100);
  assert.equal(await settleTokens(db.prisma, { ...p, promptTurnId: t, used: 9999 }), 100);
  assert.equal(await settleTokens(db.prisma, { ...p, promptTurnId: t, used: 5 }), 100);
  assert.equal(await tokenBalance(db.prisma, p.participantId), 900);
});

test('a stale unsettled reservation is released in full at the next reserve', async () => {
  const p = await participantWithGrant(db.prisma, 1000);
  const t1 = await p.turn();
  await reserveTokens(db.prisma, { ...p, promptTurnId: t1, wanted: 1000, now: new Date() });
  const later = new Date(Date.now() + STALE_RESERVATION_MS + 60_000);
  const r = await reserveTokens(db.prisma, { ...p, promptTurnId: await p.turn(), wanted: 200, now: later });
  assert.deepEqual(r, { reserved: 200, remaining: 800 });
  // The late settle of the released turn changes nothing.
  assert.equal(await settleTokens(db.prisma, { ...p, promptTurnId: t1, used: 700 }), 0);
  assert.equal(await tokenBalance(db.prisma, p.participantId), 800);
});

test('settling a turn of another participant fails', async () => {
  const a = await participantWithGrant(db.prisma, 1000);
  const b = await participantWithGrant(db.prisma, 1000);
  const t = await a.turn();
  await reserveTokens(db.prisma, { ...a, promptTurnId: t, wanted: 100, now: new Date() });
  await assert.rejects(settleTokens(db.prisma, { participantId: b.participantId, promptTurnId: t, used: 0 }), /no reservation/);
});

const adminUrl = process.env.TEST_POSTGRES_URL;
test('concurrent reserves on real Postgres never overdraw', { skip: !adminUrl && 'TEST_POSTGRES_URL not set' }, async () => {
  const pg = await createPostgresTestDatabase(adminUrl!);
  try {
    const p = await participantWithGrant(pg.prisma, 1000);
    const turns = await Promise.all(Array.from({ length: 30 }, () => p.turn()));
    const results = await Promise.allSettled(turns.map((t) => reserveTokens(pg.prisma, { ...p, promptTurnId: t, wanted: 100, now: new Date() })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    assert.equal(ok.length, 10);
    assert.ok(results.every((r) => r.status === 'fulfilled' || r.reason instanceof BudgetExhausted));
    assert.equal(await tokenBalance(pg.prisma, p.participantId), 0);
  } finally {
    await pg.close();
  }
});
