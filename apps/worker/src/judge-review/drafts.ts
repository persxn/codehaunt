/**
 * GPT-OSS drafts per problem (WP-07 task 8, R8-Q6): small edge-case tests with a proposed output, and one naive
 * solution, stored as `problem_drafts` for an admin to approve. Before the contest only (the DGX is the event-day
 * judge). The statement is organizer-written; the model's reply is untrusted: schema-checked, and it only ever
 * becomes a hidden test or a calibration solution after an admin approves it.
 */
import { z } from 'zod';

import { DraftReply, EventConfig, type Checker } from '@codehaunt/contracts';
import { toDbLanguage } from '@codehaunt/core';
import type { PrismaClient } from '@codehaunt/db';

import type { JudgeModel } from './ollama.ts';
import type { Log } from './review.ts';

const SCHEMA = z.toJSONSchema(DraftReply);

export const DRAFT_SYSTEM_PROMPT = `You help organizers of a programming contest write hidden tests.
For the problem below, propose 3 to 6 SMALL edge-case tests (each input at most 2000 characters) that a careless
solution would fail: boundaries, overflow of 32-bit integers, empty or single-element cases, duplicates, extremes of
the constraints. For each give the exact expected output and one short reason. Then write one NAIVE solution in the
given language: correct on small inputs but too slow or too memory-hungry for the largest constraints (the obvious
brute force), reading standard input and writing standard output.
Reply with one JSON object only: {"tests":[{"input":"...","expectedOutput":"...","why":"..."}],
"naive":{"language":"<language>","source":"...","why":"..."}}.`;

export async function draftForEvent(deps: { prisma: PrismaClient; model: JudgeModel; log: Log }, eventId: string): Promise<{ problems: number; drafts: number; failed: number }> {
  const event = await deps.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { status: true, lockedAt: true, config: true } });
  if (event.lockedAt || !['DRAFT', 'CHECK_IN'].includes(event.status)) throw new Error('drafting is for before the contest only');
  const config = EventConfig.parse(event.config);
  const language = config.languages.includes('cpp') ? 'cpp' : config.languages[0]!;
  const problems = await deps.prisma.problem.findMany({
    where: { eventId },
    orderBy: { ord: 'asc' },
    select: { id: true, title: true, statement: true, timeLimitMs: true, memoryLimitMb: true, checker: true, testCases: { where: { visibility: 'VISIBLE' }, select: { input: true, expectedOutput: true } } },
  });
  const counts = { problems: 0, drafts: 0, failed: 0 };
  for (const p of problems) {
    const user = JSON.stringify({
      title: p.title, statement: p.statement, timeLimitMs: p.timeLimitMs, memoryLimitMb: p.memoryLimitMb,
      checker: (p.checker as Checker).kind, sampleTests: p.testCases, naiveLanguage: language,
    });
    let reply: DraftReply | null = null;
    for (let attempt = 0; attempt < 2 && !reply; attempt++) {
      try {
        const text = await deps.model.chat([{ role: 'system', content: DRAFT_SYSTEM_PROMPT }, { role: 'user', content: user }], SCHEMA);
        const parsed = DraftReply.safeParse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
        if (parsed.success) reply = parsed.data;
      } catch {
        // retried once, then counted as failed
      }
    }
    if (!reply) {
      counts.failed++;
      deps.log({ level: 'warn', msg: 'draft failed', problem: p.id });
      continue;
    }
    await deps.prisma.problemDraft.createMany({
      data: [
        ...reply.tests.map((t) => ({ problemId: p.id, kind: 'TEST' as const, input: t.input, expectedOutput: t.expectedOutput, note: t.why, model: deps.model.name })),
        { problemId: p.id, kind: 'NAIVE' as const, language: toDbLanguage(reply.naive.language), source: reply.naive.source, note: reply.naive.why, model: deps.model.name },
      ],
    });
    counts.problems++;
    counts.drafts += reply.tests.length + 1;
  }
  return counts;
}
