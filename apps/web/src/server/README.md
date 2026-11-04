# server
Framework-free services behind the API routes (standards §2: routes → services → Prisma). Route handlers parse,
authorise and call one function here; nothing here imports Next.

## Contents
| Path | What it does |
|---|---|
| `errors.ts` | `AppError` and helpers (`notFound`, `forbidden`, `badRequest`, `conflict`, `contestNotRunning`); mapped to `ApiError` in `lib/route.ts` |
| `contest.ts` | `participantContext` (live event, contest clock incl. pauses and the participant's extra minutes, consent gate), `eventClock`, `openProblem` (practice before the start, others while running), `visible` |
| `system-prompt.ts` | `[claude]` tutor persona `tutor-v1` (ADR-033; unknown versions, incl. the retired junior `v1`, fall back to it) + the language the participant writes + the example-line limit |
| `gateway-client.ts` | `[claude]` `ModelClient` / `GatewayClient`: gateway-a, fallback to gateway-b only before any byte; compact SSE parse; no usage = failure |
| `prompt-service.ts` | `[claude]` `startPrompt` (ADR-033): reserve → stream through the reply filter → settle (0 without usage) → store the unfiltered reply; the model gets the tutor prompt + this session's questions and *filtered* replies, never the code or statement; replies never create code versions; one question in flight per participant |
| `participant-service.ts` | contest state (tokens, phase, consent, question limit), problem list/statement (visible tests only), workspace (replies filtered), `saveCode` (ADR-033: the participant's own code; unchanged saves add nothing; first save opens a chat), new (empty) chat, revert, `recordConsent`, `visibleTestIds` |
| `submission-service.ts` | `createRun` (idempotent, ≤ 2 active per participant; stamps `contestMs`) and `runView` (verdict projection only) |
| `checkin-service.ts` | `[claude]` badges (password + single-use `CH1:` code, only its SHA-256 stored; all-or-nothing with the audit row), `checkInOpen`, `deskVisible` (one rule for the scanner and the desk), `checkIn` (cap, activation, token grant, audit), `promoteFromWaitlist` |
| `event-service.ts` | Event editor: list/get/create/update; `isLocked` (lockedAt, status past check-in, or start time passed); then only budget and schedule change; a budget change adjusts every checked-in balance in the same transaction |
| `problem-admin-service.ts` | problems with visible/hidden tests and reference/naive solutions; frozen once locked; calibration runs (audit-logged, refused once locked) |
| `participant-admin-service.ts` | CSV/form import (waitlist beyond the cap; re-imported people inactive again), desk list, export (incl. ledger, sign-ins, audit trail), anonymise every derived text (ADR-010) |
| `contest-ops-service.ts` | WP-05 (ADR-028): `controlContest` (open check-in, start sets `lockedAt`, pause/resume fold `pausedMs`, end), `extendContest`, `contestStatus`, `topUp` (idempotent, audited in one tx), `setExtraTime`, `participantAction(In)` (disqualify, reinstate, end session, deactivate), `publishResults` (appeal window), `newProjectorLink` (hash only, reason), `freezeCut` (stored `frozenAt`, never moves); extend idempotent per key; participant actions take the participant row lock |
| `leaderboard-service.ts` | `[claude]` loads one event for `computeStandings` (core): SUBMITs on contest problems, reversed penalties, tokens on contest problems, REFERENCE calibrations, judge reviews, overrides; `adminLeaderboard`, `projectorView` (stores `frozenAt` once; the cut filters verdicts, prompts, overrides, reversals, judge reviews; disqualification applies at once), `resultsCsv` (formula-safe), `overrideScore` |
| `incident-service.ts` | ADR-021: `listIncidents` (incidents table, `auth.session_replaced`, `slowedUsernames()`, FAILED runs), `actOnIncident` (reverse penalty, re-judge — clears reversals —, dismiss, end session, deactivate); `internalError` text for ADMIN only |
| `participant-log-service.ts` | `participantLog` (prompts, replies, code, runs with per-test results — output only for visible tests —, ledger, actions), `opsParticipants` |
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
  the payloads and the SQL. Admin services (`problem-admin-service.ts`) return hidden tests: admin routes only.
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
