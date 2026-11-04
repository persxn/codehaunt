/**
 * `[claude]` One participant's judge input (`judge-v2`, ADR-033), read from the DB. Everything participant-written
 * stays data (the prompt wraps it, `judge-prompt-v2`). Hidden tests never enter: submissions contribute verdict and
 * test counts only. Tutor replies are what the participant saw (`filterReply`), not the stored unfiltered text.
 */
import {
  EventConfig,
  JUDGE_SNAPSHOTS_MAX,
  JUDGE_TEXT_MAX,
  JUDGE_TRANSCRIPT_MAX,
  JudgeInputV2,
  RunResult,
  type JudgeTranscriptEntryV2,
  type Verdict,
} from '@codehaunt/contracts';
import {
  aiCopy,
  codeHeavyQuestions,
  computeProcessMetrics,
  filterReply,
  fromDbLanguage,
  saveBursts,
  untrustedJson,
  type ReferenceResult,
} from '@codehaunt/core';
import type { PrismaClient } from '@codehaunt/db';

const TRUNCATED = '\n[truncated]';

/**
 * The whole judge input must fit the model's context with room for the rubric, a repair turn, reasoning and the reply
 * (audit R14-3, R14-NV1, R15-1). Measured as sent (`untrustedJson`, where each `<`, `>`, `&` is six characters):
 * 56,000 characters stay under ~24k tokens even for escape-dense code (~2.3 chars per token), inside the 32k context.
 * Over the context Ollama cuts the prompt silently (measured), so this is a hard limit.
 */
export const MAX_INPUT_CHARS = 56_000;

export class InputTooLarge extends Error {
  readonly chars: number;
  constructor(chars: number) {
    super(`judge input is ${chars} characters after trimming (limit ${MAX_INPUT_CHARS})`);
    this.chars = chars;
  }
}

/** The size the model receives: the escaped document inside the prompt, not plain JSON (audit R15-1). */
const size = (input: JudgeInputV2) => untrustedJson(input).length;
const cut = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max - TRUNCATED.length) + TRUNCATED);

/**
 * Shrinks an over-budget input in a fixed order, least informative first, and returns the steps taken (stored with
 * the review): tutor replies, middle snapshots, long questions, the middle of each transcript, then code.
 */
export function fitToBudget(input: JudgeInputV2, max = MAX_INPUT_CHARS): { input: JudgeInputV2; trimmed: string[] } {
  const trimmed: string[] = [];
  let current = input;
  const steps: Array<[string, (p: JudgeInputV2['problems'][number]) => JudgeInputV2['problems'][number]]> = [
    ['replies', (p) => ({ ...p, transcript: p.transcript.map((e) => (e.kind === 'reply' ? { ...e, text: cut(e.text, 400) } : e)) })],
    ['snapshots', (p) => ({ ...p, codeSnapshots: p.codeSnapshots.length > 2 ? [p.codeSnapshots[0]!, p.codeSnapshots.at(-1)!] : p.codeSnapshots })],
    ['questions', (p) => ({ ...p, transcript: p.transcript.map((e) => (e.kind === 'question' ? { ...e, text: cut(e.text, 800) } : e)) })],
    ['transcript', (p) => ({ ...p, transcript: p.transcript.length > 60 ? [...p.transcript.slice(0, 30), ...p.transcript.slice(-30)] : p.transcript })],
    ['code', (p) => ({ ...p, finalCode: p.finalCode && cut(p.finalCode, 3000), codeSnapshots: p.codeSnapshots.map((s) => ({ ...s, code: cut(s.code, 1500) })) })],
    // Second round, harder: still every turn and the final code, each shorter.
    ['replies-hard', (p) => ({ ...p, transcript: p.transcript.map((e) => (e.kind === 'reply' ? { ...e, text: cut(e.text, 120) } : e)) })],
    ['questions-hard', (p) => ({ ...p, transcript: p.transcript.map((e) => (e.kind === 'question' ? { ...e, text: cut(e.text, 300) } : e)) })],
    ['code-hard', (p) => ({ ...p, finalCode: p.finalCode && cut(p.finalCode, 2000), codeSnapshots: p.codeSnapshots.slice(-1).map((s) => ({ ...s, code: cut(s.code, 800) })) })],
  ];
  for (const [name, shrink] of steps) {
    if (size(current) <= max) break;
    current = { ...current, problems: current.problems.map(shrink) };
    trimmed.push(name);
  }
  if (size(current) > max) throw new InputTooLarge(size(current));
  return { input: current, trimmed };
}

