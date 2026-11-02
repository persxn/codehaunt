import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';

// Configuration from environment and CLI
const GATEWAY_URL = process.env.GATEWAY_URL ?? '';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN ?? '';
if (!GATEWAY_URL || !GATEWAY_TOKEN) {
  console.error('Missing GATEWAY_URL or GATEWAY_TOKEN environment variables');
  process.exit(1);
}

const {
  values: {
    sessions: sessionsStr,
    turns: turnsStr,
    'max-tokens': maxTokensStr,
    budget: budgetStr,
    context: contextStr,
    'ramp-ms': rampMsStr,
  },
} = parseArgs({
  options: {
    sessions: { type: 'string', default: '40' },
    turns: { type: 'string', default: '3' },
    'max-tokens': { type: 'string', default: '400' },
    budget: { type: 'string', default: '20000' },
    context: { type: 'string', default: '8192' },
    'ramp-ms': { type: 'string', default: '2000' },
  },
});

const SESSIONS = Number(sessionsStr);
const TURNS = Number(turnsStr);
const MAX_TOKENS = Number(maxTokensStr);
const BUDGET_TOKENS = Number(budgetStr);
const CONTEXT_LIMIT = Number(contextStr);
const RAMP_MS = Number(rampMsStr);

if (Number.isNaN(SESSIONS) || Number.isNaN(TURNS) || Number.isNaN(MAX_TOKENS) || Number.isNaN(BUDGET_TOKENS) || Number.isNaN(CONTEXT_LIMIT) || Number.isNaN(RAMP_MS)) {
  console.error('Invalid numeric arguments');
  process.exit(1);
}

// Fixed system prompt
const systemMessage = { role: 'system' as const, content: 'You are a helpful junior developer who provides concise code snippets.' };

// Rotating user instructions (at least 6 distinct)
const userInstructions = [
  "C++: Write a program that reads n integers and prints the maximum subarray sum using Kadane's algorithm.",
  "Python: Write a function that computes the factorial of a number using recursion.",
  "C++: Implement a binary search tree with insert and inorder traversal functions.",
  "Python: Write a program to solve the two-sum problem efficiently.",
  "C++: Implement Dijkstra's algorithm for shortest paths in a graph.",
  "Python: Write a function to merge two sorted linked lists into one sorted list."
];

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type Usage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

// Metrics aggregation
let totalRequests = 0;
let okCount = 0;
const errorCounts = new Map<string, number>();
const ttftList: number[] = [];
const totalMsList: number[] = [];
let totalCompletionTokens = 0;

function recordError(code: string) {
  errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length);
  const idx = Math.min(rank - 1, sorted.length - 1);
  return sorted[idx]!;
}

async function runSession(index: number) {
  const sessionId = `load-${index}`;
  const messages: ChatMessage[] = [systemMessage];

  // Ramp delay: spread start times uniformly over RAMP_MS
  const delay = Math.floor((index * RAMP_MS) / SESSIONS);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));

  for (let turn = 0; turn < TURNS; ++turn) {
    const userContent = userInstructions[turn % userInstructions.length]!;
    const userMsg: ChatMessage = { role: 'user', content: userContent };
    messages.push(userMsg);

    const requestBody = {
      messages: messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      codehaunt: {
        budgetTokens: BUDGET_TOKENS,
        contextLimit: CONTEXT_LIMIT,
        sessionId: sessionId,
      },
    };

    const requestId = `${sessionId}-${turn}`;
    const start = performance.now();
    totalRequests++;
    let ttftRecorded = false;
    try {
      const resp = await fetch(`${GATEWAY_URL.replace(/\/*$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GATEWAY_TOKEN}`,
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(requestBody),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        let code = `http_${resp.status}`;
        try {
          const parsed = JSON.parse(txt);
          if (parsed && typeof parsed === 'object' && parsed.error && parsed.error.code) {
            code = parsed.error.code;
          }
        } catch {
          // ignore parse error
        }
        recordError(code);
        continue;
      }

      if (!resp.body) {
        recordError('no_body');
        continue;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let assistantContent = '';
      let usage: Usage | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        if (!ttftRecorded) {
          ttftList.push(now - start);
          ttftRecorded = true;
        }
        const chunkStr = decoder.decode(value, { stream: true });
        buffer += chunkStr;
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim(); // after 'data:'
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            const delta = Array.isArray(obj.choices) ? obj.choices[0]?.delta : undefined;
            if (delta && typeof delta.content === 'string') assistantContent += delta.content;
            // vLLM's usage chunk has `choices: []`, so check it on its own.
            if (obj.usage) usage = obj.usage as Usage;
          } catch {
            // ignore malformed JSON
          }
        }
      }

      const total = performance.now() - start;
      totalMsList.push(total);
      okCount++;
      if (usage && typeof usage.completion_tokens === 'number') {
        totalCompletionTokens += usage.completion_tokens;
      }
      // Append assistant reply for next turn
      messages.push({ role: 'assistant', content: assistantContent });
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      recordError(code);
    }
  }
}

(async () => {
  const wallStart = performance.now();
  const sessionPromises: Promise<void>[] = [];
  for (let i = 0; i < SESSIONS; ++i) {
    sessionPromises.push(runSession(i));
  }
  await Promise.all(sessionPromises);
  const wallEnd = performance.now();
  const wallSeconds = (wallEnd - wallStart) / 1000;

  const summary = {
    sessions: SESSIONS,
    turns: TURNS,
    requests: totalRequests,
    ok: okCount,
    errors: Object.fromEntries(errorCounts.entries()),
    ttftMs: {
      p50: Math.round(percentile(ttftList, 0.5)),
      p95: Math.round(percentile(ttftList, 0.95)),
      max: Math.round(Math.max(0, ...ttftList)),
    },
    totalMs: {
      p50: Math.round(percentile(totalMsList, 0.5)),
      p95: Math.round(percentile(totalMsList, 0.95)),
    },
    completionTokens: totalCompletionTokens,
    tokensPerSecondAggregate: wallSeconds > 0 ? totalCompletionTokens / wallSeconds : 0,
    wallSeconds: Number(wallSeconds.toFixed(2)),
  };

  console.log(JSON.stringify(summary));
  process.exit(errorCounts.size === 0 ? 0 : 1);
})();
