/**
 * Worker process. WP-01: config, CodeRunner readiness and health endpoints only;
 * pg-boss consumers (sample runs, judging, LLM review, retention) arrive in WP-03/05/07.
 */
import { createServer } from 'node:http';

import { createPrismaClient } from '@codehaunt/db';

import { loadConfig } from './config.ts';
import { DockerCodeRunner } from './sandbox/code-runner.ts';

const config = loadConfig();
const prisma = createPrismaClient({ url: config.DATABASE_URL, maxConnections: 4 });
const runner = new DockerCodeRunner({ image: config.RUNNER_IMAGE });

async function readiness(): Promise<string[]> {
  const failing: string[] = [];
  await prisma.$queryRawUnsafe('SELECT 1').catch(() => failing.push('database'));
  for (const language of await runner.missingImages()) failing.push(`runner-image:${language}`);
  return failing;
}

const server = createServer(async (request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  };
  if (request.url === '/healthz') return send(200, { ok: true });
  if (request.url === '/readyz') {
    const failing = await readiness();
    return send(failing.length ? 503 : 200, { ok: failing.length === 0, failing });
  }
  send(404, { error: { code: 'not_found', message: 'Not found.' } });
});

server.listen(config.WORKER_HEALTH_PORT, config.WORKER_HEALTH_HOST, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'worker ready', port: config.WORKER_HEALTH_PORT }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
