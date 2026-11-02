/**
 * One prompt turn (ADR-018, ADR-022). Security-critical: Claude-owned.
 *
 * reserve tokens under the participant lock → stream the reply from the gateway → settle with the exact usage
 * (0 when the stream ended without usage) → store the reply and the extracted code. A reply without usage is
 * discarded. The call always runs to the end, even if the participant's browser goes away. Practice problems
 * (open only before the start) use no ledger: their tokens don't count (ADR-007).
 */
import { extractCode, fromDbLanguage } from '@codehaunt/core';
import type { PromptRequest, PromptResponse, PromptStreamEvent } from '@codehaunt/contracts';
import { BudgetExhausted, reserveTokens, settleTokens, tokenBalance, type PrismaClient } from '@codehaunt/db';

import { badRequest, conflict, notFound } from './errors.ts';
import type { ModelClient } from './gateway-client.ts';
import { openProblem, type ParticipantContext } from './contest.ts';
import { systemPrompt, userMessage } from './system-prompt.ts';

/** One prompt in flight per participant (the web runs as one process; ADR-003). */
const inFlight = new Set<string>();

const FAILURE_MESSAGES: Record<string, string> = {
  context_exceeded: "This session's context is full. Start a new session: your code carries over.",
  budget_exceeded: 'Not enough tokens left for this prompt. Try a shorter prompt or a new session.',
};
const GENERIC_FAILURE = 'The model failed, try again. You were not charged for this prompt.';

export interface PromptDeps {
  prisma: PrismaClient;
  model: ModelClient;
  now: () => Date;
  requestId: string;
}

/**
 * Validates and reserves synchronously (errors here become an HTTP error), then returns a function that runs the
 * model call and emits stream events. That function never throws and always settles.
 */
