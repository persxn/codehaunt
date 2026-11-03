import type { ReferenceResult } from './scoring.ts';

export interface MetricsSubmission {
  problemId: string;
  language: string;
  verdict: string | null;
  contestMs: number;
  maxTimeMs: number;
  maxMemoryKb: number;
}

export interface MetricsPrompt {
  problemId: string;
  contestMs: number;
  tokens: number;
}

export interface ProblemMetrics {
  problemId: string;
  accepted: boolean;
  prompts: number;            // prompts on this problem
  tokens: number;             // sum of prompt tokens on this problem
  attempts: number;           // submissions with a non-null verdict, up to and including the first AC (all of them if no AC)
  rejectedBeforeAccept: number; // attempts whose verdict is not 'AC' and not 'CE', before the first AC
  timeToAcceptMs: number | null; // contestMs of the first AC, else null
  tokensAfterAccept: number;  // tokens of prompts with contestMs > first AC contestMs (tokens wasted after solving); 0 if no AC
  timeRatio: number | null;   // accepted maxTimeMs / reference maxTimeMs (same language); null if no AC or no reference or reference is 0
  memoryRatio: number | null; // same for maxMemoryKb
}

export interface MetricsInput {
  problemIds: readonly string[];
  submissions: readonly MetricsSubmission[];   // order not guaranteed: sort by contestMs (stable) yourself
  prompts: readonly MetricsPrompt[];
  /** key `${problemId}:${language}` */
  references: Readonly<Record<string, ReferenceResult>>;
}

export interface ProcessMetrics {
  problems: ProblemMetrics[];
  totalTokens: number;
  tokensPerAccepted: number | null;
  solved: number;
}

/** Compute deterministic per‑problem process metrics for a participant.
 *  Pure function: does not mutate its input.
 */
export function computeProcessMetrics(input: MetricsInput): ProcessMetrics {
  const { problemIds, submissions, prompts, references } = input;
  const problemSet = new Set(problemIds);

  // Sort submissions by contest time (stable) and filter to relevant problems.
  const sortedSubs = [...submissions]
    .filter((s) => problemSet.has(s.problemId))
    .sort((a, b) => a.contestMs - b.contestMs);

  const subsBy = new Map<string, MetricsSubmission[]>(problemIds.map((pid) => [pid, []]));
  for (const s of sortedSubs) subsBy.get(s.problemId)!.push(s);
  const promptsBy = new Map<string, MetricsPrompt[]>(problemIds.map((pid) => [pid, []]));
  for (const p of prompts) promptsBy.get(p.problemId)?.push(p);

  const problems: ProblemMetrics[] = problemIds.map((pid) => {
    const subs = subsBy.get(pid)!;
    const pr = promptsBy.get(pid)!;

    const promptsCount = pr.length;
    const tokens = pr.reduce((sum, p) => sum + p.tokens, 0);

    const ac = subs.find((s) => s.verdict === 'AC');
    const accepted = !!ac;
    const timeToAcceptMs = ac ? ac.contestMs : null;

    let attempts = 0;
    let rejectedBeforeAccept = 0;
    for (const s of subs) {
      if (s.verdict === null) continue;
      attempts++;
      if (s.verdict !== 'AC' && s.verdict !== 'CE') {
        // Count rejections before the first AC (or all if no AC).
        rejectedBeforeAccept++;
      }
      if (s.verdict === 'AC') {
        // First AC encountered, stop counting further submissions.
        break;
      }
    }

    const tokensAfterAccept = ac
      ? pr.filter((p) => p.contestMs > ac.contestMs).reduce((sum, p) => sum + p.tokens, 0)
      : 0;

    let timeRatio: number | null = null;
    let memoryRatio: number | null = null;
    if (ac) {
      const key = `${pid}:${ac.language}`;
      const ref = references[key];
      if (ref) {
        if (ref.maxTimeMs > 0) {
          timeRatio = Math.round((ac.maxTimeMs / ref.maxTimeMs) * 1000) / 1000;
        }
        if (ref.maxMemoryKb > 0) {
          memoryRatio = Math.round((ac.maxMemoryKb / ref.maxMemoryKb) * 1000) / 1000;
        }
      }
    }

    return {
      problemId: pid,
      accepted,
      prompts: promptsCount,
      tokens,
      attempts,
      rejectedBeforeAccept,
      timeToAcceptMs,
      tokensAfterAccept,
      timeRatio,
      memoryRatio,
    };
  });

  const totalTokens = problems.reduce((sum, p) => sum + p.tokens, 0);
  const solved = problems.filter((p) => p.accepted).length;
  const tokensPerAccepted = solved > 0 ? totalTokens / solved : null;

  return { problems, totalTokens, tokensPerAccepted, solved };
}