export function clip(text: string): string {
  return text.length <= JUDGE_TEXT_MAX ? text : text.slice(0, JUDGE_TEXT_MAX - TRUNCATED.length) + TRUNCATED;
}

/** Keeps the first and last halves of an over-long transcript: how they started and how they finished. */
function capTranscript<T>(entries: T[]): T[] {
  if (entries.length <= JUDGE_TRANSCRIPT_MAX) return entries;
  const half = JUDGE_TRANSCRIPT_MAX / 2;
  return [...entries.slice(0, half), ...entries.slice(-half)];
}

/** First, evenly spaced, final: at most JUDGE_SNAPSHOTS_MAX, no duplicates. */
function pickSnapshots<T>(items: readonly T[]): T[] {
  if (items.length <= JUDGE_SNAPSHOTS_MAX) return [...items];
  const step = (items.length - 1) / (JUDGE_SNAPSHOTS_MAX - 1);
  return [...new Set(Array.from({ length: JUDGE_SNAPSHOTS_MAX }, (_, i) => Math.round(i * step)))].map((i) => items[i]!);
}

export interface BuiltInput {
  input: JudgeInputV2;
  /** Shrinking steps applied to fit the budget (`fitToBudget`); empty when the input fit as built. */
  trimmed: string[];
  /** For the review screen: which problems carry which deterministic flags. */
  flags: Array<{ problemId: string; saveBursts: number[]; aiCopiedLines: number; codeHeavyQuestions: number }>;
}