export async function startPrompt(
  deps: PromptDeps,
  ctx: ParticipantContext,
  request: PromptRequest,
): Promise<{ replay: PromptResponse } | { run: (emit: (event: PromptStreamEvent) => void) => Promise<void> }> {
  const { prisma } = deps;
  const config = ctx.event.config;
  if (request.prompt.length > config.budget.maxPromptChars) {
    throw badRequest(`Prompts are limited to ${config.budget.maxPromptChars} characters.`);
  }

  const existing = await prisma.promptTurn.findUnique({
    where: { idempotencyKey: request.idempotencyKey },
    include: { chatSession: { select: { participantId: true } } },
  });
  if (existing) {
    if (existing.chatSession.participantId !== ctx.participantId) throw conflict('idempotency_conflict', 'Send the prompt again.');
    if (existing.reply === null) throw conflict('prompt_pending', 'That prompt is still running or failed; send it again.');
    return { replay: await responseFor(prisma, ctx, existing.id) };
  }

  const problem = await openProblem(prisma, ctx, request.problemId, true);
  const session = await prisma.chatSession.findFirst({
    where: {
      participantId: ctx.participantId,
      problemId: problem.id,
      closedAt: null,
      ...(request.chatSessionId ? { id: request.chatSessionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) throw notFound('That session');

  if (inFlight.has(ctx.participantId)) throw conflict('prompt_in_progress', 'Wait for the current reply to finish.');
  inFlight.add(ctx.participantId);
  try {
    const history = await prisma.promptTurn.findMany({
      where: { chatSessionId: session.id },
      orderBy: { ord: 'asc' },
      select: { ord: true, prompt: true, reply: true },
    });
    const current = await currentCode(prisma, ctx.participantId, problem.id);
    const turn = await prisma.promptTurn.create({
      data: {
        chatSessionId: session.id,
        ord: (history.at(-1)?.ord ?? -1) + 1,
        idempotencyKey: request.idempotencyKey,
        prompt: request.prompt,
        model: config.model.name,
      },
    });

    const wanted = config.budget.contextTokens + config.budget.replyTokens;
    let reserved = wanted;
    if (!problem.practice) {
      try {
        reserved = (await reserveTokens(prisma, {
          eventId: ctx.event.id,
          participantId: ctx.participantId,
          promptTurnId: turn.id,
          wanted,
          now: deps.now(),
        })).reserved;
      } catch (error) {
        await prisma.promptTurn.delete({ where: { id: turn.id } });
        if (error instanceof BudgetExhausted) throw conflict('budget_exhausted', 'Your token budget is used up.');
        throw error;
      }
    }

    const language = fromDbLanguage(session.language);
    const messages = [
      { role: 'system' as const, content: systemPrompt(config.model.systemPromptVersion, language) },
      ...history.filter((t) => t.reply !== null).flatMap((t) => [
        { role: 'user' as const, content: t.prompt },
        { role: 'assistant' as const, content: t.reply! },
      ]),
      { role: 'user' as const, content: userMessage(request.prompt, current) },
    ];

    const run = async (emit: (event: PromptStreamEvent) => void) => {
      const started = Date.now();
      let used = 0;
      try {
        const outcome = await deps.model.chat(
          {
            messages,
            max_tokens: config.budget.replyTokens,
            temperature: config.model.temperature,
            codehaunt: { budgetTokens: reserved, contextLimit: config.budget.contextTokens, sessionId: session.id },
          },
          deps.requestId,
          (text) => emit({ type: 'delta', text }),
        );
        if (!outcome.ok) {
          emit({ type: 'error', code: 'model_failed', message: FAILURE_MESSAGES[outcome.code] ?? GENERIC_FAILURE });
          return;
        }
        used = outcome.usage.prompt_tokens + outcome.usage.completion_tokens;
        const extracted = extractCode(outcome.text, language);
        await prisma.$transaction([
          prisma.promptTurn.update({
            where: { id: turn.id },
            data: {
              reply: outcome.text,
              node: outcome.node,
              promptTokens: outcome.usage.prompt_tokens,
              completionTokens: outcome.usage.completion_tokens,
              latencyMs: Date.now() - started,
            },
          }),
          ...(extracted.ok
            ? [prisma.codeVersion.create({
                data: { chatSessionId: session.id, promptTurnId: turn.id, language: session.language, source: extracted.source },
              })]
            : []),
        ]);
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', msg: 'prompt failed', requestId: deps.requestId, error: String(error) }));
        emit({ type: 'error', code: 'model_failed', message: GENERIC_FAILURE });
        used = 0;
        return;
      } finally {
        inFlight.delete(ctx.participantId);
        if (!problem.practice) {
          await settleTokens(prisma, { participantId: ctx.participantId, promptTurnId: turn.id, used }).catch((error) => {
            // The stale-reservation sweep releases it at the next reserve (ADR-022).
            console.error(JSON.stringify({ level: 'error', msg: 'settle failed', requestId: deps.requestId, error: String(error) }));
          });
        }
      }
      emit({ type: 'done', response: await responseFor(prisma, ctx, turn.id) });
    };
    return { run };
  } catch (error) {
    inFlight.delete(ctx.participantId);
    throw error;
  }
}

/** The newest code version of this participant on this problem, across sessions (new sessions carry it). */
export async function currentCode(prisma: PrismaClient, participantId: string, problemId: string) {
  const version = await prisma.codeVersion.findFirst({
    where: { chatSession: { participantId, problemId } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, language: true, source: true },
  });
  return version ? { id: version.id, language: fromDbLanguage(version.language), source: version.source } : null;
}

async function responseFor(prisma: PrismaClient, ctx: ParticipantContext, turnId: string): Promise<PromptResponse> {
  const turn = await prisma.promptTurn.findUniqueOrThrow({
    where: { id: turnId },
    include: { codeVersions: { take: 1, orderBy: { createdAt: 'desc' } } },
  });
  const code = turn.codeVersions[0];
  return {
    turnId: turn.id,
    chatSessionId: turn.chatSessionId,
    reply: turn.reply ?? '',
    code: code ? { language: fromDbLanguage(code.language), source: code.source } : null,
    usage: {
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
      remainingTokens: await tokenBalance(prisma, ctx.participantId),
      contextTokensUsed: turn.promptTokens + turn.completionTokens,
      contextTokensLimit: ctx.event.config.budget.contextTokens,
    },
  };
}
