/**
 * Inference gateway I/O (ADR-004, ADR-022). The web API on the DGX is the gateway's only client.
 *
 * The request is OpenAI chat-completions shaped, plus a `codehaunt` block carrying the per-request
 * caps the DGX reserved in its ledger. The reply is always an SSE stream of compact OpenAI chunks
 * (`choices[0].delta.content`, `finish_reason`; tokens merged per ~100 ms), then one chunk with `usage`
 * and `data: [DONE]`. A stream that ends without `usage` failed: the DGX releases the whole reservation.
 * Errors are `GatewayError` JSON.
 */
import { z } from 'zod';

export const ChatMessage = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(200_000),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessage>;

export const GatewayChatRequest = z.object({
  messages: z.array(ChatMessage).min(1).max(500),
  max_tokens: z.number().int().min(1).max(16_384),
  temperature: z.number().min(0).max(2).default(0.2),
  codehaunt: z.object({
    /** Tokens reserved for this request (prompt + reply); the reply is capped so the total never exceeds it. */
    budgetTokens: z.number().int().min(1),
    /** Context-window limit for the session; a longer prompt is refused before generation. */
    contextLimit: z.number().int().min(256),
    /** Model-context session id; requests of one session prefer the same node (prefix cache). */
    sessionId: z.string().min(1).max(64),
  }).strict(),
}).strict();
export type GatewayChatRequest = z.infer<typeof GatewayChatRequest>;

export const GatewayErrorCode = z.enum([
  'unauthorized',
  'bad_request',
  'budget_exceeded',
  'context_exceeded',
  'gateway_busy',
  'no_healthy_node',
  'upstream_failed',
  'not_found',
]);
export type GatewayErrorCode = z.infer<typeof GatewayErrorCode>;

export const GatewayError = z.object({
  error: z.object({ code: GatewayErrorCode, message: z.string() }),
  requestId: z.string(),
});
export type GatewayError = z.infer<typeof GatewayError>;

/** Final usage the gateway reports (OpenAI `usage` in the last SSE chunk). */
export const GatewayUsage = z.object({
  prompt_tokens: z.number().int().min(0),
  completion_tokens: z.number().int().min(0),
  total_tokens: z.number().int().min(0),
});
export type GatewayUsage = z.infer<typeof GatewayUsage>;
