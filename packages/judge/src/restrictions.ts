
import type { Language } from './types.ts';
/**
 * Per-question restrictions on what a student may write.
 *
 * The teaching device this exists for: ban `if` and the only route through the
 * problem is a switch; ban `for` and they have to reach for `while`. Plenty of
 * exercises are about the construct rather than the answer, and without this a
 * student writes the loop they already know and learns nothing from a question
 * that was meant to teach them another one.
 *
 * Two decisions worth keeping:
 *
 *   1. **Checked before compiling, not after.** A submission using a banned
 *      keyword is refused with a sentence naming it, rather than judged. Letting
 *      it through and marking it wrong would tell a student their working
 *      program is incorrect, which is both untrue and useless.
 *
 *   2. **Comments and string literals are stripped first**, exactly as
 *      `definesMain` does. `// use a for loop here` and `printf("for")` are not
 *      violations, and a checker that thought otherwise would be worse than no
 *      checker — a student would have no way to tell what it objected to.
 */

/**
 * The keywords a teacher may ban.
 *
 * A fixed list rather than free text. The check is a word-boundary match on
 * stripped source, so allowing arbitrary strings would let a teacher ban `i` and
 * make the question unsolvable in a way nobody could debug — and would invite
 * banning a function name, which this cannot reliably see (a call can be built
 * through a pointer). Restricting it to language keywords keeps the promise the
 * feature makes honest.
 */
export const BANNABLE_KEYWORDS = [
  'if',
  'else',
  'switch',
  'case',
  'for',
  'while',
  'do',
  'break',
  'continue',
  'goto',
  'return',
  'int',
  'char',
  'float',
  'double',
  'long',
  'short',
  'unsigned',
  'void',
  'struct',
  'union',
  'enum',
  'typedef',
  'static',
  'const',
  'sizeof',
] as const;

export type BannableKeyword = (typeof BANNABLE_KEYWORDS)[number];

const BANNABLE = new Set<string>(BANNABLE_KEYWORDS);

export function isBannableKeyword(word: string): boolean {
  return BANNABLE.has(word);
}

/**
 * One compiled pattern per bannable keyword, built once from the fixed list.
 *
 * Compiling from the *stored* restriction instead is what silently closed a
 * question: one saved as `*` — from before the write-side filter existed — made
 * `new RegExp('\\b*\\b')` throw "Nothing to repeat" on every submission to it.
 * The throw landed before the submission row was written, so the student got a
 * connection error, no verdict, and no record that they had tried at all.
 *
 * Building from the allowlist removes the class of bug rather than the instance:
 * there is no string in this map that anybody outside this file chose, so no
 * stored value can be a pattern, throw, or match more than its own word. A
 * restriction that is not a bannable keyword is simply not enforced — see
 * `enforceableKeywords`, which is what the student is told about.
 *
 * Patterns are shared across calls, which is safe precisely because none of them
 * is global: `test` on a non-`/g` regex keeps no state between calls.
 */
const PATTERNS: ReadonlyMap<string, RegExp> = new Map(
  BANNABLE_KEYWORDS.map((keyword) => [
    keyword as string,
    // Word boundaries on both sides, so `format` does not count as `for` and
    // `iffy` does not count as `if`. Underscores and digits are word characters
    // to \b, which is what makes `my_if` safe too.
    new RegExp(`\\b${keyword}\\b`),
  ]),
);

/**
 * The part of a stored restriction list this module can actually enforce.
 *
 * Anything else is dead weight on the row — a keyword from an older build, or a
 * teacher's `*` meaning "no multiplication", which this was never able to see.
 * Pages filter what they show a student through this so the note under a
 * question cannot promise a restriction the judge does not apply.
 */
export function enforceableKeywords(banned: readonly string[]): string[] {
  return banned.filter((keyword) => PATTERNS.has(keyword));
}

/**
 * Removes comments and string and character literals.
 *
 * Shared in spirit with `definesMain` in harness.ts; kept as its own exported
 * function here because two callers now depend on the same definition of "text
 * the student actually wrote as code", and having two copies drift would mean
 * one check disagreeing with the other about the same submission.
 */
export function stripNonCode(code: string, language: Language = 'c'): string {
  if (language === 'python') {
    /*
     * Python's comments and strings are not C's, and getting this wrong is a
     * false *rejection* — the worst direction for this feature to fail in.
     *
     * A question banning `for` would otherwise refuse a correct recursive
     * solution because the student wrote `# no for loops here` above it, and the
     * message would tell them they used a construct they can plainly see they
     * did not.
     *
     * Triple-quoted strings are removed first: they contain quotes and newlines
     * that the single-quote rules below would otherwise chew through, leaving
     * fragments of a docstring in the text being searched.
     */
    return code
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      .replace(/#[^\n]*/g, ' ')
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  }

  // C and Java share comment and string syntax closely enough for one pass.
  // Java's text blocks are the exception, and are rare enough in a first-year
  // course to leave until somebody writes one.
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

/**
 * Which of the banned keywords this submission actually uses, in the order they
 * were banned.
 *
 * Returns all of them rather than the first: a student who used both `for` and
 * `if` should be told once, not made to resubmit to discover the second.
 *
 * Restrictions that are not bannable keywords are ignored rather than guessed
 * at; `enforceableKeywords` is the same rule, for telling the student what
 * actually applies.
 */
export function findBannedKeywords(
  code: string,
  banned: readonly string[],
  /**
   * Which language's comments and strings to ignore.
   *
   * Not cosmetic. Checking Python with the C stripper leaves `#` comments in the
   * searched text, so a question banning loops rejects a correct solution
   * because the student wrote the word "for" in a comment.
   */
  language: Language = 'c',
): string[] {
  if (banned.length === 0) return [];

  const stripped = stripNonCode(code, language);
  return banned.filter((keyword) => PATTERNS.get(keyword)?.test(stripped) ?? false);
}

/**
 * The sentence a student is shown.
 *
 * Written here rather than at each call site so the set route and the practice
 * route cannot end up explaining the same refusal two different ways.
 */
export function bannedKeywordMessage(used: string[]): string {
  const list = used.map((keyword) => `\`${keyword}\``).join(', ');
  return `This question does not allow ${list}. Solve it another way.`;
}
