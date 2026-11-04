/**
 * Tutor reply filter (ADR-033). Security-critical: Claude-owned.
 *
 * The tutor may show code only as short examples. Whatever the model writes, a participant sees at most `maxLines`
 * lines (and `maxLines * CHARS_PER_LINE` characters) of code per reply: fenced blocks and unfenced runs of code-like
 * lines both count. Anything over that is replaced by `REMOVED_EXAMPLE`. A block is held back until it ends or
 * passes the limit, so streaming never shows part of a block that is later removed.
 *
 * Works on whole lines: the streaming filter and `filterReply` give the same text for the same reply.
 */

export const REMOVED_EXAMPLE = '[example removed: too long]';
export const CHARS_PER_LINE = 80;

const FENCE = /^\s*(```|~~~)/;
const ENDS_LIKE_CODE = /[;{}]\s*$/;
const STARTS_LIKE_CODE =
  /^\s*(#include\b|#define\b|import\s|from\s+\S+\s+import\b|def\s|class\s|public\s|private\s|protected\s|static\s|const\s|let\s|var\s|int\s|long\s|short\s|unsigned\s|void\s|char\s|bool\s|boolean\s|double\s|float\s|string\s|String\s|auto\s|vector<|std::|using\s|template\s*<|for\s*\(|while\s*\(|if\s*\(|else\b|elif\b|return\b|print\(|printf\(|scanf\(|cout\b|cin\b|System\.|Scanner\b)/;
const PY_BLOCK = /^\s*(if|for|while|def|elif|else|try|except|with|class)\b.*:\s*$/;
const ASSIGNMENT = /^\s*[A-Za-z_]\w*(\[[^\]]*\])*\s*(=|\+=|-=|\*=|\/=|%=|<<=|>>=)\s*\S/;

/** A line that reads as code rather than prose. Blank lines are neither. */
export function looksLikeCode(line: string): boolean {
  if (!line.trim()) return false;
  if (ENDS_LIKE_CODE.test(line) || STARTS_LIKE_CODE.test(line) || PY_BLOCK.test(line) || ASSIGNMENT.test(line)) return true;
  return (line.match(/;/g)?.length ?? 0) >= 2;
}

interface Held {
  held: string[];
  lines: number;
  chars: number;
  dropped: boolean;
}

export interface ReplyFilter {
  /** Feed raw model text; returns the text that may be shown now. */
  push(text: string): string;
  /** End of the reply; returns whatever was held back and may be shown. */
  end(): string;
}

export function createReplyFilter(maxLines: number): ReplyFilter {
  const maxChars = maxLines * CHARS_PER_LINE;
  let partial = '';
  let shownLines = 0;
  let shownChars = 0;
  // Fenced block: lines held (including the opening fence), or dropped once over the limit.
  let fence: Held | null = null;
  // Unfenced code-like run, with any blank lines inside it.
  let run: Held | null = null;

  const fits = (lines: number, chars: number) => shownLines + lines <= maxLines && shownChars + chars <= maxChars;
  const take = (lines: number, chars: number) => {
    shownLines += lines;
    shownChars += chars;
  };

  /** Resolve the unfenced run: show it if it fit, else the marker. Trailing blank lines are shown either way. */
  const closeRun = (): string => {
    if (!run) return '';
    let tail = 0;
    while (tail < run.held.length && !run.held[run.held.length - 1 - tail]!.trim()) tail++;
    const body = run.held.slice(0, run.held.length - tail);
    const blanks = run.held.slice(run.held.length - tail).join('');
    const out = run.dropped ? '' : body.join('');
    if (!run.dropped) take(run.lines, run.chars);
    run = null;
    return out + blanks;
  };

  const line = (text: string): string => {
    const bare = text.replace(/\r?\n$/, '');
    if (fence) {
      if (FENCE.test(bare)) {
        const f = fence;
        fence = null;
        if (f.dropped) return '';
        take(f.lines, f.chars);
        return f.held.join('') + text;
      }
      if (addToFence(fence, bare, text)) return `${REMOVED_EXAMPLE}\n`;
      return '';
    }
    if (FENCE.test(bare)) {
      const before = closeRun();
      fence = { held: [text], lines: 0, chars: 0, dropped: false };
      return before;
    }
    if (looksLikeCode(bare)) {
      run ??= { held: [], lines: 0, chars: 0, dropped: false };
      if (run.dropped) return '';
      run.held.push(text);
      run.lines += 1;
      run.chars += bare.length;
      if (!fits(run.lines, run.chars)) {
        run.dropped = true;
        run.held = [];
        return `${REMOVED_EXAMPLE}\n`;
      }
      return '';
    }
    if (!bare.trim() && run) {
      if (!run.dropped) run.held.push(text);
      return '';
    }
    return closeRun() + text;
  };

  /** Adds a line to the open fence; true when this line pushed it over the limit (the marker is shown once). */
  function addToFence(f: Held, bare: string, text: string): boolean {
    if (f.dropped) return false;
    f.held.push(text);
    if (bare.trim()) {
      f.lines += 1;
      f.chars += bare.length;
    }
    if (fits(f.lines, f.chars)) return false;
    f.dropped = true;
    f.held = [];
    return true;
  }

  return {
    push(text) {
      partial += text;
      let out = '';
      let cut: number;
      while ((cut = partial.indexOf('\n')) !== -1) {
        out += line(partial.slice(0, cut + 1));
        partial = partial.slice(cut + 1);
      }
      return out;
    },
    end() {
      let out = partial ? line(partial) : '';
      partial = '';
      if (fence) {
        // An unclosed block is shown like a closed one if it fit.
        const f = fence;
        fence = null;
        if (!f.dropped) {
          take(f.lines, f.chars);
          out += f.held.join('');
        }
      }
      return out + closeRun();
    },
  };
}

/** The whole reply as a participant sees it. */
export function filterReply(text: string, maxLines: number): string {
  const filter = createReplyFilter(maxLines);
  return filter.push(text) + filter.end();
}