export async function buildJudgeInput(prisma: PrismaClient, participantId: string): Promise<BuiltInput> {
  const participant = await prisma.participant.findUniqueOrThrow({
    where: { id: participantId },
    select: { id: true, event: { select: { id: true, config: true, lockedAt: true } } },
  });
  const config = EventConfig.parse(participant.event.config);
  const startMs = (participant.event.lockedAt ?? new Date(config.schedule.startsAt)).getTime();
  const at = (d: Date) => Math.max(0, d.getTime() - startMs);
  const maxLines = config.model.maxExampleLines;

  const problems = await prisma.problem.findMany({
    where: { eventId: participant.event.id, practice: false },
    orderBy: { ord: 'asc' },
    select: { id: true, title: true, statement: true },
  });
  const sessions = await prisma.chatSession.findMany({
    where: { participantId, problemId: { in: problems.map((p) => p.id) } },
    select: {
      problemId: true,
      turns: { where: { reply: { not: null } }, select: { prompt: true, reply: true, promptTokens: true, completionTokens: true, createdAt: true } },
      codeVersions: { select: { id: true, source: true, language: true, createdAt: true } },
    },
  });
  const submissions = await prisma.submission.findMany({
    where: { participantId, problemId: { in: problems.map((p) => p.id) }, status: 'DONE' },
    orderBy: { createdAt: 'asc' },
    select: {
      problemId: true, kind: true, createdAt: true, contestMs: true, codeVersionId: true,
      codeVersion: { select: { language: true } },
      verdict: { select: { verdict: true, testsPassed: true, testsTotal: true, maxTimeMs: true, maxMemoryKb: true } },
    },
  });
  const calibrations = await prisma.calibrationRun.findMany({
    where: { kind: 'REFERENCE', status: 'DONE', problemId: { in: problems.map((p) => p.id) } },
    orderBy: { finishedAt: 'asc' },
    select: { problemId: true, language: true, result: true },
  });
  const references: Record<string, ReferenceResult> = {};
  for (const c of calibrations) {
    const result = RunResult.safeParse(c.result);
    if (result.success && result.data.verdict === 'AC') {
      references[`${c.problemId}:${c.language.toLowerCase()}`] = { maxTimeMs: result.data.maxTimeMs, maxMemoryKb: result.data.maxMemoryKb };
    }
  }

  const turns = sessions.flatMap((s) => s.turns.map((t) => ({ ...t, problemId: s.problemId })));
  const versions = sessions.flatMap((s) => s.codeVersions.map((v) => ({ ...v, problemId: s.problemId })));
  const submits = submissions.filter((s) => s.kind === 'SUBMIT' && s.verdict);
  const metrics = computeProcessMetrics({
    problemIds: problems.map((p) => p.id),
    submissions: submits.map((s) => ({
      problemId: s.problemId,
      language: s.codeVersion.language.toLowerCase(),
      verdict: s.verdict!.verdict,
      contestMs: s.contestMs ?? at(s.createdAt),
      maxTimeMs: s.verdict!.maxTimeMs,
      maxMemoryKb: s.verdict!.maxMemoryKb,
    })),
    prompts: turns.map((t) => ({ problemId: t.problemId, contestMs: at(t.createdAt), tokens: t.promptTokens + t.completionTokens })),
    references,
  });

  const flags: BuiltInput['flags'] = [];
  const input = JudgeInputV2.parse({
    participantRef: participant.id,
    problems: problems.map((problem) => {
      const mine = turns.filter((t) => t.problemId === problem.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const saves = versions.filter((v) => v.problemId === problem.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const runs = submissions.filter((s) => s.problemId === problem.id && s.verdict);
      const shown = mine.map((t) => filterReply(t.reply!, maxLines));
      const bursts = saveBursts(saves.map((v) => ({ atMs: at(v.createdAt), source: v.source })));
      const burstSet = new Set(bursts);
      const accepted = runs.find((s) => s.kind === 'SUBMIT' && s.verdict!.verdict === 'AC');
      const final = (accepted && saves.find((v) => v.id === accepted.codeVersionId)) ?? saves.at(-1) ?? null;
      const copy = final ? aiCopy(final.source, shown) : { copiedLines: 0, totalLines: 0, flagged: false };
      const heavy = codeHeavyQuestions(mine.map((t) => t.prompt)).length;
      flags.push({ problemId: problem.id, saveBursts: bursts, aiCopiedLines: copy.copiedLines, codeHeavyQuestions: heavy });

      const transcript: Array<JudgeTranscriptEntryV2 & { order: number }> = [
        ...mine.flatMap((t, i) => [
          { kind: 'question' as const, atMs: at(t.createdAt), tokens: t.promptTokens + t.completionTokens, text: clip(t.prompt), order: 0 },
          { kind: 'reply' as const, atMs: at(t.createdAt), text: clip(shown[i]!), order: 1 },
        ]),
        ...saves.map((v) => {
          const atMs = at(v.createdAt);
          return { kind: 'save' as const, atMs, chars: v.source.length, burst: burstSet.has(atMs), order: 2 };
        }),
        ...runs.map((s) => ({
          kind: s.kind === 'SUBMIT' ? ('submit' as const) : ('run' as const),
          atMs: s.contestMs ?? at(s.createdAt),
          // Checked by JudgeInputV2.parse below: an unknown verdict string fails the whole input.
          verdict: s.verdict!.verdict as Verdict,
          testsPassed: s.verdict!.testsPassed,
          testsTotal: s.verdict!.testsTotal,
          order: 3,
        })),
      ];
      transcript.sort((a, b) => a.atMs - b.atMs || a.order - b.order);
      const m = metrics.problems.find((p) => p.problemId === problem.id)!;
      return {
        problemId: problem.id,
        title: problem.title.slice(0, 200),
        statement: problem.statement.slice(0, 20_000),
        language: final ? fromDbLanguage(final.language) : null,
        metrics: {
          accepted: m.accepted, prompts: m.prompts, tokens: m.tokens, attempts: m.attempts,
          rejectedBeforeAccept: m.rejectedBeforeAccept, timeToAcceptMs: m.timeToAcceptMs,
          tokensAfterAccept: m.tokensAfterAccept, timeRatio: m.timeRatio, memoryRatio: m.memoryRatio,
        },
        transcript: capTranscript(transcript.map(({ order: _order, ...entry }) => entry)),
        codeSnapshots: pickSnapshots(saves).map((v) => ({ atMs: at(v.createdAt), code: clip(v.source) })),
        finalCode: final ? clip(final.source) : null,
        flags: { saveBursts: bursts.length, aiCopiedLines: copy.copiedLines, codeHeavyQuestions: heavy },
      };
    }),
  });
  return { ...fitToBudget(input), flags };
}
