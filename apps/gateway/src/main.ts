import { ConfigError, loadConfig } from './config.ts';
import { HealthChecker } from './health.ts';
import { createMetrics } from './metrics.ts';
import { Router } from './router.ts';
import { createGateway } from './server.ts';

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(JSON.stringify({ msg: 'invalid config', key: err.key, error: err.message }));
  process.exit(1);
}

const router = new Router(config.nodes.map((n) => n.name), config.slotsPerNode, config.queueMax, config.queueTimeoutMs);
const health = new HealthChecker(router, config.nodes, {
  intervalMs: config.healthIntervalMs,
  failThreshold: config.healthFailThreshold,
});
const server = createGateway({ config, router, health, metrics: createMetrics() });
health.start();
server.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ msg: 'gateway listening', host: config.host, port: config.port, nodes: config.nodes.map((n) => n.name) }));
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    health.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 25_000).unref();
  });
}
