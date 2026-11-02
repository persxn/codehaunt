/**
 * Zod schemas for prompt interactions.
 */
import { z } from 'zod';
import { Language } from './judge.ts';

/** Prompt request from participant. */
export const PromptRequest = z.object({
  problemId: z.string().min(1),
  chatSessionId: z.string().optional(),
  prompt: z.string().trim().min(1).max(20000),
  idempotencyKey: z.uuid(),
});
export type PromptRequest = z.infer<typeof PromptRequest>;

/** Prompt usage statistics. */
export const PromptUsage = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  remainingTokens: z.number().int(),
  contextTokensUsed: z.number().int().min(0),
  contextTokensLimit: z.number().int().min(1),
});
export type PromptUsage = z.infer<typeof PromptUsage>;

/** Prompt response returned to participant. */
export const PromptResponse = z.object({
  turnId: z.string().min(1),
  chatSessionId: z.string().min(1),
  reply: z.string(),
  code: z
    .object({
      language: Language,
      source: z.string(),
    })
    .nullable(),
  usage: PromptUsage,
});
export type PromptResponse = z.infer<typeof PromptResponse>;

/**
 * What `POST /api/contest/prompt` streams, one JSON object per line (NDJSON): reply deltas as they arrive, then
 * exactly one `done` or `error`. On `error` the streamed text is discarded (no code version; ADR-022).
 */
export const PromptStreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), response: PromptResponse }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type PromptStreamEvent = z.infer<typeof PromptStreamEvent>;
