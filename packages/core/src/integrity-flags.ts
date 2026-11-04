/**
 * Integrity flags (ADR-033).
 * Provides detection of burst saves, AI‑copied code, and code‑heavy questions.
 */

import { isFence, looksLikeCode, unwrapLine } from './reply-filter.ts';

export const SAVE_BURST_CHARS = 400;
/** Growth over any 60 s of saves above this is faster than sustained typing, ~12.5 chars/s (audit R15-2). */
export const SUSTAINED_CHARS_PER_MINUTE = 750;
const MINUTE_MS = 60_000;

export interface SavedVersion {
  /** Milliseconds timestamp */
  atMs: number;
  /** Source code snapshot */
  source: string;
}

/**
 * Saves that grew faster than anyone types (ADR-033). Autosave writes only changed code, every 20 s, so the gap since
 * the previous save is idle time, not typing time: what a save adds was typed within about one autosave interval
 * (audit R15-2). A save is flagged when it alone grows by more than `maxGrowth` (the first save counts from ''), or
 * when the growth of the saves in the minute up to it exceeds `perMinute`. A save equal to an earlier version (a
 * restore) never counts. Returns the timestamps of flagged saves, ascending.
 */
export function saveBursts(
  versions: readonly SavedVersion[],
  opts?: { maxGrowth?: number; perMinute?: number },
): number[] {
  const maxGrowth = opts?.maxGrowth ?? SAVE_BURST_CHARS;
  const perMinute = opts?.perMinute ?? SUSTAINED_CHARS_PER_MINUTE;
  const sorted = [...versions].sort((a, b) => a.atMs - b.atMs);
  const flagged: number[] = [];
  const seen = new Set<string>();
  // Growth of each typed (non-restore) save, for the one-minute window.
  const growths: Array<{ atMs: number; growth: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const restore = seen.has(cur.source);
    seen.add(cur.source);
    if (restore) continue;
    const growth = cur.source.length - (i > 0 ? sorted[i - 1]!.source.length : 0);
    growths.push({ atMs: cur.atMs, growth: Math.max(0, growth) });
    const lastMinute = growths.filter((g) => g.atMs > cur.atMs - MINUTE_MS).reduce((n, g) => n + g.growth, 0);
    // Only a save that added code can be the fast one; a shrink in the same minute as a burst is not.
    if (growth > 0 && (growth > maxGrowth || lastMinute > perMinute)) flagged.push(cur.atMs);
  }
  return flagged;
}

/**
 * Extracts lines that look like code from a set of replies.
 * Handles fenced blocks (``` or ~~~) and unfenced code‑like runs.
 */
export function shownCodeLines(replies: readonly string[]): string[] {
  const result: string[] = [];
  for (const reply of replies) {
    const lines = reply.split(/\r?\n/);
    let inFence = false;
    for (const line of lines) {
      if (isFence(line)) {
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
  // Both sides unwrapped, so a line shown as `` `x = 1` `` or `3. x = 1` matches `x = 1` (audit R16-1).
  const norm = (s: string) => unwrapLine(s).trim().replace(/\s+/g, ' ');

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
