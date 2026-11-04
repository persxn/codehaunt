# core/src
Framework-free business logic of `@codehaunt/core`: pure functions, no I/O, no clock reads.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `language.ts` | the four languages: contract name ↔ DB enum, display label, code-fence tags (`LANGUAGES`, `toDbLanguage`, `fromDbLanguage`) |
| `verdict-projection.ts` | `[claude]` `toParticipantVerdict`: what a participant may see of a run (counts; time/memory only for samples and Accepted submissions, ADR-027; visible-test detail; CE log) |
| `reply-filter.ts` | `[claude]` ADR-033: `createReplyFilter(maxLines)` (streaming) and `filterReply` replace code in tutor replies beyond `maxLines` lines / `maxLines × 50` chars (300) per reply (fenced blocks and unfenced code-like runs) with `REMOVED_EXAMPLE`; a block is held until it ends or passes the limit; `looksLikeCode` classifies a line after `unwrapLine` strips backticks, `>` quotes, list markers and line numbers (audit R16-1), and counts tuple assignments, bare calls and bracket-heavy lines; `isFence` also sees quoted/listed fences |
| `contest-clock.ts` | `contestClock(input, now)`: phase, start/end/freeze times, time left, frozen, elapsed; actual start, pauses and extra minutes (ADR-028) |
| `scoring.ts` | `[claude]` `computeStandings`: ADR-009 components (constants ADR-028: problem values, decay, token median, resource vs reference), overrides, ranking with tie-breaks; `decayedPoints` ported from JojoCode, with ADR-034's penalty (`rejectionCost`: 20% of the value per counted rejection, after the decay floor, unsolved problems too; correctness total ≥ 0) |
| `process-metrics.ts` | `computeProcessMetrics`: deterministic per-problem metrics for the batch judge (WP-07): prompts, tokens, attempts, rejections before AC, time to AC, tokens after AC, time/memory ratio vs reference |
| `judge-prompt-v1.ts` | `[claude]` judge prompt v1 (`JUDGE_RUBRIC_VERSION` `judge-v1`): ADR-018 rubric in the system message only; participant data as tag-safe JSON (`untrustedJson`); `buildJudgeMessages`; `injectionHints` (patterns on prompts + final code, OR-ed with the model's flag) |
| `judge-prompt-v2.ts` | `[claude]` judge prompt v2 (`JUDGE_RUBRIC_VERSION_V2` = `judge-v2`, ADR-033 tutor mode): rubric questionQuality / independence / debugging / improvement / complexity / tokenEconomy in the system message, participant data via v1's `untrustedJson`, `injectionHintsV2` on questions + final code. Used by the batch judge |
| `similarity.ts` | `similarityFlags`: pairs of participants with near-identical prompts or code on one problem (5-token shingle Jaccard ≥ 0.85, texts under 10 tokens skipped); integrity flag only, never a score change |
| `integrity-flags.ts` | ADR-033 integrity flags (never a score change): `saveBursts` (saves growing > `SAVE_BURST_CHARS` within 30 s; restores skipped), `shownCodeLines`, `aiCopy` (final-code lines found in the tutor's shown code; both sides through `unwrapLine`), `codeHeavyQuestions`; uses `looksLikeCode` |

## Affects / depends on
- Used by: `apps/web/src/server/*` (prompt, participant, submission, leaderboard services), `apps/worker/src/queue.ts` (languages). `process-metrics.ts`, `similarity.ts`, `integrity-flags.ts` and `judge-prompt-v1.ts` feed the WP-07 batch judge (not wired yet).
- Depends on: `@codehaunt/contracts` types and `MAX_SOURCE_BYTES`.
- Changing `verdict-projection.ts` changes what every participant sees of every run.
- Changing a constant in `scoring.ts` changes every score and rank (live board, projector, export).

## Entry points & how to test
`npm test -w @codehaunt/core`.

## Gotchas
- Never edit `judge-prompt-v1.ts` in place once reviews exist: add `judge-prompt-v2.ts` with a new version (stored per review).
- `verdict-projection.ts` is security-critical: never return `internalError`, hidden-test output, or time/memory of a
  failed submission (a side channel on hidden inputs, audit run-9 M2).
- `reply-filter.ts` must stay linear on long input (model replies are untrusted): line regexes only, anchored, no nested quantifiers. Streamed and whole-reply output must stay identical (a test feeds every chunk size).
