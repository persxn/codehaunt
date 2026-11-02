import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { APP_ROLE, appRoleStatements } from '../src/app-role.ts';
import { createTestDatabase, type TestDatabase } from '../src/testing.ts';

let db: TestDatabase;
before(async () => {
  db = await createTestDatabase();
  await db.pglite.exec('CREATE TABLE _prisma_migrations (id text)'); // prisma migrate deploy creates it in production
  for (const sql of appRoleStatements('test-password-0123', 'postgres')) await db.pglite.exec(sql);
  await db.pglite.exec(`INSERT INTO audit_log (action, "targetType") VALUES ('seed', 'none')`);
});
after(async () => {
  await db?.close();
});

/** Runs `sql` as the app role and returns the error message, or null if it succeeded. */
async function asApp(sql: string): Promise<string | null> {
  await db.pglite.exec(`SET ROLE ${APP_ROLE}`);
  try {
    await db.pglite.exec(sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    await db.pglite.exec('RESET ROLE');
  }
}

test('the app role can insert into and read the ledgers', async () => {
  assert.equal(await asApp(`INSERT INTO audit_log (action, "targetType") VALUES ('x', 'none')`), null);
  assert.equal(await asApp('SELECT count(*) FROM audit_log'), null);
});

test('the app role cannot rewrite or empty the ledgers, even by switching the triggers off', async () => {
  for (const table of ['audit_log', 'token_ledger']) {
    assert.match((await asApp(`DELETE FROM ${table}`)) ?? '', /permission denied/);
    assert.match((await asApp(`UPDATE ${table} SET id = id`)) ?? '', /permission denied/);
    assert.match((await asApp(`TRUNCATE ${table}`)) ?? '', /permission denied/);
    assert.match((await asApp(`ALTER TABLE ${table} DISABLE TRIGGER ALL`)) ?? '', /must be owner/);
  }
  const { rows } = await db.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_log');
  assert.equal(rows[0]!.n, 2);
});

test('the app role cannot touch migration history or create roles', async () => {
  assert.match((await asApp('SELECT * FROM _prisma_migrations')) ?? '', /permission denied/);
  assert.match((await asApp('CREATE ROLE sneaky')) ?? '', /permission denied/);
});

test('passwords that would need quoting are refused', () => {
  assert.throws(() => appRoleStatements("short'; DROP ROLE x; --", 'postgres'), /APP_DB_PASSWORD/);
  assert.throws(() => appRoleStatements('x'.repeat(16), 'bad;name'), /database name/);
});
