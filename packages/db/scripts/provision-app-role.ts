// Run by the `migrate` service after `prisma migrate deploy`, as the owner (DATABASE_URL).
// Needs WEB_DB_PASSWORD and WORKER_DB_PASSWORD.
import pg from 'pg';

import { appRoleStatements, WEB_ROLE, WORKER_ROLE } from '../src/app-role.ts';

const url = process.env.DATABASE_URL;
const web = process.env.WEB_DB_PASSWORD;
const worker = process.env.WORKER_DB_PASSWORD;
if (!url || !web || !worker) {
  console.error('provision-app-role: DATABASE_URL, WEB_DB_PASSWORD and WORKER_DB_PASSWORD are required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query<{ db: string }>('SELECT current_database() AS db');
  await client.query('BEGIN');
  for (const sql of appRoleStatements({ web, worker }, rows[0]!.db)) await client.query(sql);
  await client.query('COMMIT');
  console.log(`provision-app-role: ${WEB_ROLE} and ${WORKER_ROLE} ready`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('provision-app-role:', (error as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
