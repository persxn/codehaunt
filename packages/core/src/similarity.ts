/**
 * Cross-participant similarity (WP-07): near-identical prompts or code on the same problem become an integrity flag
 * for organizer review. It never changes a score (ADR-009).
 */
export interface SimilarityItem {
  participantId: string;
  problemId: string;
  kind: 'prompt' | 'code';
  text: string;
}

export interface SimilarityFlag {
  problemId: string;
  kind: 'prompt' | 'code';
  a: string;
  b: string;
  score: number;
}

export const SIMILARITY_THRESHOLD = 0.85;

const K = 5;
/** Shorter texts are too generic to mean anything ("print(n)"). */
const MIN_TOKENS = 10;

/** Tokens: lowercase, split into runs of [a-z0-9_] and single non-space symbol chars; whitespace dropped. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_]+|\S/g) ?? [];
}

function shingles(tokens: readonly string[]): Set<string> {
  if (tokens.length < K) return new Set([tokens.join(' ')]);
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - K; i++) set.add(tokens.slice(i, i + K).join(' '));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersect = 0;
  for (const s of a) if (b.has(s)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** Jaccard similarity of the sets of k-token shingles (k = 5). If either side has fewer than k tokens, use the whole token list joined as one shingle. Two empty texts → 0. */
export function similarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 && tokensB.length === 0) return 0;
  return jaccard(shingles(tokensA), shingles(tokensB));
}

/** Pairs of different participants whose prompts (or code) on one problem are near-identical. */
export function similarityFlags(items: readonly SimilarityItem[], threshold = SIMILARITY_THRESHOLD): SimilarityFlag[] {
  const groups = new Map<string, { problemId: string; kind: SimilarityItem['kind']; texts: Map<string, string[]> }>();
  for (const item of items) {
    const key = `${item.problemId}\u0000${item.kind}`;
    let group = groups.get(key);
    if (!group) {
      group = { problemId: item.problemId, kind: item.kind, texts: new Map() };
      groups.set(key, group);
    }
    const texts = group.texts.get(item.participantId) ?? [];
    texts.push(item.text);
    group.texts.set(item.participantId, texts);
  }

  const flags: SimilarityFlag[] = [];
  for (const group of groups.values()) {
    const sets: Array<[string, Set<string>]> = [];
    for (const [pid, texts] of group.texts) {
      const tokens = tokenize(texts.join('\n'));
      if (tokens.length >= MIN_TOKENS) sets.push([pid, shingles(tokens)]);
    }
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const [aId, aSet] = sets[i]!;
        const [bId, bSet] = sets[j]!;
        const score = jaccard(aSet, bSet);
        if (score < threshold) continue;
        const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
        flags.push({ problemId: group.problemId, kind: group.kind, a, b, score: Math.round(score * 1000) / 1000 });
      }
    }
  }

  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return flags.sort((x, y) => y.score - x.score || cmp(x.problemId, y.problemId) || cmp(x.kind, y.kind) || cmp(x.a, y.a) || cmp(x.b, y.b));
}
