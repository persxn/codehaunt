/**
 * Integrity flags (ADR-033).
 * Provides detection of burst saves, AI‑copied code, and code‑heavy questions.
 */

import { looksLikeCode } from './reply-filter.ts';

export const SAVE_BURST_CHARS = 400;

export interface SavedVersion {
  /** Milliseconds timestamp */
  atMs: number;
  /** Source code snapshot */
  source: string;
}

/**
 * Detects burst saves where a participant quickly types a large amount of code.
 * Returns the timestamps of flagged saves.
 *
 * @param versions – array of saved versions (must not be mutated)
 * @param opts – optional maxGrowth (default SAVE_BURST_CHARS) and windowMs (default 30_000)
 */
export function saveBursts(
  versions: readonly SavedVersion[],
  opts?: { maxGrowth?: number; windowMs?: number },
): number[] {
  const maxGrowth = opts?.maxGrowth ?? SAVE_BURST_CHARS;
  const windowMs = opts?.windowMs ?? 30_000;

  // copy and sort by atMs ascending (stable sort)
  const sorted = [...versions].sort((a, b) => a.atMs - b.atMs);

  const flagged: number[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1]! : undefined;

    const isRestore = seen.has(cur.source);
    if (!isRestore) {
      if (i === 0) {
        if (cur.source.length > maxGrowth) flagged.push(cur.atMs);
      } else if (prev) {
        const growth = cur.source.length - prev.source.length;
        if (growth > maxGrowth && cur.atMs - prev.atMs <= windowMs) {
          flagged.push(cur.atMs);
        }
      }
    }
    seen.add(cur.source);
  }

  return flagged;
}

/**
 * Extracts lines that look like code from a set of replies.
 * Handles fenced blocks (``` or ~~~) and unfenced code‑like runs.
 */
export function shownCodeLines(replies: readonly string[]): string[] {
  const result: string[] = [];
  const fenceRegex = /^\s*(```|~~~)/;

  for (const reply of replies) {
    const lines = reply.split(/\r?\n/);
    let inFence = false;
    for (let raw of lines) {
      const line = raw; // keep original spacing for looksLikeCode
      if (fenceRegex.test(line)) {
        inFence = !inFence;
        continue; // fence line itself not returned
      }
      if (inFence) {
        if (line.trim()) result.push(line);
      } else {
        if (looksLikeCode(line)) result.push(line);
      }
    }
  }
  return result;
}

/**
 * Detect AI‑copied code.
 * Returns count of copied lines, total considered lines, and whether flagged.
 */
export function aiCopy(finalCode: string, replies: readonly string[]): { copiedLines: number; totalLines: number; flagged: boolean } {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

  const shown = shownCodeLines(replies)
    .map(norm)
    .filter((s) => s.length >= 8);
  const shownSet = new Set(shown);

  const finalLines = finalCode.split(/\r?\n/);
  let copied = 0;
  let total = 0;
  for (const raw of finalLines) {
    const n = norm(raw);
    if (n.length < 8) continue;
    total++;
    if (shownSet.has(n)) copied++;
  }
  const flagged = copied >= 5 || (total > 0 && copied / total >= 0.5 && copied >= 2);
  return { copiedLines: copied, totalLines: total, flagged };
}

/**
 * Detect questions that contain a high proportion of code lines.
 * Returns indexes of such questions.
 */
export function codeHeavyQuestions(questions: readonly string[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < questions.length; i++) {
    const lines = questions[i]!.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    const codeCount = lines.filter((l) => looksLikeCode(l)).length;
    if (codeCount >= 3 && codeCount / lines.length >= 0.5) result.push(i);
  }
  return result;
}
