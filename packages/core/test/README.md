# test

## Contents
| File | Description |
|---|---|
| `reply-filter.test.ts` | Tutor reply filter (ADR-033): 6-line examples shown, 7+ removed (fenced and unfenced), per-reply limit, long one-liners by characters, stream = whole reply in any chunking, no early leak, code detection; audit R16-1 (a 9-line solution unfenced, per-line backticks, numbered, line numbers, bullets, quoted or listed fence, C++ variants: all removed) and R16-4 (300-char cap). |
| `tutor-guardrails.test.ts` | ADR-042: answer-seeking vs. concept/hint/debugging/general classification, hint ladder cap, steering text, pseudo-code detection (strict only), hints-only replies, 3-line examples kept, the 12-line chat allowance and its markers, stats, limits rebuilt from a stored guardrail. |
| `contest-clock.test.ts` | Unit tests for `contestClock` (actual start, pauses, elapsed time). |
| `verdict-projection.test.ts` | Verdict projection tests. |
| `scoring.test.ts` | Decay, ADR-034 penalties (20% per rejection after the floor; 0/1/5/6 rejections; unsolved problems; total ≥ 0; IE counts, CE/pending/reversed don't), token median, resource vs reference, weights, overrides, tie-breaks, disqualified. |
| `process-metrics.test.ts` | Attempts/rejections up to the first AC, null verdicts, unsorted input, tokens after AC, reference ratios (missing, zero), unlisted problems, no mutation. |
| `similarity.test.ts` | Tokenizer, identical and case/whitespace-only copies flagged, different code not, self/cross-problem/cross-kind never paired, short texts skipped, ordering, threshold. |
| `integrity-flags.test.ts` | Integrity flags (ADR-033): save bursts (normal typing, +500 in 20 s, slow growth, first save, restores, unsorted input, no mutation), AI copy (6 copied lines, 1 line, whitespace, short lines, lines shown in backticks/numbered/quoted), shown code lines (incl. a quoted fence), code-heavy questions. |
| `judge-prompt-v2.test.ts` | Judge prompt v2: versioned, tutor-mode rubric (no junior wording), participant text cannot close the data tag, injection hints on questions and final code only. |
| `judge-prompt.test.ts` | Judge prompt v1: participant text cannot close the data tag (JSON round-trips), rubric only in the system message, injection hints on prompts and final code without flagging ordinary instructions. |
