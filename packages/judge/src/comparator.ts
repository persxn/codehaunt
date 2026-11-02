/**
 * Output checkers.
 *
 * The classroom default is deliberately forgiving about case and trailing
 * whitespace: a student who prints "Hello World" when the expected answer is
 * "hello world" has solved the problem, and failing them on capitalisation
 * teaches nothing about C. Codeforces takes the same line.
 *
 * What is *not* forgiven: missing or extra lines, wrong token order, and
 * differences in interior whitespace within a line.
 */

import type { CheckerConfig } from './types.ts';

/** Collapses CRLF/CR to LF so a Windows-authored expected file still matches. */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Trims trailing whitespace from every line and drops trailing blank lines.
 * A final newline (or the lack of one) never decides a verdict.
 */
function normalizeLines(text: string): string[] {
  const lines = normalizeNewlines(text).split('\n').map((line) => line.replace(/[ \t\v\f]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Case-insensitive, trailing-whitespace-insensitive line comparison. */
export function checkCaseInsensitive(actual: string, expected: string): boolean {
  const a = normalizeLines(actual);
  const e = normalizeLines(expected);
  if (a.length !== e.length) return false;
  return a.every((line, i) => line.toLowerCase() === e[i]!.toLowerCase());
}

/**
 * Exact comparison, retaining case and interior whitespace. Only line-ending
 * style and a trailing newline at end-of-output are normalized, since those are
 * artefacts of how the file was written rather than program behaviour.
 */
export function checkStrictWhitespace(actual: string, expected: string): boolean {
  const a = normalizeNewlines(actual).replace(/\n+$/, '');
  const e = normalizeNewlines(expected).replace(/\n+$/, '');
  return a === e;
}

const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Token-wise comparison where numeric tokens match within a tolerance.
 * Used for problems whose answers are decimals, where the last digit of a
 * `printf("%f")` is not something to fail a student over.
 *
 * Tolerance is satisfied if either the absolute or the relative difference is
 * within bounds — the standard competitive-programming rule, which keeps very
 * large and very small magnitudes both workable.
 */
export function checkFloat(actual: string, expected: string, tolerance = 1e-6): boolean {
  const a = normalizeNewlines(actual).split(/\s+/).filter(Boolean);
  const e = normalizeNewlines(expected).split(/\s+/).filter(Boolean);
  if (a.length !== e.length) return false;

  for (let i = 0; i < a.length; i++) {
    const at = a[i]!;
    const et = e[i]!;
    if (NUMERIC.test(at) && NUMERIC.test(et)) {
      const an = Number(at);
      const en = Number(et);
      if (!Number.isFinite(an) || !Number.isFinite(en)) return false;
      const diff = Math.abs(an - en);
      const relative = diff / Math.max(1, Math.abs(en));
      if (diff > tolerance && relative > tolerance) return false;
    } else if (at.toLowerCase() !== et.toLowerCase()) {
      return false;
    }
  }
  return true;
}

/** Dispatches to the checker configured on the problem. */
export function check(actual: string, expected: string, config: CheckerConfig): boolean {
  switch (config.kind) {
    case 'strictWhitespace':
      return checkStrictWhitespace(actual, expected);
    case 'float':
      return checkFloat(actual, expected, config.tolerance ?? 1e-6);
    case 'caseInsensitive':
      return checkCaseInsensitive(actual, expected);
  }
}

/**
 * Builds a compact, line-aligned diff for sample tests, so a student sees
 * exactly which line diverged rather than two walls of text.
 * Only ever shown for sample cases — hidden tests reveal nothing.
 */
export function firstDifference(
  actual: string,
  expected: string,
): { line: number; actual: string; expected: string } | null {
  const a = normalizeLines(actual);
  const e = normalizeLines(expected);
  const max = Math.max(a.length, e.length);
  for (let i = 0; i < max; i++) {
    const al = a[i] ?? '<no line>';
    const el = e[i] ?? '<no line>';
    if (al.toLowerCase() !== el.toLowerCase()) {
      return { line: i + 1, actual: al, expected: el };
    }
  }
  return null;
}
