import process from 'node:process';
import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read the repo-root .env by itself; every other process gets it via --env-file.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // No .env (fresh clone, CI): the environment stands.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://codehaunt:codehaunt@127.0.0.1:5434/codehaunt',
  },
});
