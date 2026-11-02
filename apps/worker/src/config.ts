/** Worker config: validated once at startup; invalid config exits with the key and reason. */
import { z } from 'zod';

const WorkerConfig = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://', 'must be a postgresql:// URL'),
  RUNNER_IMAGE: z.string().regex(/^[\w./-]+:[\w.-]+$/, 'must be name:tag').default('codehaunt-runner:1'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
  WORKER_HEALTH_HOST: z.string().default('127.0.0.1'),
  // The docker-proxy refuses more than 16 concurrent sandboxes (ADR-019).
  JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(8),
});
export type WorkerConfig = z.infer<typeof WorkerConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = WorkerConfig.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`config: ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  return parsed.data;
}
