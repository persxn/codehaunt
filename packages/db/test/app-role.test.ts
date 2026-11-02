import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { appRoleStatements, WEB_ROLE, WORKER_ROLE } from '../src/app-role.ts';
import { createTestDatabase, type TestDatabase } from '../src/testing.ts';

const PASSWORDS = { web: 'web-password-0123456', worker: 'worker-password-012345' };
let db: TestDatabase;

before(async () => {
  db = await createTestDatabase();
  await db.pglite.exec('CREATE TABLE _prisma_migrations (id text)'); // prisma migrate deploy creates it in production
  await db.pglite.exec(`CREATE ROLE codehaunt_app LOGIN; GRANT SELECT ON ALL TABLES IN SCHEMA public TO codehaunt_app`);
  for (const sql of appRoleStatements(PASSWORDS, 'postgres')) await db.pglite.exec(sql);
  await db.pglite.exec(`INSERT INTO audit_log (action, "targetType") VALUES ('seed', 'none')`);
});
after(async () => {
  await db?.close();
});

/** Runs `sql` as `role` and returns the error message, or null if it succeeded. */
async function as(role: string, sql: string): Promise<string | null> {
  await db.pglite.exec(`SET ROLE ${role}`);
  try {
    await db.pglite.exec(sql);
    return null;
  } catch (error) {
    return (error as Error).message;
  } finally {
    await db.pglite.exec('RESET ROLE');
  }
}

test('both roles can insert into and read the audit log', async () => {
  for (const role of [WEB_ROLE, WORKER_ROLE]) {
    assert.equal(await as(role, `INSERT INTO audit_log (action, "targetType") VALUES ('x', 'none')`), null, role);
    assert.equal(await as(role, 'SELECT count(*) FROM audit_log'), null, role);
  }
});

test('neither role can rewrite or empty the ledgers, even by switching the triggers off', async () => {
  for (const role of [WEB_ROLE, WORKER_ROLE]) {
    for (const table of ['audit_log', 'token_ledger']) {
      assert.match((await as(role, `DELETE FROM ${table}`)) ?? '', /permission denied/, `${role} ${table}`);
      assert.match((await as(role, `UPDATE ${table} SET id = id`)) ?? '', /permission denied/, `${role} ${table}`);
      assert.match((await as(role, `TRUNCATE ${table}`)) ?? '', /permission denied/, `${role} ${table}`);
      assert.match((await as(role, `ALTER TABLE ${table} DISABLE TRIGGER ALL`)) ?? '', /must be owner/, `${role} ${table}`);
    }
  }
  const { rows } = await db.pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_log');
  assert.equal(rows[0]!.n, 3);
});

test('the worker cannot read accounts or sessions, and writes only judging tables', async () => {
  assert.match((await as(WORKER_ROLE, 'SELECT "passwordHash" FROM users')) ?? '', /permission denied/);
  assert.match((await as(WORKER_ROLE, 'SELECT * FROM auth_sessions')) ?? '', /permission denied/);
  assert.match((await as(WORKER_ROLE, `UPDATE users SET role = 'ADMIN'`)) ?? '', /permission denied/);
  assert.match((await as(WORKER_ROLE, 'DELETE FROM test_cases')) ?? '', /permission denied/);
  assert.match((await as(WORKER_ROLE, 'UPDATE events SET name = name')) ?? '', /permission denied/);
  assert.equal(await as(WORKER_ROLE, 'SELECT count(*) FROM test_cases'), null, 'judging reads hidden tests');
  assert.equal(await as(WORKER_ROLE, 'UPDATE verdicts SET id = id'), null);
});

test('the web role keeps read/write on ordinary tables', async () => {
  assert.equal(await as(WEB_ROLE, `UPDATE users SET name = name`), null);
  assert.equal(await as(WEB_ROLE, 'DELETE FROM auth_sessions'), null);
});

test('no role touches migration history or creates roles; the old shared role is gone', async () => {
  for (const role of [WEB_ROLE, WORKER_ROLE]) {
    assert.match((await as(role, 'SELECT * FROM _prisma_migrations')) ?? '', /permission denied/, role);
    assert.match((await as(role, 'CREATE ROLE sneaky')) ?? '', /permission denied/, role);
  }
  const { rows } = await db.pglite.query(`SELECT 1 FROM pg_roles WHERE rolname = 'codehaunt_app'`);
  assert.equal(rows.length, 0);
});

test('passwords that would need quoting, or a shared password, are refused', () => {
  assert.throws(() => appRoleStatements({ ...PASSWORDS, web: "short'; DROP ROLE x; --" }, 'postgres'), /WEB_DB_PASSWORD/);
  assert.throws(() => appRoleStatements({ web: PASSWORDS.web, worker: PASSWORDS.web }, 'postgres'), /must differ/);
  assert.throws(() => appRoleStatements(PASSWORDS, 'bad;name'), /database name/);
});
