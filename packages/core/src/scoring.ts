/**
 * Scoring (ADR-009, constants in ADR-028). Pure: the leaderboard service loads the rows, this ranks them. One
 * implementation backs the live board, the projector and the results export.
 *
 * Correctness is ported from JojoCode `packages/db/src/contest.ts` @ a8f4056 (`decayedPoints`): Codeforces-style decay
 * with a 30% floor and a fixed cost per rejected submission. CodeHaunt adds the token, resource and judge components.
 */

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ScoreComponentName = 'correctness' | 'tokenEfficiency' | 'resourceEfficiency' | 'processQuality';

/** A problem's value before decay (ADR-028). */
export const PROBLEM_VALUE: Readonly<Record<Difficulty, number>> = { EASY: 500, MEDIUM: 1000, HARD: 1500 };
/** A solved problem never drops below this share of its value (JojoCode). */
export const DECAY_FLOOR = 0.3;
/** Runtime and memory get this much slack so timer noise on tiny tests doesn't decide anything. */
const TIME_SLACK_MS = 10;
const MEMORY_SLACK_KB = 10 * 1024;

export interface ScoringRules {
  weights: Readonly<Record<ScoreComponentName, number>>;
  wrongSubmissionPenalty: number;
  /** Points lost per contest minute per 500 points of value (Codeforces). */
  decayPerMinute: number;
}

export interface ScoringSubmission {
  problemId: string;
  language: string;
  /** null while it is queued, running or failed: it counts for nothing yet. */
  verdict: string | null;
  /** Contest time elapsed when it was made (pauses excluded). */
  contestMs: number;
  maxTimeMs: number;
  maxMemoryKb: number;
  /** false once staff reversed its penalty (incident). */
  counts: boolean;
}

export interface ScoringParticipant {
  id: string;
  name: string;
  disqualified: boolean;
  /** Submits on contest problems, in the order they were made. Sample runs and practice never reach here. */
  submissions: readonly ScoringSubmission[];
  /** Tokens spent on contest problems. */
  tokens: number;
  /** Mean judge score 0–100 (WP-07), or null while pending. */
  judgeScore: number | null;
  /** Newest organizer override per component. */
  overrides: Partial<Record<ScoreComponentName, number>>;
}

export interface ReferenceResult {
  maxTimeMs: number;
  maxMemoryKb: number;
}

export interface ProblemScore {
  problemId: string;
  solved: boolean;
  points: number;
  rejected: number;
  attempts: number;
  solvedAtMs: number | null;
}

export interface Standing {
  participantId: string;
  name: string;
  disqualified: boolean;
  /** null for disqualified participants: they are listed, never ranked. */
  rank: number | null;
  solved: number;
  tokens: number;
  lastAcceptMs: number | null;
  correctness: number;
  tokenEfficiency: number;
  resourceEfficiency: number;
  /** null while the judge hasn't scored (it then adds 0 for everyone, which leaves the ranking unchanged). */
  processQuality: number | null;
  total: number;
  problems: ProblemScore[];
  /** Solved problems with no reference calibration in the language used (resource counted as full marks). */
  missingReference: string[];
  overridden: ScoreComponentName[];
}

export function decayedPoints(value: number, elapsedMs: number, rejected: number, rules: Pick<ScoringRules, 'wrongSubmissionPenalty' | 'decayPerMinute'>): number {
  const minutes = Math.max(0, elapsedMs) / 60_000;
  const decayed = value - (value / 500) * rules.decayPerMinute * minutes;
  const penalised = decayed - rules.wrongSubmissionPenalty * rejected;
  return Math.max(Math.round(value * DECAY_FLOOR), Math.round(penalised));
}

