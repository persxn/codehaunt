# contracts/src
Schema modules of `@codehaunt/contracts`, re-exported from `index.ts`.

## Contents
| Path | What it does |
|---|---|
| `index.ts` | barrel |
| `judge.ts` | `Language`, `Verdict`, `Checker`, `RunRequest`/`RunResult` (CodeRunner I/O), `MAX_SOURCE_BYTES` |
| `auth.ts` | `LoginRequest`, `Role`, `Me` (+ `mustChangePassword`), `ApiError` (error envelope with request ID) |
| `judge-review.ts` | batch judge I/O (WP-07): `JudgeInput` (per problem: statement, metrics, transcript of prompts/replies/run counts, final code; capped), `JudgeOutput` (strict: per-problem score 0–100, six ADR-018 criteria 0–5, complexity achieved/optimal, rationale; overall; injection flag + evidence), `judgeOutputMismatch` |
| `event-config.ts` | `EventConfig` (ADR-006: schedule, budgets incl. `replyTokens`, model (`maxExampleLines` default 0 = tutor in words only, ADR-046; was 3, ADR-038), scoring weights, leaderboard incl. `appealMinutes`, access, consent), `EventStatus`, `LIVE_EDITABLE_KEYS` |
| `problem.ts` | `ProblemInput` (organizer authoring, with per-language `solutions`), `SolutionInput`, `SolutionKind`, `ParticipantProblem` (participant view, strict), `Difficulty`; `hintsOnly` on `ProblemInput` (ADR-042) |
| `prompt.ts` | `PromptRequest`, `PromptResponse`, `PromptUsage`, `PromptStreamEvent` (NDJSON lines of the prompt stream) |
| `gateway.ts` | `GatewayChatRequest` (OpenAI chat + `codehaunt` caps: budgetTokens, contextLimit, sessionId), `GatewayError`, `GatewayUsage` (ADR-022) |
| `submission.ts` | `SubmissionRequest`, `ParticipantVerdict` (strict), `SubmissionKind`, `SubmissionStatus` |
| `contest.ts` | participant screen shapes: `ContestState`, `ProblemSummary`, `Workspace`, `RunView`, `NewSessionRequest`, `RevertRequest`, `ChangePasswordRequest` |
| `ops.ts` | contest operations (WP-05): `ContestControlRequest`, `ExtendRequest` (idempotent), `ProjectorLinkRequest`, `TopUpRequest` (idempotent), `ExtraTimeRequest`, `ParticipantActionRequest`, `IncidentActionRequest`, `ScoreOverrideRequest`, `ResultsRequest`, `ProjectorView` (public, strict) |
| `admin.ts` | admin/desk shapes: `EventCreate/UpdateRequest`, `ParticipantRow`, `ParticipantImportRequest` (loose rows with `line`, `dryRun`; rows are checked one by one on the server), `ImportIssue`, `IMPORT_MAX_ROWS`, `BadgeRequest`, `CheckInRequest`, `StaffCreateRequest`, `RoleChangeRequest`, `PasswordResetRequest` (new password or `eventDefault`), `DefaultPasswordRequest`, `ParticipantDeleteRequest`, `ConsentRequest` |

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
- `ProjectorView` is served without login: it must stay rank, name, solved (and the total once final), strict.
