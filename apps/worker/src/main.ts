/**
 * Worker process: health endpoints and the judge queue (ADR-025: sample runs, submissions, calibration runs).
 * LLM review (WP-07) and retention arrive later.
 */
import { createServer } from 'node:http';

import { createPrismaClient } from '@codehaunt/db';

import { loadConfig } from './config.ts';
import { judgeLoop } from './queue.ts';
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

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
const stop = new AbortController();
const loop = judgeLoop(prisma, runner, { concurrency: config.JUDGE_CONCURRENCY, log }, stop.signal);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    stop.abort();
    // Runs in progress finish first; a run cut off by a hard kill is requeued (RUNNING_TIMEOUT_MS).
    void loop.finally(() => prisma.$disconnect()).finally(() => process.exit(0));
  });
}
