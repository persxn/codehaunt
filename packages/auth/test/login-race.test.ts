/**
 * One session per participant under concurrent logins (regression for build commit 7c0ae92).
 * Needs real Postgres: PGlite serialises connections, so the race cannot happen there.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { createPostgresTestDatabase } from '@codehaunt/db/testing';

import { hashPassword, login, resetLoginRateLimits } from '../src/index.ts';

const adminUrl = process.env.TEST_POSTGRES_URL;
const PASSWORD = 'race-pass-123';
let db: Awaited<ReturnType<typeof createPostgresTestDatabase>> | undefined;

before(async () => {
  if (!adminUrl) return;
  db = await createPostgresTestDatabase(adminUrl);
  await db.prisma.user.create({
    data: { username: 'racer', name: 'R', role: 'PARTICIPANT', passwordHash: await hashPassword(PASSWORD), active: true },
  });
});
after(async () => {
  await db?.close();
});

test('concurrent logins leave exactly one live participant session', { skip: !adminUrl && 'TEST_POSTGRES_URL not set' }, async () => {
  for (let round = 0; round < 5; round++) {
    resetLoginRateLimits();
    const results = await Promise.all(Array.from({ length: 8 }, () => login(db!.prisma, 'racer', PASSWORD)));
    assert.ok(results.every((r) => r.ok));
    assert.equal(await db!.prisma.authSession.count(), 1, `round ${round}`);
  }
});
