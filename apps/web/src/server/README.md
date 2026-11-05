# server
Framework-free services behind the API routes (standards §2: routes → services → Prisma). Route handlers parse,
authorise and call one function here; nothing here imports Next.

## Contents
| Path | What it does |
|---|---|
| `errors.ts` | `AppError` and helpers (`notFound`, `forbidden`, `badRequest`, `conflict`, `contestNotRunning`); mapped to `ApiError` in `lib/route.ts` |
| `contest.ts` | `participantContext` (live event, contest clock incl. pauses and the participant's extra minutes, consent gate), `eventClock`, `openProblem` (practice before the start, others while running; returns `hintsOnly`), `visible` |
| `system-prompt.ts` | `[claude]` tutor personas `tutor-v1` (ADR-033) and `tutor-v2` (ADR-042: hint ladder, concept vs. task, never a complete solution; new events and unknown versions get it) + the language + the example-line limit + this turn's steering line |
| `gateway-client.ts` | `[claude]` `ModelClient` / `GatewayClient`: gateway-a, fallback to gateway-b only before any byte; compact SSE parse; no usage = failure |
| `prompt-service.ts` | `[claude]` `startPrompt` (ADR-033, ADR-042): classify the question (`classifyIntent`), hint level from this chat's earlier questions, steering line in the system prompt for this turn only; reserve → stream through the reply filter with `tutorLimits` (hints-only problems: no code or pseudo-code; 12 code lines per chat) → settle (0 without usage) → store the unfiltered reply and the `guardrail` record (logged when something was removed or the answer was asked for); history, replay and workspace re-filter each turn with `limitsFromGuardrail`, so every view equals what the participant saw; never the code or statement; one question in flight per participant |
| `participant-service.ts` | contest state (tokens, phase, consent, question limit), problem list/statement (visible tests only), workspace (replies filtered), `saveCode` (ADR-033: the participant's own code; unchanged saves add nothing; first save opens a chat), new (empty) chat, revert; saves and reverts limited per participant (audit R16-2: 30 a minute → 429, 3,000 versions or 8 M chars in total → 409 `code_storage_full`), `recordConsent`, `visibleTestIds` |
| `submission-service.ts` | `createRun` (idempotent, ≤ 2 active per participant; stamps `contestMs`) and `runView` (verdict projection only) |
| `checkin-service.ts` | `[claude]` badges (password + single-use `CH1:` code, only its SHA-256 stored; all-or-nothing with the audit row; with an event password (ADR-041) no badge password: the account gets the event default + forced change), `checkInOpen`, `deskVisible` (one rule for the scanner and the desk), `checkIn` (cap, activation, token grant, audit), `promoteFromWaitlist` |
| `event-service.ts` | Event editor: list/get/create/update; `isLocked` (lockedAt, status past check-in, or start time passed); then only budget and schedule change; a budget change adjusts every checked-in balance in the same transaction |
| `problem-admin-service.ts` | problems with visible/hidden tests and reference/naive solutions; frozen once locked; calibration runs (audit-logged, refused once locked) |
| `draft-service.ts` | WP-07 task 8: `listDrafts`, `decideDraft` (approve → HIDDEN test or the NAIVE solution for that language; reject; under the editor's event lock; audited). ADMIN routes only: drafts are hidden tests |
| `review-service.ts` | WP-07 task 6: `queueJudging` (contest ended, one job per checked-in participant, audited), `requeueJudgeJob`, `reviewBoard` (newest overall + per-problem judge reviews, injection evidence and hints, ADR-033 flags, cross-participant similarity, process-quality override) |
| `participant-admin-service.ts` | strict import (ADR-044): every row checked with line + column issues (format, duplicates in the file, already registered, staff username, email of another account, live elsewhere), dry run or all-or-nothing commit; waitlist beyond the cap; re-imported people inactive again; event default password applied (ADR-041). Desk list (incl. signed in now, still on the event password), export (incl. ledger, sign-ins, audit trail), `removeParticipant` / `removalMode` (hard delete without activity, else anonymise), anonymise every derived text (ADR-010) |
| `default-password-service.ts` | `[claude]` ADR-041: `setEventDefaultPassword` (strength rules, hash only, applied to not-yet-checked-in and still-on-default participants, never to someone live at another event; sessions end; audit without the secret), `applyEventDefault`, `resetToEventDefault` |
| `setup-service.ts` | ADR-044: `getSetup` (seven roadmap steps derived from the event, its problems, participants and `setup:NN` audit rows; `required` / `todo` / `warning` issues), `launchBlockers`, `assertLaunchable` (also used by `controlContest`'s open check-in), `setupReason` |
| `dashboard-service.ts` | ADR-044: `platformDashboard` and `eventDashboard`: counts only (events by status, participants, live sessions, tutor questions and guardrail hits, submissions, tokens used = reservations minus releases, incidents) |
| `contest-ops-service.ts` | WP-05 (ADR-028): `controlContest` (open check-in — refused while setup's required items fail, ADR-044 —, start sets `lockedAt`, pause/resume fold `pausedMs`, end), `extendContest`, `contestStatus`, `topUp` (idempotent, audited in one tx), `setExtraTime`, `participantAction(In)` (disqualify, reinstate, end session, deactivate), `publishResults` (appeal window), `newProjectorLink` (hash only, reason), `freezeCut` (stored `frozenAt`, never moves); extend idempotent per key; participant actions take the participant row lock |
| `leaderboard-service.ts` | `[claude]` loads one event for `computeStandings` (core): SUBMITs on contest problems, reversed penalties, tokens on contest problems, REFERENCE calibrations, judge reviews (the newest overall row per participant, WP-07), overrides; `adminLeaderboard`, `projectorView` (stores `frozenAt` once; the cut filters verdicts, prompts, overrides, reversals, judge reviews; disqualification applies at once), `resultsCsv` (formula-safe), `overrideScore` |
| `incident-service.ts` | ADR-021: `listIncidents` (incidents table, `auth.session_replaced`, `auth.seb_refused`, `slowedUsernames()`, FAILED runs), `actOnIncident` (reverse penalty, re-judge — clears reversals —, dismiss, end session, deactivate); `internalError` text for ADMIN only |
| `participant-log-service.ts` | `participantLog` (prompts, replies with their guardrail record, code, runs with per-test results — output only for visible tests —, ledger, actions), `opsParticipants` |
| `staff-service.ts` | staff create/remove (organizers: volunteers only), the one `changeRole`, password resets; `AccessGroupSync` (no-op until WP-06) |

## Affects / depends on
- Used by: `apps/web/src/app/api/**/route.ts`; tested directly by `apps/web/test/*-flow.test.ts`.
- Depends on: `@codehaunt/db` (Prisma, token ledger), `@codehaunt/auth`, `@codehaunt/core`, `@codehaunt/contracts`;
  env `GATEWAY_URL`, `GATEWAY_FALLBACK_URL`, `GATEWAY_TOKEN` (via `lib/services.ts`).
- Changing `participant-service.ts`/`submission-service.ts` changes what participants can see: keep the hidden-test tests green.

## Entry points & how to test
`npm test -w @codehaunt/web` (PGlite; no server, no gateway: `test/support/fixtures.ts` fakes the model).

## Gotchas
- Hidden tests: every participant `test_cases` query filters `visibility: 'VISIBLE'`; `participant-flow.test.ts` checks
  the payloads and the SQL. Admin services (`problem-admin-service.ts`, `draft-service.ts`) return hidden tests: ADMIN routes only.
- Imports between these files are relative with `.ts` so the tests can load them with plain Node.
- Token ledger invariant: negative deltas only via `reserveTokens`/`adjustTokens` (participant row lock).
- Check-in, budget changes, imports and problem edits lock the event row with `FOR NO KEY UPDATE` (never `FOR UPDATE`:
  ledger inserts hold a key-share lock on the event, and `FOR UPDATE` deadlocks with prompts; `budget-concurrency.test.ts`).
  That lock is what keeps the cap and the budget snapshot right.
- The audit log is append-only and outlives anonymisation: write counts, ids and reasons there, never names, enrolment numbers or IPs.
- Organizers may not see hidden tests: `participant-log-service.ts` strips hidden-test output; incident `internalError` is staff-only plain text (ADR-021).
- `projectorView` is public: it returns `ProjectorView` (strict) only.
- `inFlight` in `prompt-service.ts` is per process: the web runs as one process (ADR-003).
- Participants only ever get tutor replies through `filterReply` (stream, `responseFor`, `workspace`); staff views (`participant-log-service.ts`) and the judge read the stored, unfiltered reply.
