import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createTestDatabase, expectDbError, type TestDatabase } from '../src/testing.ts';


let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
});
after(async () => {
  await db?.close();
});

test('audit_log refuses UPDATE and DELETE', async () => {
  const row = await db.prisma.auditLog.create({ data: { action: 'test', targetType: 'none' } });
  await expectDbError(db.prisma, db.prisma.$executeRaw`UPDATE audit_log SET action = 'x' WHERE id = ${row.id}`, /append-only/);
  await expectDbError(db.prisma, db.prisma.$executeRaw`DELETE FROM audit_log WHERE id = ${row.id}`, /append-only/);
  await expectDbError(db.prisma, db.prisma.$executeRaw`TRUNCATE audit_log`, /append-only/);
  assert.equal(await db.prisma.auditLog.count(), 1);
});

test('token_ledger refuses UPDATE and DELETE; the budget is the sum of deltas', async () => {
  const event = await db.prisma.event.create({ data: { slug: 'e', name: 'E', config: {} } });
  const user = await db.prisma.user.create({
    data: { username: 'p1', name: 'P', role: 'PARTICIPANT', passwordHash: 'x' },
  });
  const participant = await db.prisma.participant.create({
    data: { eventId: event.id, userId: user.id, enrolmentNo: 'E1' },
  });
  const base = { eventId: event.id, participantId: participant.id };
  await db.prisma.tokenLedger.create({ data: { ...base, kind: 'GRANT', delta: 1000, idempotencyKey: 'g' } });
  const usage = await db.prisma.tokenLedger.create({
    data: { ...base, kind: 'USAGE', delta: -250, idempotencyKey: 'u' },
  });

  await expectDbError(db.prisma, db.prisma.$executeRaw`UPDATE token_ledger SET delta = 0 WHERE id = ${usage.id}`, /append-only/);
  await expectDbError(db.prisma, db.prisma.$executeRaw`DELETE FROM token_ledger`, /append-only/);

  const sum = await db.prisma.tokenLedger.aggregate({ where: { participantId: participant.id }, _sum: { delta: true } });
  assert.equal(sum._sum.delta, 750);
});