/** A judged submit that isn't AC or CE is a wrong attempt (a counted IE is WA, ADR-021), unless its penalty was reversed. */
function isRejection(s: ScoringSubmission): boolean {
  return s.verdict !== null && s.verdict !== 'AC' && s.verdict !== 'CE' && s.counts;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface ScoreInput {
  /** Contest problems only (practice never counts). */
  problems: ReadonlyArray<{ id: string; difficulty: Difficulty }>;
  participants: readonly ScoringParticipant[];
  /** REFERENCE calibration results, keyed `${problemId}:${language}`. */
  references: ReadonlyMap<string, ReferenceResult>;
  rules: ScoringRules;
}

export function computeStandings(input: ScoreInput): Standing[] {
  const maxPoints = input.problems.reduce((sum, p) => sum + PROBLEM_VALUE[p.difficulty], 0);

  const rows = input.participants.map((p) => {
    let points = 0;
    let lastAcceptMs: number | null = null;
    const resource: number[] = [];
    const missingReference: string[] = [];
    const problems = input.problems.map((problem): ProblemScore => {
      const attempts = p.submissions.filter((s) => s.problemId === problem.id);
      const acIndex = attempts.findIndex((s) => s.verdict === 'AC');
      const accepted = acIndex >= 0 ? attempts[acIndex]! : null;
      const rejected = attempts.slice(0, acIndex >= 0 ? acIndex : attempts.length).filter(isRejection).length;
      if (!accepted) return { problemId: problem.id, solved: false, points: 0, rejected, attempts: attempts.length, solvedAtMs: null };

      const earned = decayedPoints(PROBLEM_VALUE[problem.difficulty], accepted.contestMs, rejected, input.rules);
      points += earned;
      lastAcceptMs = Math.max(lastAcceptMs ?? 0, accepted.contestMs);
      const ref = input.references.get(`${problem.id}:${accepted.language}`);
      if (ref) {
        const time = Math.min(1, (ref.maxTimeMs + TIME_SLACK_MS) / (accepted.maxTimeMs + TIME_SLACK_MS));
        const memory = Math.min(1, (ref.maxMemoryKb + MEMORY_SLACK_KB) / (accepted.maxMemoryKb + MEMORY_SLACK_KB));
        resource.push((time + memory) / 2);
      } else {
        missingReference.push(problem.id);
        resource.push(1);
      }
      return { problemId: problem.id, solved: true, points: earned, rejected, attempts: attempts.length, solvedAtMs: accepted.contestMs };
    });
    const solved = problems.filter((x) => x.solved).length;
    return {
      p,
      problems,
      solved,
      lastAcceptMs,
      missingReference,
      correctness: maxPoints ? (100 * points) / maxPoints : 0,
      resourceEfficiency: resource.length ? (100 * resource.reduce((a, b) => a + b, 0)) / resource.length : 0,
      tokensPerSolve: solved ? p.tokens / solved : null,
    };
  });

  const med = median(rows.filter((r) => !r.p.disqualified && r.tokensPerSolve !== null).map((r) => r.tokensPerSolve!));
  const w = input.rules.weights;

  const standings: Standing[] = rows.map((r) => {
    const tokenEfficiency = r.tokensPerSolve === null ? 0 : med ? clamp(100 - (50 * r.tokensPerSolve) / med) : 100;
    const computed: Record<ScoreComponentName, number | null> = {
      correctness: r.correctness,
      tokenEfficiency,
      resourceEfficiency: r.resourceEfficiency,
      processQuality: r.p.judgeScore,
    };
    const overridden = (Object.keys(r.p.overrides) as ScoreComponentName[]).filter((k) => r.p.overrides[k] !== undefined);
    for (const k of overridden) computed[k] = r.p.overrides[k]!;
    const c = (k: ScoreComponentName) => (computed[k] === null ? null : round2(clamp(computed[k]!)));
    const total = round2(
      (Object.keys(w) as ScoreComponentName[]).reduce((sum, k) => sum + w[k] * (c(k) ?? 0), 0),
    );
    return {
      participantId: r.p.id,
      name: r.p.name,
      disqualified: r.p.disqualified,
      rank: null,
      solved: r.solved,
      tokens: r.p.tokens,
      lastAcceptMs: r.lastAcceptMs,
      correctness: c('correctness')!,
      tokenEfficiency: c('tokenEfficiency')!,
      resourceEfficiency: c('resourceEfficiency')!,
      processQuality: c('processQuality'),
      total,
      problems: r.problems,
      missingReference: r.missingReference,
      overridden,
    };
  });

  return rankStandings(standings);
}

/** ADR-009 order: total, then higher correctness → fewer tokens → earlier last acceptance. */
export function compareStandings(a: Standing, b: Standing): number {
  return (
    b.total - a.total ||
    b.correctness - a.correctness ||
    a.tokens - b.tokens ||
    (a.lastAcceptMs ?? Infinity) - (b.lastAcceptMs ?? Infinity) ||
    0
  );
}

/** Ranked participants first (equal on every key = same rank, as JojoCode's `assignRanks`), disqualified last. */
export function rankStandings(standings: Standing[]): Standing[] {
  const ranked = standings.filter((s) => !s.disqualified).sort(compareStandings);
  let previous: Standing | null = null;
  let rank = 0;
  ranked.forEach((s, i) => {
    rank = previous && compareStandings(previous, s) === 0 ? rank : i + 1;
    s.rank = rank;
    previous = s;
  });
  const out = standings.filter((s) => s.disqualified).sort((a, b) => a.name.localeCompare(b.name));
  return [...ranked, ...out];
}
