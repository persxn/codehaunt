# contracts/src
Schema modules of `@codehaunt/contracts`, re-exported from `index.ts`.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `judge.ts` | `Language`, `Verdict`, `Checker`, `RunRequest`/`RunResult` (CodeRunner I/O), `MAX_SOURCE_BYTES` |
| `auth.ts` | `LoginRequest`, `Role`, `Me`, `ApiError` (error envelope with request ID) |
| `event-config.ts` | `EventConfig` (ADR-006: schedule, budgets, model, scoring weights, access, consent), `EventStatus`, `LIVE_EDITABLE_KEYS` |
| `problem.ts` | `ProblemInput` (organizer authoring), `ParticipantProblem` (participant view, strict), `Difficulty` |
| `prompt.ts` | `PromptRequest`, `PromptResponse`, `PromptUsage` |
| `gateway.ts` | `GatewayChatRequest` (OpenAI chat + `codehaunt` caps: budgetTokens, contextLimit, sessionId), `GatewayError`, `GatewayUsage` (ADR-022) |
| `submission.ts` | `SubmissionRequest`, `ParticipantVerdict` (strict), `SubmissionKind`, `SubmissionStatus` |

## Affects / depends on
- Used by: `apps/web`, `apps/worker`, `apps/gateway`, `scripts/seed.ts`.
- Depends on: zod 4.
- Changing `EventConfig` changes what the event editor accepts and what stored `events.config` must contain.

## Entry points & how to test
`npm test -w @codehaunt/contracts`.

## Gotchas
- `EventConfig` nested sections use `.prefault({})`: zod 4's `.default({})` would return `{}` without applying field defaults.
- `RunRequest` contains expected outputs; it never leaves the worker. `RunResult.results[].outputExcerpt` must be stripped for
  hidden tests before anything participant-facing.
