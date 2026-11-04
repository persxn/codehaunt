/**
 * One question to the tutor (ADR-033, ADR-022). Security-critical: Claude-owned.
 *
 * reserve tokens under the participant lock → stream the reply from the gateway through the reply filter → settle
 * with the exact usage (0 when the stream ended without usage) → store the question and the unfiltered reply (staff
 * and the judge read it; the participant only ever gets the filtered text). The model sees the tutor prompt and this
 * session's questions and replies, never the participant's code or the statement. Replies never change the code.
 * A reply without usage is discarded. The call always runs to the end, even if the participant's browser goes away. Practice problems
 * (open only before the start) use no ledger: their tokens don't count (ADR-007).
 */
import { createReplyFilter, filterReply, fromDbLanguage, toDbLanguage } from '@codehaunt/core';
import type { PromptRequest, PromptResponse, PromptStreamEvent } from '@codehaunt/contracts';
import { BudgetExhausted, reserveTokens, settleTokens, tokenBalance, type PrismaClient } from '@codehaunt/db';

import { badRequest, conflict, notFound } from './errors.ts';
import type { ModelClient } from './gateway-client.ts';
import { openProblem, type ParticipantContext } from './contest.ts';
import { systemPrompt } from './system-prompt.ts';

/** One prompt in flight per participant (the web runs as one process; ADR-003). */
const inFlight = new Set<string>();

const FAILURE_MESSAGES: Record<string, string> = {
  context_exceeded: "This chat's context is full. Start a new chat: your code is not affected.",
  budget_exceeded: 'Not enough tokens left for this question. Try a shorter question or a new chat.',
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
    throw badRequest(`Questions are limited to ${config.budget.maxPromptChars} characters.`);
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
  const open = await prisma.chatSession.findFirst({
    where: {
      participantId: ctx.participantId,
      problemId: problem.id,
      closedAt: null,
      ...(request.chatSessionId ? { id: request.chatSessionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!open && request.chatSessionId) throw notFound('That session');
  // The first question on a problem opens its chat, in the language of the newest saved code (ADR-033).
  const session = open ?? (await prisma.chatSession.create({
    data: {
      participantId: ctx.participantId,
      problemId: problem.id,
      language: (await prisma.codeVersion.findFirst({
        where: { chatSession: { participantId: ctx.participantId, problemId: problem.id } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { language: true },
      }))?.language ?? toDbLanguage(config.languages[0] ?? 'cpp'),
    },
  }));

  if (inFlight.has(ctx.participantId)) throw conflict('prompt_in_progress', 'Wait for the current reply to finish.');
  inFlight.add(ctx.participantId);
  try {
    const history = await prisma.promptTurn.findMany({
      where: { chatSessionId: session.id },
      orderBy: { ord: 'asc' },
      select: { ord: true, prompt: true, reply: true },
    });
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
      { role: 'system' as const, content: systemPrompt(config.model.systemPromptVersion, language, config.model.maxExampleLines) },
      ...history.filter((t) => t.reply !== null).flatMap((t) => [
        { role: 'user' as const, content: t.prompt },
        // The model gets back what the participant saw, so removed code can't be re-sent in pieces later.
        { role: 'assistant' as const, content: filterReply(t.reply!, config.model.maxExampleLines) },
      ]),
      { role: 'user' as const, content: request.prompt },
    ];

    const run = async (emit: (event: PromptStreamEvent) => void) => {
      const started = Date.now();
      let used = 0;
      const filter = createReplyFilter(config.model.maxExampleLines);
      try {
        const outcome = await deps.model.chat(
          {
            messages,
            max_tokens: config.budget.replyTokens,
            temperature: config.model.temperature,
            codehaunt: { budgetTokens: reserved, contextLimit: config.budget.contextTokens, sessionId: session.id },
          },
          deps.requestId,
          (text) => {
            const shown = filter.push(text);
            if (shown) emit({ type: 'delta', text: shown });
          },
        );
        if (!outcome.ok) {
          emit({ type: 'error', code: 'model_failed', message: FAILURE_MESSAGES[outcome.code] ?? GENERIC_FAILURE });
          return;
        }
        // From here on the participant has seen the whole reply: it is charged even if storing it fails (audit M1).
        used = outcome.usage.prompt_tokens + outcome.usage.completion_tokens;
        const rest = filter.end();
        if (rest) emit({ type: 'delta', text: rest });
        const text = outcome.text.replaceAll('\u0000', '');
        await prisma.promptTurn.update({
          where: { id: turn.id },
          data: {
            reply: text,
            node: outcome.node,
            promptTokens: outcome.usage.prompt_tokens,
            completionTokens: outcome.usage.completion_tokens,
            latencyMs: Date.now() - started,
          },
        });
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', msg: 'prompt failed', requestId: deps.requestId, error: String(error) }));
        emit({ type: 'error', code: 'model_failed', message: used ? 'The reply could not be saved. Send the prompt again.' : GENERIC_FAILURE });
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
      try {
        emit({ type: 'done', response: await responseFor(prisma, ctx, turn.id) });
      } catch {
        emit({ type: 'error', code: 'reload', message: 'The reply was saved; reload to see it.' });
      }
    };
    return { run };
  } catch (error) {
    inFlight.delete(ctx.participantId);
    throw error;
  }
}

async function responseFor(prisma: PrismaClient, ctx: ParticipantContext, turnId: string): Promise<PromptResponse> {
  const turn = await prisma.promptTurn.findUniqueOrThrow({ where: { id: turnId } });
  return {
    turnId: turn.id,
    chatSessionId: turn.chatSessionId,
    reply: filterReply(turn.reply ?? '', ctx.event.config.model.maxExampleLines),
    usage: {
      promptTokens: turn.promptTokens,
      completionTokens: turn.completionTokens,
      remainingTokens: await tokenBalance(prisma, ctx.participantId),
      contextTokensUsed: turn.promptTokens + turn.completionTokens,
      contextTokensLimit: ctx.event.config.budget.contextTokens,
    },
  };
}
