# judge-review
The batch process-quality judge (WP-07, ADR-033 rubric `judge-v2`, route ADR-035) and GPT-OSS drafting. Runs once
after the contest (drafts: before it) in the one-shot `judge-review` container, which sits on the internal `db`
network only and reaches Ollama through the `judge-relay` container's unix socket. The long-running worker never
calls any of it.

## Contents
| Path | What it does |
|---|---|
| `main.ts` | entry point: validates `DATABASE_URL`, `JUDGE_RELAY_SOCKET` (container) or `JUDGE_OLLAMA_URL` (development), `JUDGE_MODEL`, `JUDGE_THINK`; drains the queue, or `drafts <eventId>`; exits |
| `relay.ts` | `[claude]` the `judge-relay` container: unix socket → Ollama on 127.0.0.1, `POST /api/chat` only, body ≤ 1 MiB (audit R14-4) |
| `review.ts` | `[claude]` `claimJudgeJob` (SKIP LOCKED), `requeueStuckJudgeJobs` (45 min; NEEDS_MANUAL after 3 attempts), `askJudge` (≤ 3 calls: try, repair turn, fresh try), `parseJudgeReply` (JSON, `JudgeOutputV2`, the per-call rubric check code (R14-NV1), exact problem coverage), `judgeJob` (writes per-problem + overall `judge_reviews` and DONE in one transaction, or NEEDS_MANUAL), `drainJudgeQueue` |
| `build-input.ts` | `[claude]` `buildJudgeInput` (+ `fitToBudget`, `InputTooLarge`): one participant's `JudgeInputV2` from the DB (questions, replies filtered exactly as shown via `limitsFromGuardrail` (ADR-042), saves with burst flags, runs/submits as verdict + counts, ≤ 4 snapshots, final code = first accepted version or newest, metrics, integrity flags) |
| `drafts.ts` | WP-07 task 8: `draftForEvent` asks GPT-OSS per problem for 3–6 small edge-case tests + one naive solution (`DraftReply`), stores `problem_drafts`; refused once the event is locked. Run: `... run --rm judge-review drafts <eventId>` |
| `ollama.ts` | `OllamaJudgeModel`: Ollama `/api/chat` over the relay socket or a URL, `format` = the output JSON schema, `think` low, temperature 0, `NUM_CTX` 32k (JojoAI's too, so no reload), 10-minute timeout |

## Affects / depends on
- Reads events, problems, chat sessions, prompt turns, code versions, submissions + verdicts, calibration runs;
  writes `judge_reviews`, `judge_jobs` and (drafts) `problem_drafts` (worker role grants, `packages/db/src/app-role.ts`).
- The leaderboard's process-quality component reads the newest overall row (problemId null) per participant.
- Depends on `@codehaunt/core` (`judge-prompt-v2`, `integrity-flags`, `process-metrics`, `reply-filter`).

## Entry points & how to test
`npm test -w @codehaunt/worker` (`test/judge-review.test.ts`, PGlite + a fake model). Real run: `scripts/judge-golden.ts`.

## Gotchas
- Hidden tests never enter the input: submissions contribute verdict and counts only (a test asserts it).
- The judge sees replies as the participant saw them (filtered); staff still see the stored, unfiltered reply.
- `judge_jobs.error` holds our own messages (schema paths, counts, size, transport errors), never participant or model text.
- The input is budgeted (`MAX_INPUT_CHARS`, `fitToBudget`: replies, snapshots, questions, transcript middle, code,
  then a harder round); the steps taken go into the overall review's `raw.trimmed`. Still too big → NEEDS_MANUAL.
- One participant whose input fails never stops the batch; a job that keeps killing the process ends NEEDS_MANUAL.
