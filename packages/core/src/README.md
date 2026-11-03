# core/src
Framework-free business logic of `@codehaunt/core`: pure functions, no I/O, no clock reads.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `language.ts` | the four languages: contract name ↔ DB enum, display label, code-fence tags (`LANGUAGES`, `toDbLanguage`, `fromDbLanguage`) |
| `verdict-projection.ts` | `[claude]` `toParticipantVerdict`: what a participant may see of a run (counts; time/memory only for samples and Accepted submissions, ADR-027; visible-test detail; CE log) |
| `extract-code.ts` | `extractCode(reply, language)`: last fenced block tagged with the language, else the last untagged one; size-capped |
| `contest-clock.ts` | `contestClock(input, now)`: phase, start/end/freeze times, time left, frozen |

## Affects / depends on
- Used by: `apps/web/src/server/*` (prompt, participant, submission services), `apps/worker/src/queue.ts` (languages).
- Depends on: `@codehaunt/contracts` types and `MAX_SOURCE_BYTES`.
- Changing `verdict-projection.ts` changes what every participant sees of every run.

## Entry points & how to test
`npm test -w @codehaunt/core`.

## Gotchas
- `verdict-projection.ts` is security-critical: never return `internalError`, hidden-test output, or time/memory of a
  failed submission (a side channel on hidden inputs, audit run-9 M2).
- `extract-code.ts` must stay linear on long input (model replies are untrusted); use `trimEnd()`, not trailing-space regexes.
