/**
 * In-process Postgres (PGlite) for tests, with every shipped migration applied in order.
 * Ported from JojoCode packages/db/test/harness.ts @ a8f4056. Test-only: imports devDependencies.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

import { createPrismaClient, type PrismaClient } from './client.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url));

async function migrationSql(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return Promise.all(dirs.map((name) => readFile(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')));
}

/** Random ephemeral port with retry: `node --test` runs each file in its own process. */
async function startServer(pglite: PGlite): Promise<{ server: PGLiteSocketServer; port: number }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = 40_000 + Math.floor(Math.random() * 20_000);
    const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1' });
    try {
      await server.start();
      return { server, port };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('could not find a free port for the test database');
}

export interface TestDatabase {
  prisma: PrismaClient;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const dataDir = await mkdtemp(join(tmpdir(), 'codehaunt-pglite-'));
  const pglite = await PGlite.create({ dataDir });
  for (const sql of await migrationSql()) await pglite.exec(sql);

  const { server, port } = await startServer(pglite);
  // PGLiteSocketServer serves one connection at a time.
  const prisma = createPrismaClient({
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    maxConnections: 1,
  });

  return {
    prisma,
    close: async () => {
      await prisma.$disconnect().catch(() => {});
      await server.stop().catch(() => {});
      await pglite.close().catch(() => {});
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Asserts that a query fails with `pattern`, then recovers the connection.
 *
 * PGLiteSocketServer drops the connection after any error raised through Prisma's pg
 * adapter, and the next query fails with "Connection terminated" before the pool reconnects.
 * Real Postgres does not do this; the throwaway query only exists for PGlite.
 */
export async function expectDbError(prisma: PrismaClient, query: Promise<unknown>, pattern: RegExp): Promise<void> {
  let error: unknown = null;
  try {
    await query;
  } catch (caught) {
    error = caught;
  }
  if (!error) throw new Error(`expected a database error matching ${pattern}`);
  if (!pattern.test(String((error as Error).message))) throw error;
  await prisma.$queryRawUnsafe('SELECT 1').catch(() => {});
}
