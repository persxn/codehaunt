/**
 * GPT-OSS through Ollama's native chat API (ADR-035): from the judge-review container through the relay's unix socket
 * (`socketPath`), or directly by URL in development and `scripts/judge-golden.ts`. A cut prompt is caught by the rubric check code (review.ts) and the problem-coverage check, not here.
 * The output JSON schema goes in `format`, so decoding is constrained to the shape; the caller still validates it,
 * because the schema can't express every bound (e.g. one review per input problem).
 */
import { request } from 'node:http';

export interface JudgeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JudgeModel {
  readonly name: string;
  /** Returns the model's reply text; throws on transport errors and timeouts. */
  chat(messages: readonly JudgeMessage[], schema: unknown): Promise<string>;
}

/** Same context as FORGE's JojoAI uses, so switching between them doesn't reload the 65 GB model. */
export const NUM_CTX = 32_768;

/** One POST over TCP or a unix socket; resolves with the status and the whole body, rejects on timeout. */
function post(target: { url: URL; socketPath?: string }, body: string, timeoutMs: number): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        ...(target.socketPath ? { socketPath: target.socketPath } : { host: target.url.hostname, port: target.url.port }),
        path: '/api/chat',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end(body);
  });
}

export class OllamaJudgeModel implements JudgeModel {
  readonly name: string;
  private readonly target: { url: URL; socketPath?: string };
  private readonly timeoutMs: number;
  private readonly think: string;

  constructor(options: { url: string; socketPath?: string; model: string; timeoutMs?: number; think?: string }) {
    this.target = { url: new URL(options.url), ...(options.socketPath ? { socketPath: options.socketPath } : {}) };
    this.name = options.model;
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.think = options.think ?? 'low';
  }

  async chat(messages: readonly JudgeMessage[], schema: unknown): Promise<string> {
    const response = await post(this.target, JSON.stringify({
      model: this.name,
      messages,
      stream: false,
      format: schema,
      // gpt-oss reasons before answering; "low" keeps a participant within the 45-minute batch budget (task 9).
      think: this.think,
      options: { temperature: 0, num_ctx: NUM_CTX },
    }), this.timeoutMs);
    if (response.status !== 200) throw new Error(`ollama ${response.status}: ${response.text.slice(0, 200)}`);
    // No truncation check here: prompt_eval_count excludes prompt-cache hits, so it can't tell a cut prompt from a
    // cached one (measured 2026-11-04). The rubric check code in the reply (review.ts) catches a lost system message.
    const body = JSON.parse(response.text) as { message?: { content?: unknown } };
    if (typeof body.message?.content !== 'string') throw new Error('ollama: reply without message content');
    return body.message.content;
  }
}
