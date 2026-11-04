/**
 * One-shot batch judge (ADR-035): `docker compose --profile judge run --rm judge-review`, after staff queue judging.
 * Drains `judge_jobs`, then exits 0 (1 when the config is invalid). Never runs code, so it needs no sandbox.
 * `... run --rm judge-review drafts <eventId>` instead drafts tests and naive solutions (before the contest only).
 */
import { z } from 'zod';

import { createPrismaClient } from '@codehaunt/db';

import { OllamaJudgeModel } from './ollama.ts';
import { draftForEvent } from './drafts.ts';
import { drainJudgeQueue } from './review.ts';

const Config = z.object({
  DATABASE_URL: z.string().startsWith('postgresql://', 'must be a postgresql:// URL'),
  JUDGE_OLLAMA_URL: z.url().default('http://127.0.0.1:11434'),
  JUDGE_MODEL: z.string().min(1).default('gpt-oss:120b'),
  JUDGE_THINK: z.enum(['low', 'medium', 'high']).default('low'),
});

const parsed = Config.safeParse(process.env);
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(`config: ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const config = parsed.data;
const prisma = createPrismaClient({ url: config.DATABASE_URL, maxConnections: 2 });
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));
const model = new OllamaJudgeModel({ url: config.JUDGE_OLLAMA_URL, model: config.JUDGE_MODEL, think: config.JUDGE_THINK });

const started = Date.now();
const [command, eventId] = process.argv.slice(2);
if (command === 'drafts') {
  if (!eventId) {
    console.error('usage: judge-review drafts <eventId>');
    process.exit(1);
  }
  const counts = await draftForEvent({ prisma, model, log }, eventId);
  log({ level: 'info', msg: 'drafts written', ...counts, durationMs: Date.now() - started });
} else {
  const counts = await drainJudgeQueue({ prisma, model, log });
  log({ level: 'info', msg: 'judge queue empty', ...counts, durationMs: Date.now() - started });
}
await prisma.$disconnect();
