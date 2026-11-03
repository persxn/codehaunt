/** Web app config: validated once at startup; invalid config exits with the key and reason (standards §2). */
import { z } from 'zod';

import { sebConfig } from '@codehaunt/auth';

const WebConfig = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://', 'must be a postgresql:// URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Compose passes an unset variable as "" (`${COOKIE_SECURE:-}`): treat that as unset, i.e. Secure in production.
  COOKIE_SECURE: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['true', 'false']).optional()),
  // Inference gateway (ADR-022). Unset in a dev setup without the cluster: prompts then answer 503.
  GATEWAY_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  GATEWAY_FALLBACK_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  GATEWAY_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32, 'must be at least 32 characters').optional()),
  // SEB enforcement for participants (ADR-013): both set (public deployment) or both unset (localhost).
  SEB_CONFIG_KEY: z.string().optional(),
  PUBLIC_ORIGIN: z.string().optional(),
}).superRefine((env, ctx) => {
  try {
    sebConfig(env);
  } catch (error) {
    ctx.addIssue({ code: 'custom', path: ['SEB_CONFIG_KEY'], message: (error as Error).message });
  }
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
