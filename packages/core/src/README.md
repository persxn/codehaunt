# core/src
Framework-free business logic of `@codehaunt/core`: pure functions, no I/O, no clock reads.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `language.ts` | the four languages: contract name ↔ DB enum, display label, code-fence tags (`LANGUAGES`, `toDbLanguage`, `fromDbLanguage`) |
| `verdict-projection.ts` | `[claude]` `toParticipantVerdict`: what a participant may see of a run (counts; time/memory only for samples and Accepted submissions, ADR-027; visible-test detail; CE log) |
| `extract-code.ts` | `extractCode(reply, language)`: last fenced block tagged with the language, else the last untagged one; size-capped |
| `contest-clock.ts` | `contestClock(input, now)`: phase, start/end/freeze times, time left, frozen, elapsed; actual start, pauses and extra minutes (ADR-028) |
| `scoring.ts` | `[claude]` `computeStandings`: ADR-009 components (constants ADR-028: problem values, decay, token median, resource vs reference), overrides, ranking with tie-breaks; `decayedPoints` ported from JojoCode |
| `process-metrics.ts` | `computeProcessMetrics`: deterministic per-problem metrics for the batch judge (WP-07): prompts, tokens, attempts, rejections before AC, time to AC, tokens after AC, time/memory ratio vs reference |
| `judge-prompt-v1.ts` | `[claude]` judge prompt v1 (`JUDGE_RUBRIC_VERSION` `judge-v1`): ADR-018 rubric in the system message only; participant data as tag-safe JSON (`untrustedJson`); `buildJudgeMessages`; `injectionHints` (patterns on prompts + final code, OR-ed with the model's flag) |
| `similarity.ts` | `similarityFlags`: pairs of participants with near-identical prompts or code on one problem (5-token shingle Jaccard ≥ 0.85, texts under 10 tokens skipped); integrity flag only, never a score change |

## Affects / depends on
- Used by: `apps/web/src/server/*` (prompt, participant, submission, leaderboard services), `apps/worker/src/queue.ts` (languages). `process-metrics.ts`, `similarity.ts` and `judge-prompt-v1.ts` feed the WP-07 batch judge (not wired yet).
- Depends on: `@codehaunt/contracts` types and `MAX_SOURCE_BYTES`.
- Changing `verdict-projection.ts` changes what every participant sees of every run.
- Changing a constant in `scoring.ts` changes every score and rank (live board, projector, export).

## Entry points & how to test
`npm test -w @codehaunt/core`.

## Gotchas
- Never edit `judge-prompt-v1.ts` in place once reviews exist: add `judge-prompt-v2.ts` with a new version (stored per review).
- `verdict-projection.ts` is security-critical: never return `internalError`, hidden-test output, or time/memory of a
  failed submission (a side channel on hidden inputs, audit run-9 M2).
- `extract-code.ts` must stay linear on long input (model replies are untrusted); use `trimEnd()`, not trailing-space regexes.
