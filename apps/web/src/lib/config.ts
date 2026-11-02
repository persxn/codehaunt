/** Web app config: validated once at startup; invalid config exits with the key and reason (standards §2). */
import { z } from 'zod';

const WebConfig = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://', 'must be a postgresql:// URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Compose passes an unset variable as "" (`${COOKIE_SECURE:-}`): treat that as unset, i.e. Secure in production.
  COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
});
export type WebConfig = z.infer<typeof WebConfig>;

let cached: WebConfig | null = null;

/** Validation only, no caching or exit; for tests. */
export function parseConfig(env: Record<string, string | undefined>) {
  return WebConfig.safeParse(env);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  if (cached) return cached;
  // `next build` evaluates modules without runtime secrets; validate at server start instead.
  if (env.NEXT_PHASE === 'phase-production-build') return WebConfig.parse({ DATABASE_URL: 'postgresql://build' });
  const parsed = WebConfig.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`config: ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
