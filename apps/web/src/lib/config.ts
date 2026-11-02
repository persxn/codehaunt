/** Web app config: validated once at startup; invalid config exits with the key and reason (standards §2). */
import { z } from 'zod';

const WebConfig = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://', 'must be a postgresql:// URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});
export type WebConfig = z.infer<typeof WebConfig>;

let cached: WebConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  if (cached) return cached;
  const parsed = WebConfig.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`config: ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
