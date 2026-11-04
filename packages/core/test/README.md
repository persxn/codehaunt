# test

## Contents
| File | Description |
|---|---|
| `reply-filter.test.ts` | Tutor reply filter (ADR-033): 6-line examples shown, 7+ removed (fenced and unfenced), per-reply limit, long one-liners by characters, stream = whole reply in any chunking, no early leak, code detection. |
| `contest-clock.test.ts` | Unit tests for `contestClock` (actual start, pauses, elapsed time). |
| `verdict-projection.test.ts` | Verdict projection tests. |
| `scoring.test.ts` | Decay, penalties (IE counts, CE/pending/reversed don't), token median, resource vs reference, weights, overrides, tie-breaks, disqualified. |
| `process-metrics.test.ts` | Attempts/rejections up to the first AC, null verdicts, unsorted input, tokens after AC, reference ratios (missing, zero), unlisted problems, no mutation. |
| `similarity.test.ts` | Tokenizer, identical and case/whitespace-only copies flagged, different code not, self/cross-problem/cross-kind never paired, short texts skipped, ordering, threshold. |
| `judge-prompt.test.ts` | Judge prompt v1: participant text cannot close the data tag (JSON round-trips), rubric only in the system message, injection hints on prompts and final code without flagging ordinary instructions. |
