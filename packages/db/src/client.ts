import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client.ts';

export * from './generated/enums.ts';
export { PrismaClient } from './generated/client.ts';
export type * from './generated/models.ts';

export interface CreateClientOptions {
  url?: string;
  maxConnections?: number;
}

/** The only way to obtain a client. Uses the pg driver adapter so tests can point it at PGlite. */
export function createPrismaClient(options: CreateClientOptions = {}): PrismaClient {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const adapter = new PrismaPg({
    connectionString: url,
    ...(options.maxConnections ? { max: options.maxConnections } : {}),
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { codehauntPrisma?: PrismaClient };

/** Process-wide client (Next.js dev reloads modules; this keeps one pool). */
export function getPrismaClient(): PrismaClient {
  globalForPrisma.codehauntPrisma ??= createPrismaClient();
  return globalForPrisma.codehauntPrisma;
}
