/**
 * GPT-OSS through Ollama's native chat API (ADR-035: reached on 127.0.0.1 by the one-shot judge-review container).
 * The output JSON schema goes in `format`, so decoding is constrained to the shape; the caller still validates it,
 * because the schema can't express every bound (e.g. one review per input problem).
 */
export interface JudgeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JudgeModel {
  readonly name: string;
  /** Returns the model's reply text; throws on transport errors and timeouts. */
  chat(messages: readonly JudgeMessage[], schema: unknown): Promise<string>;
}

export class OllamaJudgeModel implements JudgeModel {
  readonly name: string;
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly think: string;

  constructor(options: { url: string; model: string; timeoutMs?: number; think?: string }) {
    this.url = `${options.url.replace(/\/+$/, '')}/api/chat`;
    this.name = options.model;
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
    this.think = options.think ?? 'low';
  }

  async chat(messages: readonly JudgeMessage[], schema: unknown): Promise<string> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.name,
        messages,
        stream: false,
        format: schema,
        // gpt-oss reasons before answering; "low" keeps a participant within the 45-minute batch budget (task 9).
        think: this.think,
        options: { temperature: 0, num_ctx: 32_768 },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`ollama ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const body = (await response.json()) as { message?: { content?: unknown } };
    if (typeof body.message?.content !== 'string') throw new Error('ollama: reply without message content');
    return body.message.content;
  }
}
